import { Buffer } from 'node:buffer';

/**
 * dsh-turn-sieve — selective conversation pruning for DeepSeek Harness.
 *
 * The Session log is append-only. This plugin never deletes log records; it
 * appends empty `system/message` events carrying a `replace` surface operation
 * over an exact, contiguous span of the current surface. The shadowed messages
 * therefore stop entering future model requests while the raw Session remains
 * complete for audit/export.
 *
 * Two units are offered:
 *   - `group`: a whole user/assistant exchange (tool calls stay with results);
 *   - `message`: one message, except an assistant tool-call message which is
 *     kept atomic with its consecutive tool results.
 *
 * Undo is append-only too: it appends copies of the shadowed messages at the
 * end of the surface and leaves the empty markers in place. The restored
 * content is therefore visible to the model again, but at the end of history.
 */

export const name = 'dsh-turn-sieve';
export const inject = ['webServer', 'sessions', 'tools', 'tokenMeter'];

const GROUPS_PATH = '/api/dsh-turn-sieve/groups';
const PRUNE_PATH = '/api/dsh-turn-sieve/prune';
const UNDO_PATH = '/api/dsh-turn-sieve/undo';
const LOOKUP_PATH = '/api/dsh-turn-sieve/lookup';
const HIDDEN_PATH = '/api/dsh-turn-sieve/hidden';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RANGES = 200;

/**
 * In-memory undo ledger: one entry per live Session, replaced by every new
 * prune. A page refresh keeps it; a DSH host restart clears it.
 */
const undoBySession = new Map();

/**
 * In-memory supplement for the chat-view hide set of the most recent prune.
 * The authoritative source is the durable marker id (see PRUNE_MARKER), so a
 * page refresh or host restart still hides the same content.
 */
const hiddenBySession = new Map();

/** Truncate a preview without splitting a surrogate pair. */
function truncate(value, length) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= length) return text;
  return `${Array.from(text).slice(0, length).join('')}…`;
}

/** Injected per-step context is a user/message in the log but not user input. */
const INTERNAL_USER_PREFIXES = [
  'Time sampled while preparing',
  'Elapsed since the preceding step context',
  'Current runtime context.',
  '<system-reminder>',
  '<hindsight_pages>',
  '<hindsight_page_refresh>',
  '[Compressed conversation section]',
  'The following information describes your current session:',
  'The following information describes your current session. It replaces earlier versions',
];

function isInternalUserText(text) {
  const value = String(text ?? '').trimStart();
  return INTERNAL_USER_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * DSH 0.2.2-rc.2 logs runtime context as user/message with
 * source.kind === 'runtime-context'. Prefer that structural marker and keep
 * the text prefixes as a fallback for older session files.
 */
function isInternalUserMessage(message) {
  return message?.source?.kind === 'runtime-context' || isInternalUserText(messageText(message));
}

/** Human-readable text from a message's content blocks. */
function messageText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  const parts = [];
  for (const block of message.content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'reasoning' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'tool-call') parts.push(`[tool ${String(block.name ?? 'call')}]`);
    else if (block.type === 'tool-result') parts.push('[tool result]');
    else if (block.type === 'image') parts.push('[image]');
    else if (block.type === 'file') parts.push('[file]');
  }
  return parts.join(' ');
}

function countToolCalls(message) {
  if (!message || !Array.isArray(message.content)) return 0;
  return message.content.filter((block) => block && block.type === 'tool-call').length;
}

function toolCallIds(message) {
  if (!message || !Array.isArray(message.content)) return [];
  const ids = [];
  for (const block of message.content) {
    if (!block || block.type !== 'tool-call') continue;
    const id = block.id ?? block.toolCallId;
    if (typeof id === 'string' && id !== '') ids.push(id);
  }
  return ids;
}

function hasToolChange(message) {
  if (!message || !Array.isArray(message.content)) return false;
  return message.content.some((block) => block && (block.type === 'tool-addition' || block.type === 'tool-removal'));
}

function approximateTokens(event) {
  const message = event.type === 'user/message' ? event.data : event.data?.message;
  if ((event.type === 'system/message' || event.type === 'developer/message' || event.type === 'assistant/message')
    && Array.isArray(message?.content) && message.content.length === 0) {
    return 0;
  }
  try {
    return Math.max(1, Math.ceil(JSON.stringify(event.data ?? '').length / 4));
  } catch {
    return 0;
  }
}

function isBusy(events) {
  let lastStart = -1;
  let lastEnd = -1;
  for (const event of events) {
    if (event.type === 'turn/start') lastStart = event.seq;
    else if (event.type === 'turn/end') lastEnd = event.seq;
  }
  return lastStart > lastEnd;
}

function messageOf(event) {
  return event.type === 'user/message' ? event.data : event.data?.message;
}

function toolResultCallId(event) {
  if (event.type !== 'tool/result') return '';
  const message = event.data?.message;
  const id = message?.toolCallId ?? message?.source?.callId;
  return typeof id === 'string' ? id : '';
}

/**
 * Chat node keys follow the client formula `${kind.length}:${kind}${id}`
 * (dsh-client-ui-conversation `contract/conversation.ts` conversationContextKey,
 * rendered by ChatNodeSeat as `data-chat-node-key`). Mapping a durable event to
 * its node key lets the UI hide exactly the nodes a prune shadowed, without ever
 * touching the append-only log.
 */
function contextKey(kind, id) {
  return `${kind.length}:${kind}${id}`;
}

function nodeKeysForEvent(event) {
  const keys = [];
  const type = event?.type;
  const data = event?.data;
  const message = typeof type === 'string' ? messageOf(event) : undefined;
  const id = typeof message?.id === 'string' ? message.id : '';
  if (type === 'user/message' && id !== '') keys.push(contextKey('input-message', id));
  else if (type === 'developer/message' && id !== '') keys.push(contextKey('developer-message', id));
  else if (type === 'system/message' && id !== '') keys.push(contextKey('system-prompt', id));
  else if (type === 'tool/call' && typeof data?.callId === 'string' && data.callId !== '') {
    keys.push(contextKey('tool-call', data.callId));
  } else if (type === 'tool/result') {
    const callId = toolResultCallId(event);
    if (callId !== '') keys.push(contextKey('tool-call', callId));
  }
  if ((type === 'assistant/message' || type === 'assistant/live-chunk' || type === 'step/start')
    && typeof data?.turn === 'number' && typeof data?.step === 'number') {
    keys.push(contextKey('assistant-step', `${data.turn}:${data.step}`));
  }
  return keys;
}

/** Node keys of every durable event inside the inclusive span. */
function nodeKeysForSpan(bySeq, startSeq, endSeq) {
  const keys = new Set();
  for (let seq = startSeq; seq <= endSeq; seq += 1) {
    const event = bySeq.get(seq);
    if (!event) continue;
    for (const key of nodeKeysForEvent(event)) keys.add(key);
  }
  return Array.from(keys);
}

function durableBySeq(session) {
  return new Map(Array.from(session?.snapshotEvents?.() ?? []).map((event) => [event.seq, event]));
}

/**
 * Prune markers carry their shadowed span (and, for whole exchanges, the turns
 * they fully covered) in the message id, so the hide set can be rebuilt from the
 * log alone: `turn-sieve-<stamp>-<index>-r<startSeq>-<endSeq>[-t<turn_turn>]`.
 * Undo copies carry `turn-sieve-restored-<stamp>-<index>-r<startSeq>-<endSeq>`.
 */
const PRUNE_MARKER = /^turn-sieve-(?!restored-)[a-z0-9]+-\d+-r(\d+)-(\d+)(?:-t([\d_]+))?$/;
const RESTORE_MARKER = /^turn-sieve-restored-[a-z0-9]+(?:-\d+)?-r(\d+)-(\d+)$/;

function pruneMarkerId(stamp, index, unit, mode) {
  const turns = mode === 'group' && Array.isArray(unit.fullTurns) && unit.fullTurns.length > 0
    ? `-t${unit.fullTurns.join('_')}`
    : '';
  return `turn-sieve-${stamp}-${index}-r${unit.startSeq}-${unit.endSeq}${turns}`;
}

/** Read the surface and price each node once for both picker modes. */
function measureSurface(session, tokenMeter) {
  const nodes = Array.from(session?.surface?.nodes ?? []);
  const events = Array.from(session?.snapshotEvents?.() ?? []);
  const bySeq = new Map(events.map((event) => [event.seq, event]));

  const measured = new Map();
  let totalTokens = 0;
  let surfaceTokens = 0;
  if (tokenMeter && typeof tokenMeter.measure === 'function') {
    try {
      const measurement = tokenMeter.measure(session);
      for (const node of measurement?.nodes ?? []) measured.set(node.seq, node.tokens);
      if (typeof measurement?.totalTokens === 'number') totalTokens = measurement.totalTokens;
      if (typeof measurement?.surfaceTokens === 'number') surfaceTokens = measurement.surfaceTokens;
    } catch {
      // Measurement is advisory; the picker still works with an estimate.
    }
  }
  const turnSpan = new Map();
  for (const seq of nodes) {
    const turn = bySeq.get(seq)?.data?.turn;
    if (typeof turn !== 'number') continue;
    const span = turnSpan.get(turn);
    if (span === undefined) turnSpan.set(turn, { minSeq: seq, maxSeq: seq });
    else {
      if (seq < span.minSeq) span.minSeq = seq;
      if (seq > span.maxSeq) span.maxSeq = seq;
    }
  }
  return { nodes, events, bySeq, measured, totalTokens, surfaceTokens, turnSpan };
}

/** Turns whose every surface event lies inside this unit: safe to hide wholesale. */
function fullTurnsOf(unit, turnSpan) {
  if (!Array.isArray(unit.turns)) return [];
  return unit.turns.filter((turn) => {
    const span = turnSpan.get(turn);
    return span !== undefined && span.minSeq >= unit.startSeq && span.maxSeq <= unit.endSeq;
  });
}

function tokenFor(measured, event) {
  const value = measured.get(event.seq);
  return typeof value === 'number' ? value : approximateTokens(event);
}

function beginGroup(seq) {
  return {
    id: String(seq),
    startSeq: seq,
    endSeq: seq,
    seqs: [],
    messageIds: [],
    parts: { user: 0, assistant: 0, tool: 0, system: 0, developer: 0 },
    tokens: 0,
    turn: undefined,
    turns: [],
    fullTurns: [],
    userPreview: '',
    assistantPreview: '',
    toolCalls: 0,
    hasToolChange: false,
  };
}

/**
 * Group the current surface into exchanges. A new exchange begins at every real
 * user prompt; the leading system/developer context forms its own protected
 * group. Whole exchanges are removed together, so a tool-call/tool-result pair
 * can never be split.
 *
 * @param session - live Session instance.
 * @param tokenMeter - optional tokenMeter service.
 * @returns serializable state for the picker and the agent tool.
 */
export function collectGroups(session, tokenMeter) {
  const { nodes, events, bySeq, measured, totalTokens, surfaceTokens, turnSpan } = measureSurface(session, tokenMeter);
  const groups = [];
  let current = null;

  for (const seq of nodes) {
    const event = bySeq.get(seq);
    if (!event) continue;
    if (event.type === 'user/message') {
      // DSH also logs per-step runtime context as user/message. Only a real
      // user prompt starts a new exchange; injected context joins the current
      // one so a prompt and its work stay a single selectable unit.
      const external = !isInternalUserMessage(event.data);
      if (!current || external) {
        if (current) groups.push(current);
        current = beginGroup(seq);
      }
    } else if (!current) {
      current = beginGroup(seq);
    }

    const message = messageOf(event);
    const messageId = typeof message?.id === 'string' ? message.id : '';
    if (messageId !== '' && !current.messageIds.includes(messageId)) current.messageIds.push(messageId);
    current.seqs.push(seq);
    current.endSeq = seq;
    current.parts[event.type.split('/')[0]] = (current.parts[event.type.split('/')[0]] ?? 0) + 1;
    current.tokens += tokenFor(measured, event);

    if (typeof event.data?.turn === 'number') {
      if (current.turn === undefined) current.turn = event.data.turn;
      if (!current.turns.includes(event.data.turn)) current.turns.push(event.data.turn);
    }
    if (event.type === 'user/message' && !isInternalUserMessage(message) && current.userPreview === '') {
      current.userPreview = truncate(messageText(message), 220);
    }
    if (event.type === 'assistant/message') {
      current.toolCalls += countToolCalls(message);
      if (current.assistantPreview === '') {
        const text = truncate(messageText(message), 220);
        if (text !== '') current.assistantPreview = text;
      }
    }
    if (event.type === 'developer/message' && hasToolChange(message)) current.hasToolChange = true;
  }
  if (current) groups.push(current);

  const headSeq = nodes.length > 0 ? nodes[0] : undefined;
  const headEvent = headSeq === undefined ? undefined : bySeq.get(headSeq);
  const headProtected = headEvent !== undefined
    && (headEvent.type === 'system/message' || headEvent.type === 'developer/message');

  const busy = isBusy(events);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const isHead = index === 0 && headProtected;
    // The newest exchange stays locked only while the agent is still working on
    // it. A stopped or failed turn is already idle, so it can be dropped like any
    // other exchange — pruneRanges refuses busy sessions independently.
    const isLatest = busy && index === groups.length - 1;
    group.protected = isHead || isLatest;
    group.protectedReason = isHead ? 'system-prompt' : isLatest ? 'busy-exchange' : undefined;
    group.deletable = !group.protected;
    group.tokens = Math.round(group.tokens);
    group.fullTurns = fullTurnsOf(group, turnSpan);
    group.title = group.userPreview || group.assistantPreview
      || (isHead ? 'System context' : 'Context');
  }

  const total = totalTokens || groups.reduce((sum, group) => sum + group.tokens, 0);
  return {
    sessionId: String(session?.id ?? ''),
    busy,
    totalTokens: total,
    surfaceTokens: surfaceTokens || total,
    nodeCount: nodes.length,
    undo: undoInfo(session?.id),
    groups,
  };
}

function beginMessage(seq, event, message) {
  const kind = event.type.split('/')[0];
  const base = {
    id: String(seq),
    kind,
    role: kind,
    startSeq: seq,
    endSeq: seq,
    seqs: [],
    messageIds: [],
    parts: { user: 0, assistant: 0, tool: 0, system: 0, developer: 0 },
    tokens: 0,
    turn: typeof event.data?.turn === 'number' ? event.data.turn : undefined,
    turns: typeof event.data?.turn === 'number' ? [event.data.turn] : [],
    fullTurns: [],
    preview: truncate(messageText(message), 200),
    internal: event.type === 'user/message' && isInternalUserMessage(message),
    toolCalls: 0,
    toolResults: 0,
    hasToolChange: false,
    pendingCallIds: new Set(),
    protected: false,
    protectedReason: undefined,
    deletable: true,
    title: '',
  };
  return base;
}

function addMessageEvent(unit, event, message, tokens) {
  const kind = event.type.split('/')[0];
  const messageId = typeof message?.id === 'string' ? message.id : '';
  if (messageId !== '' && !unit.messageIds.includes(messageId)) unit.messageIds.push(messageId);
  unit.seqs.push(event.seq);
  unit.endSeq = event.seq;
  unit.parts[kind] = (unit.parts[kind] ?? 0) + 1;
  unit.tokens += tokens;
  if (unit.turn === undefined && typeof event.data?.turn === 'number') unit.turn = event.data.turn;
  if (typeof event.data?.turn === 'number' && !unit.turns.includes(event.data.turn)) unit.turns.push(event.data.turn);
  if (event.type === 'assistant/message') {
    unit.toolCalls += countToolCalls(message);
    unit.hasToolChange = unit.hasToolChange || hasToolChange(message);
    if (unit.preview === '') unit.preview = truncate(messageText(message), 200);
  } else if (event.type === 'tool/result') {
    unit.toolResults += 1;
    if (unit.preview === '') unit.preview = truncate(messageText(message), 200);
  } else if (unit.preview === '') {
    unit.preview = truncate(messageText(message), 200);
  }
}

/**
 * Split the surface into message units. A standalone message is one unit; an
 * assistant message that contains tool calls is kept atomic with its
 * consecutive matching tool results. Empty system markers left by earlier
 * prunes are hidden from the picker.
 *
 * Only the first system/developer surface node is protected. Unlike the group
 * mode, there is no "latest exchange" protection, because the point is to drop
 * a single unwanted reply.
 *
 * @param session - live Session instance.
 * @param tokenMeter - optional tokenMeter service.
 * @returns serializable state for the message picker and the agent tool.
 */
export function collectMessages(session, tokenMeter) {
  const { nodes, events, bySeq, measured, totalTokens, surfaceTokens, turnSpan } = measureSurface(session, tokenMeter);
  const messages = [];
  let current = null;

  const push = () => {
    if (current) {
      messages.push(current);
      current = null;
    }
  };

  for (const seq of nodes) {
    const event = bySeq.get(seq);
    if (!event) continue;
    const message = messageOf(event);

    if (event.type === 'system/message' && Array.isArray(message?.content) && message.content.length === 0) {
      push();
      continue;
    }

    const callId = toolResultCallId(event);
    if (event.type === 'tool/result' && current && current.kind === 'assistant' && current.pendingCallIds.has(callId)) {
      addMessageEvent(current, event, message, tokenFor(measured, event));
      current.pendingCallIds.delete(callId);
      continue;
    }

    push();
    current = beginMessage(seq, event, message);
    addMessageEvent(current, event, message, tokenFor(measured, event));
    if (event.type === 'assistant/message') {
      for (const id of toolCallIds(message)) current.pendingCallIds.add(id);
    }
  }
  push();

  const headSeq = nodes.length > 0 ? nodes[0] : undefined;
  const headEvent = headSeq === undefined ? undefined : bySeq.get(headSeq);
  const headProtected = headEvent !== undefined
    && (headEvent.type === 'system/message' || headEvent.type === 'developer/message');

  for (const message of messages) {
    const isHead = message.startSeq === headSeq && headProtected;
    message.protected = isHead;
    message.protectedReason = isHead ? 'system-prompt' : undefined;
    message.deletable = !isHead;
    message.tokens = Math.round(message.tokens);
    message.fullTurns = fullTurnsOf(message, turnSpan);
    if (message.kind === 'assistant') {
      message.title = message.preview || (message.toolCalls > 0 ? 'Tool call' : 'Assistant message');
    } else if (message.kind === 'tool') {
      message.title = message.preview || 'Tool result';
    } else if (message.kind === 'system') {
      message.title = message.preview || 'System message';
    } else if (message.kind === 'developer') {
      message.title = message.preview || 'Developer context';
    } else {
      message.title = message.preview || 'Context';
    }
  }

  const total = totalTokens || messages.reduce((sum, message) => sum + message.tokens, 0);
  return {
    sessionId: String(session?.id ?? ''),
    busy: isBusy(events),
    totalTokens: total,
    surfaceTokens: surfaceTokens || total,
    nodeCount: nodes.length,
    undo: undoInfo(session?.id),
    messages,
  };
}

/**
 * Find the exchange and the single-message unit that contain a chat message.
 * The quick action uses this to show the exact target before deleting.
 */
export function lookupMessage(session, messageId, tokenMeter) {
  const id = String(messageId ?? '');
  const groups = collectGroups(session, tokenMeter);
  const messages = collectMessages(session, tokenMeter);
  const group = id === '' ? undefined : groups.groups.find((candidate) => candidate.messageIds.includes(id));
  const message = id === '' ? undefined : messages.messages.find((candidate) => candidate.messageIds.includes(id));
  const bySeq = durableBySeq(session);
  /** The chat UI highlights by node key, so the lookup ships the exact keys. */
  const expose = (unit, list) => {
    if (!unit) return undefined;
    const exposed = publicState({ [list]: [unit] })[list][0];
    exposed.nodeKeys = nodeKeysForSpan(bySeq, unit.startSeq, unit.endSeq);
    return exposed;
  };
  /** Every single-message unit inside the exchange, so the caller can offer
   *  "the prompt only" and "the reply only" next to "the whole exchange". */
  const parts = group
    ? messages.messages
      .filter((unit) => unit.startSeq >= group.startSeq && unit.endSeq <= group.endSeq)
      .map((unit) => expose(unit, 'messages'))
    : [];
  return {
    sessionId: String(session?.id ?? ''),
    busy: groups.busy || messages.busy,
    messageId: id,
    hidden: hiddenState(session),
    group: expose(group, 'groups'),
    message: expose(message, 'messages'),
    parts,
  };
}

/**
 * What the chat view must hide: node keys and fully covered turns shadowed by
 * prune markers that no later undo restored. Derived from the durable log, so a
 * page refresh or host restart keeps pruned content out of sight. The log itself
 * is never modified — DSH session storage is append-only and exposes no delete.
 */
export function hiddenState(session) {
  const sessionId = String(session?.id ?? '');
  const events = Array.from(session?.snapshotEvents?.() ?? []);
  const bySeq = new Map(events.map((event) => [event.seq, event]));
  const markers = [];
  const restoredAt = new Map();
  for (const event of events) {
    const id = typeof event?.data?.message?.id === 'string' ? event.data.message.id : '';
    if (!id.startsWith('turn-sieve-')) continue;
    const prune = PRUNE_MARKER.exec(id);
    if (prune) {
      markers.push({
        seq: event.seq,
        startSeq: Number(prune[1]),
        endSeq: Number(prune[2]),
        turns: prune[3] ? prune[3].split('_').map(Number).filter((turn) => Number.isFinite(turn)) : [],
      });
      continue;
    }
    const restore = RESTORE_MARKER.exec(id);
    if (restore) {
      const rangeKey = `${Number(restore[1])}:${Number(restore[2])}`;
      if (event.seq > (restoredAt.get(rangeKey) ?? -1)) restoredAt.set(rangeKey, event.seq);
    }
  }

  const keys = new Set();
  const turns = new Set();
  const ranges = [];
  for (const marker of markers) {
    if ((restoredAt.get(`${marker.startSeq}:${marker.endSeq}`) ?? -1) > marker.seq) continue;
    ranges.push({ startSeq: marker.startSeq, endSeq: marker.endSeq });
    for (const key of nodeKeysForSpan(bySeq, marker.startSeq, marker.endSeq)) keys.add(key);
    for (const turn of marker.turns) turns.add(turn);
  }

  const cached = hiddenBySession.get(sessionId);
  for (const key of cached?.keys ?? []) keys.add(key);
  for (const turn of cached?.turns ?? []) turns.add(turn);

  return {
    sessionId,
    keys: Array.from(keys),
    turns: Array.from(turns).sort((a, b) => a - b),
    ranges: ranges.sort((a, b) => a.startSeq - b.startSeq),
  };
}

/** Remove the internal surface-node list before a state crosses the wire. */
export function publicState(state) {
  const result = { ...state };
  if (Array.isArray(state.groups)) {
    result.groups = state.groups.map(({ seqs: _seqs, ...group }) => group);
  }
  if (Array.isArray(state.messages)) {
    result.messages = state.messages.map(({ seqs: _seqs, pendingCallIds: _pending, ...message }) => message);
  }
  return result;
}

/** Describe the one undo slot for a session. */
export function undoInfo(sessionId) {
  const record = undoBySession.get(String(sessionId ?? ''));
  if (!record) return { available: false };
  return {
    available: true,
    at: record.at,
    mode: record.mode,
    ranges: record.items.length,
    tokens: record.tokens,
  };
}

function cloneOriginals(session, seqs) {
  const bySeq = new Map(Array.from(session?.snapshotEvents?.() ?? []).map((event) => [event.seq, event]));
  return seqs.map((seq) => {
    const event = bySeq.get(seq);
    if (!event) throw new Error(`The original event at seq ${seq} is no longer readable.`);
    return { type: event.type, data: structuredClone(event.data) };
  });
}

function restoredData(type, data, stamp, index, restoreId) {
  const clone = structuredClone(data);
  const message = type === 'user/message' ? clone : clone?.message;
  if (message && typeof message === 'object') {
    message.id = restoreId || `turn-sieve-restored-${stamp}-${index}`;
  }
  return clone;
}

/**
 * Replace each selected unit with an empty system message. The replacement
 * projects to no model message, so the unit leaves future context while the
 * append-only log keeps every original event.
 *
 * @param session - live Session instance.
 * @param ranges - selected `{startSeq, endSeq}` pairs from the picker.
 * @param tokenMeter - optional tokenMeter service.
 * @param mode - `'group'` (whole exchanges) or `'message'` (single units).
 * @returns a serializable result; `ok === false` carries a stable `code`.
 */
export function pruneRanges(session, ranges, tokenMeter, mode = 'group') {
  const selectedMode = mode === 'message' ? 'message' : 'group';
  const state = selectedMode === 'message'
    ? collectMessages(session, tokenMeter)
    : collectGroups(session, tokenMeter);
  if (state.busy) {
    return { ok: false, code: 'busy', message: 'The agent is still working in this session. Wait for the current turn to finish.' };
  }
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return { ok: false, code: 'empty', message: 'Select at least one unit.' };
  }
  if (ranges.length > MAX_RANGES) {
    return { ok: false, code: 'too_many', message: `Select at most ${MAX_RANGES} units at once.` };
  }

  const units = selectedMode === 'message' ? state.messages : state.groups;
  const byRange = new Map(units.map((unit) => [`${unit.startSeq}:${unit.endSeq}`, unit]));
  const picked = [];
  const seen = new Set();
  for (const range of ranges) {
    if (!range || typeof range !== 'object') {
      return { ok: false, code: 'invalid', message: 'Each selection needs startSeq and endSeq.' };
    }
    const startSeq = Number(range.startSeq);
    const endSeq = Number(range.endSeq);
    if (!Number.isInteger(startSeq) || !Number.isInteger(endSeq)) {
      return { ok: false, code: 'invalid', message: 'Selection endpoints must be integers.' };
    }
    const key = `${startSeq}:${endSeq}`;
    const unit = byRange.get(key);
    if (!unit) {
      return { ok: false, code: 'stale', message: 'The conversation changed. Reload the list and choose again.' };
    }
    if (!unit.deletable) {
      return {
        ok: false,
        code: 'protected',
        message: unit.protectedReason === 'system-prompt'
          ? 'The initial system/developer context is protected.'
          : 'The latest exchange is protected. Use message mode or prune older exchanges.',
      };
    }
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(unit);
  }

  picked.sort((a, b) => a.startSeq - b.startSeq);
  for (let index = 1; index < picked.length; index += 1) {
    if (picked[index].startSeq <= picked[index - 1].endSeq) {
      return { ok: false, code: 'overlap', message: 'Selections overlap.' };
    }
  }

  const stamp = Date.now().toString(36);
  const pruned = [];
  const items = [];
  let freedTokens = 0;
  /** Remember what the chat view must hide for the units actually shadowed. */
  const cacheHidden = (units) => {
    if (units.length === 0) return;
    const bySeq = durableBySeq(session);
    const keys = new Set();
    const turns = new Set();
    for (const unit of units) {
      for (const key of nodeKeysForSpan(bySeq, unit.startSeq, unit.endSeq)) keys.add(key);
      for (const turn of unit.fullTurns ?? []) turns.add(turn);
    }
    hiddenBySession.set(String(session.id), { keys: Array.from(keys), turns: Array.from(turns) });
  };
  try {
    for (let index = 0; index < picked.length; index += 1) {
      const unit = picked[index];
      const originals = cloneOriginals(session, unit.seqs);
      const message = {
        id: pruneMarkerId(stamp, index, unit, selectedMode),
        role: 'system',
        source: { kind: 'system-prompt' },
        content: [],
      };
      const event = session.append(
        'system/message',
        { turn: unit.turn ?? 0, step: 0, message },
        {
          surfaceOp: { op: 'replace', startSeq: unit.startSeq, endSeq: unit.endSeq },
          sourceEventSeqs: unit.seqs,
        },
      );
      const markerSeq = typeof event === 'number' ? event : event?.seq;
      if (!Number.isInteger(markerSeq)) throw new Error('The session append did not return a marker sequence.');
      freedTokens += unit.tokens;
      items.push({
        markerSeq,
        startSeq: unit.startSeq,
        endSeq: unit.endSeq,
        tokens: unit.tokens,
        title: unit.title,
        originals,
      });
      pruned.push({
        startSeq: unit.startSeq,
        endSeq: unit.endSeq,
        tokens: unit.tokens,
        title: unit.title,
      });
    }
  } catch (error) {
    if (items.length > 0) {
      undoBySession.set(String(session.id), {
        at: Date.now(),
        mode: selectedMode,
        items,
        tokens: freedTokens,
      });
      cacheHidden(picked.slice(0, items.length));
    }
    return {
      ok: false,
      code: 'append_failed',
      message: error instanceof Error ? error.message : String(error),
      mode: selectedMode,
      pruned,
      freedTokens,
      undo: undoInfo(session.id),
      hidden: hiddenState(session),
    };
  }

  if (items.length > 0) {
    undoBySession.set(String(session.id), {
      at: Date.now(),
      mode: selectedMode,
      items,
      tokens: freedTokens,
    });
  }
  cacheHidden(picked);

  return {
    ok: true,
    mode: selectedMode,
    pruned,
    freedTokens,
    undo: undoInfo(session.id),
    hidden: hiddenState(session),
    state: selectedMode === 'message'
      ? collectMessages(session, tokenMeter)
      : collectGroups(session, tokenMeter),
  };
}

/**
 * Undo the most recent prune for a session. Because the log is append-only, the
 * shadowed messages are appended back at the END of the surface rather than at
 * their original position. The empty markers remain in place and continue to
 * project to no message.
 *
 * @param session - live Session instance.
 * @param tokenMeter - optional tokenMeter service.
 * @param mode - state shape to return, `'group'` or `'message'`.
 * @returns a serializable result; `ok === false` carries a stable `code`.
 */
export function undoLast(session, tokenMeter, mode = 'group') {
  const selectedMode = mode === 'message' ? 'message' : 'group';
  const key = String(session?.id ?? '');
  const record = undoBySession.get(key);
  if (!record) {
    return { ok: false, code: 'no_undo', message: 'There is no recent deletion to undo in this session.' };
  }
  if (isBusy(Array.from(session?.snapshotEvents?.() ?? []))) {
    return { ok: false, code: 'busy', message: 'The agent is still working in this session. Wait for the current turn to finish.' };
  }

  undoBySession.delete(key);
  hiddenBySession.delete(key);
  const stamp = Date.now().toString(36);
  let restored = 0;
  try {
    for (const item of record.items) {
      // One id per restored unit: the client merges the copies back into the
      // original node keys, so the content reappears where it was.
      const restoreId = `turn-sieve-restored-${stamp}-r${item.startSeq}-${item.endSeq}`;
      for (const original of item.originals) {
        session.append(
          original.type,
          restoredData(original.type, original.data, stamp, restored, restoreId),
          { surfaceOp: 'append' },
        );
        restored += 1;
      }
    }
  } catch (error) {
    return {
      ok: false,
      code: 'append_failed',
      message: error instanceof Error ? error.message : String(error),
      mode: selectedMode,
      restored,
      undo: undoInfo(key),
      hidden: hiddenState(session),
    };
  }

  return {
    ok: true,
    mode: selectedMode,
    restored,
    undo: undoInfo(key),
    hidden: hiddenState(session),
    state: selectedMode === 'message'
      ? collectMessages(session, tokenMeter)
      : collectGroups(session, tokenMeter),
  };
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function normalizeHost(value) {
  return String(value ?? '').toLowerCase();
}

function isLocalHost(name, bindHost) {
  const host = normalizeHost(name).replace(/:\d+$/, '');
  const bind = normalizeHost(bindHost);
  const bindName = bind.replace(/:\d+$/, '');
  return host === 'localhost'
    || host === '::1'
    || host === '[::1]'
    || host === '127.0.0.1'
    || /^127\./.test(host)
    || /^::ffff:127\./.test(host)
    || (bindName !== '' && (host === bindName || normalizeHost(name) === bind));
}

/** Same-target check copied from the published loopback-route pattern. */
function isTrustedRequest(req, bindHost) {
  const host = normalizeHost(req.headers?.host);
  if (!isLocalHost(host, bindHost)) return false;
  if (normalizeHost(req.headers?.['sec-fetch-site']) === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (typeof origin === 'string' && origin !== '') {
    try {
      if (new URL(origin).host.toLowerCase() !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Request body is too large.');
        error.code = 'too_large';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        const error = new Error('Request body is not valid JSON.');
        error.code = 'invalid_json';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sessionFor(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') return undefined;
  if (!ctx.sessions || typeof ctx.sessions.get !== 'function') return undefined;
  try {
    return ctx.sessions.get(sessionId);
  } catch {
    return undefined;
  }
}

function modeOf(value) {
  return value === 'message' ? 'message' : 'group';
}

function statusForError(code) {
  if (code === 'busy' || code === 'stale' || code === 'protected' || code === 'no_undo') return 409;
  if (code === 'append_failed' || code === 'internal') return 500;
  return 400;
}

export function apply(ctx) {
  const bindHost = typeof ctx.webServer?.host === 'string' ? ctx.webServer.host : '';
  const tokenMeter = (() => {
    try {
      return ctx.tokenMeter;
    } catch {
      return undefined;
    }
  })();

  const requireSession = (req, res) => {
    if (!isTrustedRequest(req, bindHost)) {
      sendJson(res, 403, { ok: false, code: 'forbidden', message: 'This route is available to the local DSH UI only.' });
      return undefined;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const session = sessionFor(ctx, url.searchParams.get('sessionId'));
    if (!session) {
      sendJson(res, 404, { ok: false, code: 'session_not_found', message: 'This session is not live in the DSH host.' });
      return undefined;
    }
    return { session, url };
  };

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: GROUPS_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Use GET.' });
        return;
      }
      const resolved = requireSession(req, res);
      if (!resolved) return;
      const mode = modeOf(resolved.url.searchParams.get('mode'));
      try {
        const state = mode === 'message'
          ? collectMessages(resolved.session, tokenMeter)
          : collectGroups(resolved.session, tokenMeter);
        sendJson(res, 200, { ok: true, mode, hidden: hiddenState(resolved.session), ...publicState(state) });
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: list failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: list units');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOOKUP_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Use GET.' });
        return;
      }
      const resolved = requireSession(req, res);
      if (!resolved) return;
      const messageId = resolved.url.searchParams.get('messageId') ?? '';
      if (messageId === '') {
        sendJson(res, 400, { ok: false, code: 'invalid', message: 'messageId is required.' });
        return;
      }
      try {
        const result = lookupMessage(resolved.session, messageId, tokenMeter);
        if (!result.group && !result.message) {
          sendJson(res, 404, { ok: false, code: 'not_found', message: 'This message is not in the current conversation surface.' });
          return;
        }
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: lookup failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: locate a chat message');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: HIDDEN_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Use GET.' });
        return;
      }
      const resolved = requireSession(req, res);
      if (!resolved) return;
      try {
        sendJson(res, 200, { ok: true, ...hiddenState(resolved.session) });
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: hidden failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: hidden chat nodes');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PRUNE_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Use POST.' });
        return;
      }
      if (!isTrustedRequest(req, bindHost)) {
        sendJson(res, 403, { ok: false, code: 'forbidden', message: 'This route is available to the local DSH UI only.' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : 'invalid';
        sendJson(res, 400, { ok: false, code, message: error instanceof Error ? error.message : String(error) });
        return;
      }
      const session = sessionFor(ctx, body?.sessionId);
      if (!session) {
        sendJson(res, 404, { ok: false, code: 'session_not_found', message: 'This session is not live in the DSH host.' });
        return;
      }
      try {
        const mode = modeOf(body?.mode);
        const result = pruneRanges(session, body?.ranges, tokenMeter, mode);
        if (result.ok && result.state) result.state = publicState(result.state);
        sendJson(res, result.ok ? 200 : statusForError(result.code), result);
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: prune failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: prune units');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: UNDO_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Use POST.' });
        return;
      }
      if (!isTrustedRequest(req, bindHost)) {
        sendJson(res, 403, { ok: false, code: 'forbidden', message: 'This route is available to the local DSH UI only.' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : 'invalid';
        sendJson(res, 400, { ok: false, code, message: error instanceof Error ? error.message : String(error) });
        return;
      }
      const session = sessionFor(ctx, body?.sessionId);
      if (!session) {
        sendJson(res, 404, { ok: false, code: 'session_not_found', message: 'This session is not live in the DSH host.' });
        return;
      }
      try {
        const mode = modeOf(body?.mode);
        const result = undoLast(session, tokenMeter, mode);
        if (result.ok && result.state) result.state = publicState(result.state);
        sendJson(res, result.ok ? 200 : statusForError(result.code), result);
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: undo failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: undo last prune');

  if (ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.effect(() => ctx.tools.register({
      name: 'turn_sieve',
      description: 'List, prune, or undo pruning of low-value conversation units. mode="group" removes whole user/assistant exchanges; mode="message" removes a single message, keeping an assistant tool-call message atomic with its tool results. Pruning removes units from future model context while keeping the append-only log intact. Group mode protects the initial system context and the latest exchange; message mode protects only the initial system context. Call action="list" first, then action="prune" with exact startSeq/endSeq pairs, or action="undo" to restore the most recent prune (appended at the end of history).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'prune', 'undo'], description: 'list shows units; prune removes selected units; undo restores the most recent prune.' },
          mode: { type: 'string', enum: ['group', 'message'], description: 'group = whole exchanges; message = single message units.' },
          ranges: {
            type: 'array',
            description: 'For action="prune": exact ranges returned by action="list".',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                startSeq: { type: 'integer' },
                endSeq: { type: 'integer' },
              },
              required: ['startSeq', 'endSeq'],
            },
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => {
          if (!value || value.ok === false) {
            return [{ type: 'text', text: `Turn sieve: ${value?.message ?? 'failed'}` }];
          }
          if (value.action === 'list') {
            const rows = value.mode === 'message'
              ? (value.messages ?? []).map((message) => `${message.id}: ${message.kind} — ${message.title} [${message.startSeq}..${message.endSeq}] ~${message.tokens} tok${message.deletable ? '' : ' (protected)'}`)
              : (value.groups ?? []).map((group) => `${group.id}: ${group.title} [${group.startSeq}..${group.endSeq}] ~${group.tokens} tok${group.deletable ? '' : ' (protected)'}`);
            const count = value.mode === 'message' ? value.messages?.length ?? 0 : value.groups?.length ?? 0;
            return [{ type: 'text', text: `Turn sieve: ${count} ${value.mode === 'message' ? 'message unit(s)' : 'exchange(s)'}, ~${value.totalTokens ?? 0} tokens.\n${rows.join('\n')}` }];
          }
          if (value.action === 'undo') {
            return [{ type: 'text', text: `Turn sieve restored ${value.restored ?? 0} message(s) at the end of history.` }];
          }
          return [{ type: 'text', text: `Turn sieve removed ${value.pruned?.length ?? 0} ${value.mode === 'message' ? 'message unit(s)' : 'exchange(s)'}, freeing about ${value.freedTokens ?? 0} tokens from future context.` }];
        },
      },
      async execute(args, exec) {
        const agent = exec?.agent;
        const session = agent?.session;
        if (!session) throw new Error('turn_sieve must run inside a session.');
        const mode = modeOf(args?.mode);
        if (args?.action === 'list') {
          const state = mode === 'message'
            ? collectMessages(session, tokenMeter)
            : collectGroups(session, tokenMeter);
          return { ok: true, action: 'list', mode, ...publicState(state) };
        }
        if (args?.action === 'prune') {
          const result = pruneRanges(session, args?.ranges, tokenMeter, mode);
          if (result.ok && result.state) result.state = publicState(result.state);
          return { action: 'prune', ...result };
        }
        if (args?.action === 'undo') {
          const result = undoLast(session, tokenMeter, mode);
          if (result.ok && result.state) result.state = publicState(result.state);
          return { action: 'undo', ...result };
        }
        throw new Error('action must be "list", "prune", or "undo"');
      },
    }), 'dsh-turn-sieve: turn_sieve tool');
  }
}