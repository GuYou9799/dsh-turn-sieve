import { Buffer } from 'node:buffer';

/**
 * dsh-turn-sieve — selective conversation pruning for DeepSeek Harness.
 *
 * The Session log is append-only. This plugin never deletes log records; it
 * appends empty `system/message` events carrying a `replace` surface operation
 * over an exact, contiguous span of the current surface. The shadowed exchanges
 * therefore stop entering future model requests while the raw Session remains
 * complete for audit/export.
 */

export const name = 'dsh-turn-sieve';
export const inject = ['webServer', 'sessions', 'tools', 'tokenMeter'];

const GROUPS_PATH = '/api/dsh-turn-sieve/groups';
const PRUNE_PATH = '/api/dsh-turn-sieve/prune';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RANGES = 200;

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
];

function isInternalUserText(text) {
  const value = String(text ?? '').trimStart();
  return INTERNAL_USER_PREFIXES.some((prefix) => value.startsWith(prefix));
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

/**
 * Group the current surface into exchanges. A new exchange begins at every
 * `user/message`; the leading system/developer context forms its own protected
 * group. Whole exchanges are the smallest unit this plugin removes, so a
 * tool-call/tool-result pair can never be split.
 *
 * @param session - live Session instance.
 * @param tokenMeter - optional tokenMeter service.
 * @returns serializable state for the picker and the agent tool.
 */
export function collectGroups(session, tokenMeter) {
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

  const groups = [];
  let current = null;

  const begin = (seq, event) => ({
    id: String(seq),
    startSeq: seq,
    endSeq: seq,
    seqs: [],
    parts: { user: 0, assistant: 0, tool: 0, system: 0, developer: 0 },
    tokens: 0,
    turn: undefined,
    userPreview: '',
    assistantPreview: '',
    toolCalls: 0,
    hasToolChange: false,
  });

  for (const seq of nodes) {
    const event = bySeq.get(seq);
    if (!event) continue;
    if (event.type === 'user/message') {
      // DSH also logs per-step runtime context as user/message. Only a real
      // user prompt starts a new exchange; injected context joins the current
      // one so a prompt and its work stay a single selectable unit.
      const external = !isInternalUserText(messageText(event.data));
      if (!current || external) {
        if (current) groups.push(current);
        current = begin(seq, event);
      }
    } else if (!current) {
      current = begin(seq, event);
    }

    const message = event.type === 'user/message' ? event.data : event.data?.message;
    current.seqs.push(seq);
    current.endSeq = seq;
    current.parts[event.type.split('/')[0]] = (current.parts[event.type.split('/')[0]] ?? 0) + 1;

    const measuredTokens = measured.get(seq);
    const tokens = typeof measuredTokens === 'number' ? measuredTokens : approximateTokens(event);
    current.tokens += tokens;

    if (typeof event.data?.turn === 'number' && current.turn === undefined) {
      current.turn = event.data.turn;
    }
    if (event.type === 'user/message' && current.userPreview === '') {
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

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const isHead = index === 0 && headProtected;
    const isLatest = index === groups.length - 1;
    group.protected = isHead || isLatest;
    group.protectedReason = isHead ? 'system-prompt' : isLatest ? 'latest-exchange' : undefined;
    group.deletable = !group.protected;
    group.tokens = Math.round(group.tokens);
    const externalUser = isInternalUserText(group.userPreview) ? '' : group.userPreview;
    group.title = externalUser || group.assistantPreview || group.userPreview
      || (isHead ? 'System context' : 'Context');
  }

  if (totalTokens === 0) totalTokens = groups.reduce((sum, group) => sum + group.tokens, 0);
  if (surfaceTokens === 0) surfaceTokens = totalTokens;
  const busy = isBusy(events);

  return {
    sessionId: String(session?.id ?? ''),
    busy,
    totalTokens,
    surfaceTokens,
    nodeCount: nodes.length,
    groups,
  };
}

/**
 * Remove the internal surface-node list before a state crosses the wire.
 * @param state - result of {@link collectGroups}.
 */
export function publicState(state) {
  return {
    ...state,
    groups: state.groups.map(({ seqs: _seqs, ...group }) => group),
  };
}

/**
 * Replace each selected exchange with an empty system message. The replacement
 * projects to no model message, so the exchange leaves future context while the
 * append-only log keeps every original event.
 *
 * @param session - live Session instance.
 * @param ranges - selected `{startSeq, endSeq}` pairs from the picker.
 * @param tokenMeter - optional tokenMeter service.
 * @returns a serializable result; `ok === false` carries a stable `code`.
 */
export function pruneRanges(session, ranges, tokenMeter) {
  const state = collectGroups(session, tokenMeter);
  if (state.busy) {
    return { ok: false, code: 'busy', message: 'The agent is still working in this session. Wait for the current turn to finish.' };
  }
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return { ok: false, code: 'empty', message: 'Select at least one exchange.' };
  }
  if (ranges.length > MAX_RANGES) {
    return { ok: false, code: 'too_many', message: `Select at most ${MAX_RANGES} exchanges at once.` };
  }

  const byRange = new Map(state.groups.map((group) => [`${group.startSeq}:${group.endSeq}`, group]));
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
    const group = byRange.get(key);
    if (!group) {
      return { ok: false, code: 'stale', message: 'The conversation changed. Reload the list and choose again.' };
    }
    if (!group.deletable) {
      return {
        ok: false,
        code: 'protected',
        message: group.protectedReason === 'system-prompt'
          ? 'The initial system/developer context is protected.'
          : 'The latest exchange is protected. Prune older exchanges.',
      };
    }
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(group);
  }

  picked.sort((a, b) => a.startSeq - b.startSeq);
  for (let index = 1; index < picked.length; index += 1) {
    if (picked[index].startSeq <= picked[index - 1].endSeq) {
      return { ok: false, code: 'overlap', message: 'Selections overlap.' };
    }
  }

  const stamp = Date.now().toString(36);
  const pruned = [];
  let freedTokens = 0;
  try {
    for (let index = 0; index < picked.length; index += 1) {
      const group = picked[index];
      const message = {
        id: `turn-sieve-${stamp}-${index}`,
        role: 'system',
        source: { kind: 'system-prompt' },
        content: [],
      };
      session.append(
        'system/message',
        { turn: group.turn ?? 0, step: 0, message },
        {
          surfaceOp: { op: 'replace', startSeq: group.startSeq, endSeq: group.endSeq },
          sourceEventSeqs: group.seqs,
        },
      );
      freedTokens += group.tokens;
      pruned.push({
        startSeq: group.startSeq,
        endSeq: group.endSeq,
        tokens: group.tokens,
        title: group.title,
      });
    }
  } catch (error) {
    return {
      ok: false,
      code: 'append_failed',
      message: error instanceof Error ? error.message : String(error),
      pruned,
      freedTokens,
    };
  }

  return {
    ok: true,
    pruned,
    freedTokens,
    state: collectGroups(session, tokenMeter),
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
      try {
        sendJson(res, 200, { ok: true, ...publicState(collectGroups(resolved.session, tokenMeter)) });
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: list failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: list exchanges');

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
        const result = pruneRanges(session, body?.ranges, tokenMeter);
        if (result.ok && result.state) result.state = publicState(result.state);
        const status = result.ok ? 200
          : result.code === 'busy' || result.code === 'stale' || result.code === 'protected' ? 409
            : 400;
        sendJson(res, status, result);
      } catch (error) {
        ctx.logger?.warn?.(`dsh-turn-sieve: prune failed: ${String(error)}`);
        sendJson(res, 500, { ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'dsh-turn-sieve: prune exchanges');

  if (ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.effect(() => ctx.tools.register({
      name: 'turn_sieve',
      description: 'List or prune low-value exchanges in the current conversation. Pruning removes whole user/assistant exchanges from future model context while keeping the append-only session log intact. Call action="list" first, then action="prune" with exact startSeq/endSeq pairs. The initial system context and the latest exchange are protected.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'prune'], description: 'list shows exchanges; prune removes the selected ones from future context.' },
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
            const rows = (value.groups ?? []).map((group) => `${group.id}: ${group.title} [${group.startSeq}..${group.endSeq}] ~${group.tokens} tok${group.deletable ? '' : ' (protected)'}`);
            return [{ type: 'text', text: `Turn sieve: ${value.groups?.length ?? 0} exchange(s), ~${value.totalTokens ?? 0} tokens.\n${rows.join('\n')}` }];
          }
          return [{ type: 'text', text: `Turn sieve removed ${value.pruned?.length ?? 0} exchange(s), freeing about ${value.freedTokens ?? 0} tokens from future context.` }];
        },
      },
      async execute(args, exec) {
        const agent = exec?.agent;
        const session = agent?.session;
        if (!session) throw new Error('turn_sieve must run inside a session.');
        if (args?.action === 'list') {
          return { ok: true, action: 'list', ...publicState(collectGroups(session, tokenMeter)) };
        }
        if (args?.action === 'prune') {
          const result = pruneRanges(session, args?.ranges, tokenMeter);
          if (result.ok && result.state) result.state = publicState(result.state);
          return { action: 'prune', ...result };
        }
        throw new Error('action must be "list" or "prune"');
      },
    }), 'dsh-turn-sieve: turn_sieve tool');
  }
}