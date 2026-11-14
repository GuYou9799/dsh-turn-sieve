import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectGroups,
  collectMessages,
  contextKey,
  flushPending,
  hiddenState,
  lookupMessage,
  nodeKeysForEvent,
  openStep,
  pruneRanges,
  publicState,
  undoLast,
} from '../lib/index.js';

/**
 * Mirror the format-v4 writer that rejected every 0.5.x marker:
 * `positive(data.turn, 'system/message turn')` and
 * `positive(data.step, 'system/message step')` in
 * dsh-session-persistence-jsonl/lib/worker.cjs (assertV4SystemMessageFields).
 */
function assertFormatV4Row(row) {
  assert.equal(typeof row.type, 'string');
  assert.equal(typeof row.data, 'object');
  const positive = (value, subject) => {
    assert.ok(Number.isSafeInteger(value) && value >= 1 && !Object.is(value, -0),
      `${subject} must be positive, got ${String(value)}`);
  };
  if (row.type === 'system/message') {
    positive(row.data.turn, 'system/message turn');
    positive(row.data.step, 'system/message step');
    assert.equal(row.data.message.role, 'system');
    assert.ok(typeof row.data.message.id === 'string' && row.data.message.id.length > 0);
    assert.ok(Array.isArray(row.data.message.content));
  } else if (row.data.turn !== undefined || row.data.step !== undefined) {
    if (row.data.turn !== undefined) positive(row.data.turn, `${row.type} turn`);
    if (row.data.step !== undefined) positive(row.data.step, `${row.type} step`);
  }
  return true;
}

/**
 * Simulate the turn driver opening a step. The driver writes a real
 * `step/start` and only then builds the request, so this is exactly when a
 * queued sieve becomes writable.
 */
function openNextStep(session, events, turn = 3, step = 1) {
  events.push({ seq: session.seq, type: 'step/start', data: { turn, step } });
  session.seq += 1;
  const coordinates = openStep(events);
  assert.deepEqual(coordinates, { turn, step }, 'the fixture must expose the open step');
  return flushPending(session);
}

/**
 * Mirror the format-v4 loader rule that broke 1.1.0: every step-scoped row must
 * carry the open turn/step, otherwise the loader rejects the whole log with
 * "system/message does not match an open turn and step".
 */
const STEP_SCOPED = new Set(['system/message', 'developer/message', 'assistant/attempt']);
function assertStepRows(events, state = { turn: null, step: null }) {
  for (const event of events) {
    const data = event.data ?? {};
    if (event.type === 'turn/start') { state.turn = data.turn; state.step = null; continue; }
    if (event.type === 'turn/end') { state.step = null; continue; }
    if (event.type === 'step/start') { state.turn = data.turn; state.step = data.step; continue; }
    if (event.type === 'step/end') { state.step = null; continue; }
    if (!STEP_SCOPED.has(event.type)) continue;
    assert.notEqual(state.step, null, `${event.type} was appended while no step was open`);
    assert.equal(data.turn, state.turn, `${event.type} turn must match the open turn`);
    assert.equal(data.step, state.step, `${event.type} step must match the open step`);
  }
  return state;
}

let fixtureCounter = 0;
/** Every fixture is its own session: the plugin caches per session id. */
function nextFixtureId() {
  fixtureCounter += 1;
  return `session-fixture-${fixtureCounter}`;
}

function makeSession() {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 0 } },
    {
      seq: 1,
      type: 'system/message',
      data: {
        turn: 0,
        step: 0,
        message: { id: 'sys', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'system prompt' }] },
      },
    },
    { seq: 2, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'first question' }] } },
    {
      seq: 3,
      type: 'assistant/message',
      data: {
        turn: 0,
        step: 0,
        message: { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: 'first answer' }] },
      },
    },
    { seq: 4, type: 'turn/end', data: { turn: 0, reason: 'stop' } },
    { seq: 5, type: 'turn/start', data: { turn: 1 } },
    { seq: 6, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'second question' }] } },
    {
      seq: 7,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 0,
        message: {
          id: 'a2',
          role: 'assistant',
          source: { kind: 'model', provider: 'test', model: 'test' },
          content: [
            { type: 'text', text: 'second answer' },
            { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' },
          ],
        },
      },
    },
    { seq: 8, type: 'turn/end', data: { turn: 1, reason: 'stop' } },
    { seq: 9, type: 'turn/start', data: { turn: 2 } },
    { seq: 10, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'latest question' }] } },
    {
      seq: 11,
      type: 'assistant/message',
      data: {
        turn: 2,
        step: 0,
        message: { id: 'a3', role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: 'latest answer' }] },
      },
    },
    { seq: 12, type: 'turn/end', data: { turn: 2, reason: 'stop' } },
    {
      seq: 13,
      type: 'user/message',
      data: { role: 'user', content: [{ type: 'text', text: 'Time sampled while preparing turn 2, step 4: 2026-11-12T10:57:55+08:00' }] },
    },
  ];

  const nodes = [1, 2, 3, 6, 7, 10, 11, 13];
  const session = {
    id: nextFixtureId(),
    appends: [],
    seq: 14,
    surface: {
      get nodes() {
        return [...nodes];
      },
      replaceGeneration: 0,
      contentGeneration: 0,
    },
    snapshotEvents(fromSeq = 0, toSeqExclusive = Number.POSITIVE_INFINITY) {
      return events.filter((event) => event.seq >= fromSeq && event.seq < toSeqExclusive);
    },
    eventAt(seq) {
      return events.find((event) => event.seq === seq);
    },
    append(type, data, opts) {
      this.appends.push({ type, data, opts });
      const seq = this.seq;
      this.seq += 1;
      const event = { seq, type, data, surfaceOp: opts?.surfaceOp, sourceEventSeqs: opts?.sourceEventSeqs };
      events.push(event);
      if (opts?.surfaceOp === 'append' || opts?.surfaceOp?.op === 'append') {
        nodes.push(seq);
      } else {
        const { startSeq, endSeq } = opts.surfaceOp;
        const startIndex = nodes.indexOf(startSeq);
        const endIndex = nodes.indexOf(endSeq);
        assert.notEqual(startIndex, -1);
        assert.notEqual(endIndex, -1);
        nodes.splice(startIndex, endIndex - startIndex + 1, seq);
        this.surface.replaceGeneration += 1;
        this.surface.contentGeneration += 1;
      }
      return event;
    },
  };

  const tokenMeter = {
    measure() {
      const tokens = new Map([[1, 100], [2, 10], [3, 20], [6, 10], [7, 20], [10, 10], [11, 20], [13, 5]]);
      const nodeRows = [...tokens.entries()].map(([seq, value]) => ({ seq, tokens: value, heuristicTokens: value }));
      return {
        logRevision: 1,
        baseline: 0,
        surfaceDeltaTokens: 195,
        totalTokens: 195,
        surfaceTokens: 195,
        nodes: nodeRows,
      };
    },
  };

  return { session, events, nodes, tokenMeter };
}

test('groups the surface into exchanges and protects only the system head while idle', () => {
  const { session, tokenMeter } = makeSession();
  const state = collectGroups(session, tokenMeter);

  assert.equal(state.busy, false);
  assert.equal(state.groups.length, 4);
  assert.deepEqual(state.groups.map((group) => [group.startSeq, group.endSeq]), [[1, 1], [2, 3], [6, 7], [10, 13]]);
  assert.deepEqual(state.groups.map((group) => group.deletable), [false, true, true, true]);
  assert.equal(state.groups[0].protectedReason, 'system-prompt');
  assert.equal(state.groups[3].protectedReason, undefined);
  assert.equal(state.groups[1].title, 'first question');
  assert.equal(state.groups[2].toolCalls, 1);
  assert.equal(state.groups[3].parts.user, 2);
  assert.equal(state.groups[3].title, 'latest question');
  assert.equal(state.totalTokens, 195);
  assert.equal(state.groups[0].tokens, 100);
});

test('queues one exchange and writes the marker inside the next step', () => {
  const { session, events, tokenMeter } = makeSession();
  const base = events.length;
  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter);

  assert.equal(result.ok, true);
  assert.equal(result.queued, true, 'an idle prune must be queued, not written');
  assert.equal(result.freedTokens, 30);
  assert.equal(session.appends.length, 0, 'nothing legal can be written while no step is open');
  assert.equal(result.undo.available, true, 'undo is offered for the queued sieve');

  assert.equal(openNextStep(session, events), true);
  assert.equal(session.appends.length, 1);
  const [append] = session.appends;
  assert.equal(append.type, 'system/message');
  assert.deepEqual(append.opts.surfaceOp, { op: 'replace', startSeq: 2, endSeq: 3 });
  assert.deepEqual(append.opts.sourceEventSeqs, [2, 3]);
  assert.deepEqual(append.data.message, {
    id: append.data.message.id,
    role: 'system',
    source: { kind: 'system-prompt' },
    content: [],
  });
  assert.equal(append.data.turn, 3, 'the marker borrows the turn of the open step');
  assert.equal(append.data.step, 1, 'the marker borrows the number of the open step');
  assert.equal(assertFormatV4Row(append), true);
  assertStepRows(events.slice(base));
  assert.equal(result.mode, 'group');
  assert.equal(result.state.groups.length, 3, 'the picker already hides what the queued marker shadows');
});

test('prunes the idle latest exchange, such as a stopped or failed turn', () => {
  const { session, events, tokenMeter } = makeSession();
  const base = events.length;
  const result = pruneRanges(session, [{ startSeq: 10, endSeq: 13 }], tokenMeter);

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(result.freedTokens, 35);
  assert.equal(session.appends.length, 0);
  openNextStep(session, events);
  assert.deepEqual(session.appends[0].opts.surfaceOp, { op: 'replace', startSeq: 10, endSeq: 13 });
  assert.equal(assertFormatV4Row(session.appends[0]), true);
  assertStepRows(events.slice(base));
});

test('keeps the newest exchange locked while the agent is still working', () => {
  const { session, events, tokenMeter } = makeSession();
  events.push({ seq: 900, type: 'turn/start', data: { turn: 3 } });

  const state = collectGroups(session, tokenMeter);
  assert.equal(state.busy, true);
  assert.equal(state.groups[3].deletable, false);
  assert.equal(state.groups[3].protectedReason, 'busy-exchange');

  const result = pruneRanges(session, [{ startSeq: 10, endSeq: 13 }], tokenMeter);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'busy');
  assert.equal(session.appends.length, 0);
});

test('refuses a stale range', () => {
  const { session, tokenMeter } = makeSession();
  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 7 }], tokenMeter);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'stale');
});

test('refuses while a turn is open', () => {
  const { session, events, tokenMeter } = makeSession();
  events.push({ seq: 14, type: 'turn/start', data: { turn: 3 } });
  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'busy');
});

test('refuses overlapping selections', () => {
  const { session, tokenMeter } = makeSession();
  const result = pruneRanges(session, [
    { startSeq: 2, endSeq: 3 },
    { startSeq: 2, endSeq: 3 },
  ], tokenMeter);
  assert.equal(result.ok, true);
  assert.equal(result.pruned.length, 1, 'a repeated selection collapses into one unit');
});

test('splits the surface into message units and protects only the system head', () => {
  const { session, tokenMeter } = makeSession();
  const state = collectMessages(session, tokenMeter);

  assert.equal(state.busy, false);
  assert.equal(state.messages.length, 8);
  assert.deepEqual(state.messages.map((message) => [message.startSeq, message.endSeq]), [
    [1, 1],
    [2, 2],
    [3, 3],
    [6, 6],
    [7, 7],
    [10, 10],
    [11, 11],
    [13, 13],
  ]);
  assert.deepEqual(state.messages.map((message) => message.deletable), [
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  assert.equal(state.messages[0].protectedReason, 'system-prompt');
  assert.equal(state.messages[4].toolCalls, 1);
  assert.equal(state.messages[7].internal, true);
  assert.equal(state.messages[1].title, 'first question');
});

test('recognizes runtime-context source without a known text prefix', () => {
  const events = [
    {
      seq: 1,
      type: 'system/message',
      data: {
        turn: 0,
        step: 0,
        message: { id: 'sys', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'system prompt' }] },
      },
    },
    {
      seq: 2,
      type: 'user/message',
      data: {
        role: 'user',
        source: { kind: 'runtime-context', form: 'snapshot', sections: [] },
        content: [{ type: 'text', text: 'hello from injected context' }],
      },
    },
    { seq: 3, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'real question' }] } },
    {
      seq: 4,
      type: 'assistant/message',
      data: {
        turn: 0,
        step: 0,
        message: { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: 'answer' }] },
      },
    },
  ];
  const nodes = [1, 2, 3, 4];
  const session = {
    id: 'session-2',
    seq: 5,
    surface: { get nodes() { return [...nodes]; } },
    snapshotEvents(fromSeq = 0, toSeqExclusive = Number.POSITIVE_INFINITY) {
      return events.filter((event) => event.seq >= fromSeq && event.seq < toSeqExclusive);
    },
    eventAt(seq) {
      return events.find((event) => event.seq === seq);
    },
  };

  const groups = collectGroups(session);
  assert.deepEqual(groups.groups.map((group) => [group.startSeq, group.endSeq]), [[1, 2], [3, 4]]);
  assert.equal(groups.groups[1].title, 'real question');

  const messages = collectMessages(session);
  assert.equal(messages.messages[1].internal, true);
  assert.equal(messages.messages[2].internal, false);
});

test('locates a chat message in both selection modes', () => {
  const { session, tokenMeter } = makeSession();
  const found = lookupMessage(session, 'a1', tokenMeter);
  assert.equal(found.busy, false);
  assert.deepEqual([found.group.startSeq, found.group.endSeq], [2, 3]);
  assert.equal(found.group.title, 'first question');
  assert.equal(found.message.startSeq, 3);
  assert.equal(found.message.kind, 'assistant');
  assert.equal(found.message.preview, 'first answer');
  assert.equal('seqs' in found.group, false);
  assert.equal('seqs' in found.message, false);
  assert.equal('pendingCallIds' in found.message, false);
  // The exchange is split into its prompt and reply so the chat action can offer
  // "the prompt only" and "the reply only" next to "the whole exchange".
  assert.deepEqual(found.parts.map((part) => [part.kind, part.startSeq, part.endSeq]), [['user', 2, 2], ['assistant', 3, 3]]);
  assert.deepEqual(found.parts.map((part) => part.deletable), [true, true]);
  assert.equal('seqs' in found.parts[0], false);

  const missing = lookupMessage(session, 'not-a-message', tokenMeter);
  assert.equal(missing.group, undefined);
  assert.equal(missing.message, undefined);
  assert.deepEqual(missing.parts, []);
});

test('keeps an assistant tool call atomic with its tool results', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 0 } },
    {
      seq: 1,
      type: 'system/message',
      data: {
        turn: 0,
        step: 0,
        message: { id: 'sys', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'system prompt' }] },
      },
    },
    { seq: 2, type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'use tools' }] } },
    {
      seq: 3,
      type: 'assistant/message',
      data: {
        turn: 0,
        step: 0,
        message: {
          id: 'a1',
          role: 'assistant',
          source: { kind: 'model', provider: 'test', model: 'test' },
          content: [
            { type: 'text', text: 'calling tools' },
            { type: 'tool-call', id: 'call-a', name: 'read', arguments: '{}' },
            { type: 'tool-call', id: 'call-b', name: 'read', arguments: '{}' },
          ],
        },
      },
    },
    {
      seq: 4,
      type: 'tool/result',
      data: {
        turn: 0,
        step: 0,
        message: {
          id: 'tr-a',
          role: 'tool',
          toolCallId: 'call-a',
          source: { kind: 'tool', callId: 'call-a' },
          content: [{ type: 'text', text: 'result A' }],
        },
      },
    },
    {
      seq: 5,
      type: 'tool/result',
      data: {
        turn: 0,
        step: 0,
        message: {
          id: 'tr-b',
          role: 'tool',
          toolCallId: 'call-b',
          source: { kind: 'tool', callId: 'call-b' },
          content: [{ type: 'text', text: 'result B' }],
        },
      },
    },
    {
      seq: 6,
      type: 'assistant/message',
      data: {
        turn: 0,
        step: 1,
        message: { id: 'a2', role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: 'done' }] },
      },
    },
    { seq: 7, type: 'turn/end', data: { turn: 0, reason: 'stop' } },
  ];
  const nodes = [1, 2, 3, 4, 5, 6];
  const session = {
    id: 'session-tools',
    appends: [],
    seq: 8,
    surface: { get nodes() { return [...nodes]; }, replaceGeneration: 0, contentGeneration: 0 },
    snapshotEvents() { return [...events]; },
    eventAt(seq) { return events.find((event) => event.seq === seq); },
    append(type, data, opts) {
      this.appends.push({ type, data, opts });
      const seq = this.seq;
      this.seq += 1;
      events.push({ seq, type, data, surfaceOp: opts?.surfaceOp, sourceEventSeqs: opts?.sourceEventSeqs });
      if (opts?.surfaceOp === 'append' || opts?.surfaceOp?.op === 'append') {
        nodes.push(seq);
      } else {
        const { startSeq, endSeq } = opts.surfaceOp;
        const startIndex = nodes.indexOf(startSeq);
        const endIndex = nodes.indexOf(endSeq);
        nodes.splice(startIndex, endIndex - startIndex + 1, seq);
      }
      return { seq };
    },
  };
  const tokenMeter = { measure: () => ({ nodes: [], totalTokens: 100, surfaceTokens: 100 }) };

  const state = collectMessages(session, tokenMeter);
  assert.equal(state.messages.length, 4);
  assert.deepEqual(state.messages[2].seqs, [3, 4, 5]);
  assert.equal(state.messages[2].toolCalls, 2);
  assert.equal(state.messages[2].toolResults, 2);

  const result = pruneRanges(session, [{ startSeq: 3, endSeq: 5 }], tokenMeter, 'message');
  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(result.undo.available, true);
  openNextStep(session, events);
  assert.deepEqual(session.appends[0].opts.sourceEventSeqs, [3, 4, 5]);

  const undo = undoLast(session, tokenMeter, 'message');
  assert.equal(undo.ok, true);
  assert.equal(undo.queued, true);
  assert.equal(undo.planned, 3);
  assert.equal(undo.restored, 0);
  assert.equal(session.appends.length, 1, 'the restore is queued, not written yet');
  openNextStep(session, events, 4, 1);
  assert.deepEqual(session.appends.slice(-3).map((append) => append.type), ['assistant/message', 'tool/result', 'tool/result']);
  assert.deepEqual(session.appends.slice(-3).map((append) => append.opts.surfaceOp), ['append', 'append', 'append']);
});

test('prunes a single message in message mode', () => {
  const { session, events, tokenMeter } = makeSession();
  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 2 }], tokenMeter, 'message');

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(result.mode, 'message');
  assert.equal(result.freedTokens, 10);
  openNextStep(session, events);
  assert.deepEqual(session.appends[0].opts.surfaceOp, { op: 'replace', startSeq: 2, endSeq: 2 });
  assert.deepEqual(session.appends[0].opts.sourceEventSeqs, [2]);
  assert.equal(collectMessages(session, tokenMeter).messages.length, 7);
  assert.equal(result.undo.available, true);
});

test('undoes the last message prune by appending the original at the end', () => {
  const { session, events, tokenMeter } = makeSession();
  pruneRanges(session, [{ startSeq: 2, endSeq: 2 }], tokenMeter, 'message');
  openNextStep(session, events);
  const before = session.appends.length;

  const undo = undoLast(session, tokenMeter, 'message');
  assert.equal(undo.ok, true);
  assert.equal(undo.queued, true);
  assert.equal(undo.planned, 1);
  assert.equal(undo.restored, 0, 'the restore is written inside the next step');
  assert.equal(undo.mode, 'message');
  assert.equal(undo.undo.available, false);
  assert.equal(session.appends.length, before);

  openNextStep(session, events, 4, 1);
  assert.equal(session.appends.length, before + 1);
  const restored = session.appends.at(-1);
  assert.equal(restored.type, 'user/message');
  assert.equal(restored.opts.surfaceOp, 'append');
  assert.equal(restored.data.content[0].text, 'first question');
  assert.notEqual(restored.data.id, undefined);
  assert.ok(collectMessages(session, tokenMeter).messages.at(-1).startSeq > 13);

  const again = undoLast(session, tokenMeter, 'message');
  assert.equal(again.ok, false);
  assert.equal(again.code, 'no_undo');
});

test('undoes a whole exchange and restores every original message in order', () => {
  const { session, events, tokenMeter } = makeSession();
  pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter, 'group');
  openNextStep(session, events);
  const before = session.appends.length;

  const undo = undoLast(session, tokenMeter, 'group');
  assert.equal(undo.ok, true);
  assert.equal(undo.planned, 2);
  openNextStep(session, events, 5, 1);
  assert.deepEqual(session.appends.slice(before).map((append) => append.type), ['user/message', 'assistant/message']);
  assert.equal(session.appends.at(-1).data.message.content[0].text, 'first answer');
});

test('refuses to undo while a turn is open', () => {
  const { session, events, tokenMeter } = makeSession();
  pruneRanges(session, [{ startSeq: 2, endSeq: 2 }], tokenMeter, 'message');
  events.push({ seq: session.seq, type: 'turn/start', data: { turn: 9 } });

  const undo = undoLast(session, tokenMeter, 'message');
  assert.equal(undo.ok, false);
  assert.equal(undo.code, 'busy');
});

test('strips internal surface bookkeeping from the wire state', () => {
  const { session, tokenMeter } = makeSession();
  const wire = publicState(collectMessages(session, tokenMeter));
  assert.equal(wire.messages.length, 8);
  assert.equal('seqs' in wire.messages[0], false);
  assert.equal('pendingCallIds' in wire.messages[4], false);
  assert.doesNotThrow(() => JSON.stringify(wire));
});

test('refuses to prune the protected system head in message mode', () => {
  const { session, tokenMeter } = makeSession();
  const result = pruneRanges(session, [{ startSeq: 1, endSeq: 1 }], tokenMeter, 'message');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'protected');
});

test('exposes chat node keys for the located units', () => {
  const { session, tokenMeter } = makeSession();
  session.id = 'session-lookup-keys';
  const found = lookupMessage(session, 'a2', tokenMeter);

  assert.deepEqual(found.message.nodeKeys, ['14:assistant-step1:0']);
  assert.deepEqual(found.group.nodeKeys, ['14:assistant-step1:0']);
  assert.deepEqual(found.group.fullTurns, [1]);
  assert.deepEqual(found.hidden, {
    sessionId: 'session-lookup-keys',
    keys: [],
    turns: [],
    noticeTurns: [],
    ranges: [],
    pending: 0,
    pendingError: null,
  });
});

test('derives the hidden chat nodes from the durable prune marker', () => {
  const { session, events, tokenMeter } = makeSession();
  session.id = 'session-hidden';
  const pruned = pruneRanges(session, [{ startSeq: 6, endSeq: 7 }], tokenMeter, 'group');

  assert.equal(pruned.ok, true);
  openNextStep(session, events);
  assert.match(session.appends[0].data.message.id, /^turn-sieve-[a-z0-9]+-0-r6-7-t1-n1$/);
  assert.deepEqual(pruned.hidden.keys, ['14:assistant-step1:0']);
  assert.deepEqual(pruned.hidden.turns, [1]);
  assert.deepEqual(pruned.hidden.noticeTurns, [1]);
  assert.deepEqual(pruned.hidden.ranges, [{ startSeq: 6, endSeq: 7 }]);

  // A restarted host has no in-memory cache: the marker alone must rebuild it.
  const rebuilt = hiddenState({ id: 'session-hidden', snapshotEvents: () => session.snapshotEvents() });
  assert.deepEqual(rebuilt.keys, ['14:assistant-step1:0']);
  assert.deepEqual(rebuilt.turns, [1]);
  assert.deepEqual(rebuilt.noticeTurns, [1]);
  assert.deepEqual(rebuilt.ranges, [{ startSeq: 6, endSeq: 7 }]);

  const undo = undoLast(session, tokenMeter, 'group');
  assert.equal(undo.ok, true);
  assert.deepEqual(undo.hidden.keys, []);
  assert.deepEqual(undo.hidden.turns, []);
  assert.deepEqual(undo.hidden.noticeTurns, []);
  assert.deepEqual(undo.hidden.ranges, []);
  openNextStep(session, events, 4, 1);
  assert.match(session.appends.at(-1).data.message.id, /^turn-sieve-restored-[a-z0-9]+-r6-7$/);
  const afterUndo = hiddenState({ id: 'session-hidden', snapshotEvents: () => session.snapshotEvents() });
  assert.deepEqual(afterUndo.keys, []);
  assert.deepEqual(afterUndo.noticeTurns, []);
});

test('keeps notice turns of a partially covered turn in the hide set', () => {
  const { session, events, tokenMeter } = makeSession();
  session.id = 'session-notice-turns';
  // Turn 0 also owns the protected head at seq 1, so it is never a "full" turn
  // of the exchange at 2..3 - its notice cards still have to disappear.
  const pruned = pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter, 'group');

  assert.equal(pruned.ok, true);
  openNextStep(session, events);
  assert.match(session.appends[0].data.message.id, /^turn-sieve-[a-z0-9]+-0-r2-3-n0$/);
  assert.deepEqual(pruned.hidden.turns, []);
  assert.deepEqual(pruned.hidden.noticeTurns, [0]);

  const rebuilt = hiddenState({ id: 'session-notice-turns', snapshotEvents: () => session.snapshotEvents() });
  assert.deepEqual(rebuilt.noticeTurns, [0], 'a restarted host rebuilds the notice turns from the marker');
});

test('attaches every marker of one batch to the single open step', () => {
  const { session, events, tokenMeter } = makeSession();
  session.id = 'session-marker-steps';
  const result = pruneRanges(session, [
    { startSeq: 6, endSeq: 7 },
    { startSeq: 10, endSeq: 13 },
  ], tokenMeter, 'group');

  assert.equal(result.ok, true);
  assert.equal(session.appends.length, 0, 'a batch is written in one flush');
  openNextStep(session, events, 7, 2);

  assert.equal(session.appends.length, 2);
  assert.deepEqual(
    session.appends.map((append) => [append.data.turn, append.data.step]),
    [[7, 2], [7, 2]],
    'one flush shares the one pair of coordinates the log can accept',
  );
  for (const append of session.appends) assert.equal(assertFormatV4Row(append), true);
});

test('never writes a marker while no step is open, however long the queue waits', () => {
  const { session, events, tokenMeter } = makeSession();
  session.id = 'session-idle-queue';
  const base = events.length;
  pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter, 'group');

  // A turn opening without a step still offers no legal coordinate.
  events.push({ seq: session.seq, type: 'turn/start', data: { turn: 3 } });
  session.seq += 1;
  assert.equal(flushPending(session), false);
  assert.equal(session.appends.length, 0);
  assert.equal(hiddenState(session).pending, 1, 'the queue survives until a step exists');
  assertStepRows(events.slice(base));
});

test('reports a failed append without leaving the chat view hidden', () => {
  const { session, events, tokenMeter } = makeSession();
  session.id = 'session-rejected';
  session.append = () => {
    throw new Error('format v4 system/message step must be positive');
  };

  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter, 'group');
  assert.equal(result.ok, true, 'queueing does not touch the writer');
  assert.equal(result.queued, true);

  openNextStep(session, events);
  const hidden = hiddenState(session);
  assert.equal(hidden.pending, 0, 'a failed append is dropped instead of retried blindly');
  assert.match(hidden.pendingError ?? '', /format v4 system\/message step must be positive/);
  assert.deepEqual(hidden.keys, [], 'a failed append must not keep hiding content');
});
test('pins the chat node key mapping of DSH 0.2.2-rc.3', () => {
  assert.equal(contextKey('input-message', 'abc'), '13:input-messageabc');
  const cases = [
    [{ type: 'user/message', data: { id: 'u1', role: 'user', content: [] } }, ['13:input-messageu1']],
    [{ type: 'developer/message', data: { message: { id: 'd1', role: 'developer', content: [] } } }, ['17:developer-messaged1']],
    [{ type: 'system/message', data: { message: { id: 's1', role: 'system', content: [] } } }, ['13:system-prompts1']],
    [{ type: 'assistant/message', data: { turn: 6, step: 73, message: { id: 'a1', role: 'assistant', content: [] } } }, ['14:assistant-step6:73']],
    [{ type: 'assistant/live-chunk', data: { turn: 6, step: 73 } }, ['14:assistant-step6:73']],
    [{ type: 'step/start', data: { turn: 6, step: 73 } }, ['14:assistant-step6:73']],
    [{ type: 'tool/call', data: { callId: 'call_abc' } }, ['9:tool-callcall_abc']],
    [{ type: 'tool/result', data: { message: { toolCallId: 'call_abc', content: [] } } }, ['9:tool-callcall_abc']],
    [{ type: 'tool/result', data: { message: { source: { callId: 'call_xyz' }, content: [] } } }, ['9:tool-callcall_xyz']],
    // Notices are not surface events: they own a chat node but never a durable
    // message id, so pruning them stays a client-side concern.
    [{ type: 'turn/end', data: { turn: 6, reason: { kind: 'aborted' } } }, []],
    [{ type: 'llm/retry', data: { turn: 6, retry: 1 } }, []],
    [{ type: 'user/message', data: { role: 'user', content: [] } }, []],
  ];
  for (const [event, expected] of cases) {
    assert.deepEqual(nodeKeysForEvent(event), expected, `${event.type} -> ${JSON.stringify(expected)}`);
  }
});
