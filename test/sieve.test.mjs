import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectGroups,
  collectMessages,
  lookupMessage,
  pruneRanges,
  publicState,
  undoLast,
} from '../lib/index.js';

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
    id: 'session-1',
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

test('groups the surface into exchanges and protects system plus latest', () => {
  const { session, tokenMeter } = makeSession();
  const state = collectGroups(session, tokenMeter);

  assert.equal(state.busy, false);
  assert.equal(state.groups.length, 4);
  assert.deepEqual(state.groups.map((group) => [group.startSeq, group.endSeq]), [[1, 1], [2, 3], [6, 7], [10, 13]]);
  assert.deepEqual(state.groups.map((group) => group.deletable), [false, true, true, false]);
  assert.equal(state.groups[0].protectedReason, 'system-prompt');
  assert.equal(state.groups[3].protectedReason, 'latest-exchange');
  assert.equal(state.groups[1].title, 'first question');
  assert.equal(state.groups[2].toolCalls, 1);
  assert.equal(state.groups[3].parts.user, 2);
  assert.equal(state.groups[3].title, 'latest question');
  assert.equal(state.totalTokens, 195);
  assert.equal(state.groups[0].tokens, 100);
});

test('prunes one exchange with an empty system replacement', () => {
  const { session, tokenMeter } = makeSession();
  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter);

  assert.equal(result.ok, true);
  assert.equal(result.freedTokens, 30);
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
  assert.equal(append.data.turn, 0);
  assert.equal(append.data.step, 0);
  assert.equal(result.mode, 'group');
  assert.equal(result.state.groups.length, 3);
  assert.equal(result.undo.available, true);
});

test('refuses the protected latest exchange', () => {
  const { session, tokenMeter } = makeSession();
  const result = pruneRanges(session, [{ startSeq: 10, endSeq: 13 }], tokenMeter);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'protected');
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
  assert.equal(session.appends.length, 1);
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

  const missing = lookupMessage(session, 'not-a-message', tokenMeter);
  assert.equal(missing.group, undefined);
  assert.equal(missing.message, undefined);
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
  assert.deepEqual(session.appends[0].opts.sourceEventSeqs, [3, 4, 5]);
  assert.equal(result.undo.available, true);

  const undo = undoLast(session, tokenMeter, 'message');
  assert.equal(undo.ok, true);
  assert.equal(undo.restored, 3);
  assert.deepEqual(session.appends.slice(-3).map((append) => append.type), ['assistant/message', 'tool/result', 'tool/result']);
  assert.deepEqual(session.appends.slice(-3).map((append) => append.opts.surfaceOp), ['append', 'append', 'append']);
});

test('prunes a single message in message mode', () => {
  const { session, tokenMeter } = makeSession();
  const result = pruneRanges(session, [{ startSeq: 2, endSeq: 2 }], tokenMeter, 'message');

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'message');
  assert.equal(result.freedTokens, 10);
  assert.deepEqual(session.appends[0].opts.surfaceOp, { op: 'replace', startSeq: 2, endSeq: 2 });
  assert.deepEqual(session.appends[0].opts.sourceEventSeqs, [2]);
  assert.equal(result.state.messages.length, 7);
  assert.equal(result.undo.available, true);
});

test('undoes the last message prune by appending the original at the end', () => {
  const { session, tokenMeter } = makeSession();
  pruneRanges(session, [{ startSeq: 2, endSeq: 2 }], tokenMeter, 'message');
  const before = session.appends.length;

  const undo = undoLast(session, tokenMeter, 'message');
  assert.equal(undo.ok, true);
  assert.equal(undo.restored, 1);
  assert.equal(undo.mode, 'message');
  assert.equal(undo.undo.available, false);
  assert.equal(session.appends.length, before + 1);

  const restored = session.appends.at(-1);
  assert.equal(restored.type, 'user/message');
  assert.equal(restored.opts.surfaceOp, 'append');
  assert.equal(restored.data.content[0].text, 'first question');
  assert.notEqual(restored.data.id, undefined);
  assert.ok(undo.state.messages.at(-1).startSeq > 13);

  const again = undoLast(session, tokenMeter, 'message');
  assert.equal(again.ok, false);
  assert.equal(again.code, 'no_undo');
});

test('undoes a whole exchange and restores every original message in order', () => {
  const { session, tokenMeter } = makeSession();
  pruneRanges(session, [{ startSeq: 2, endSeq: 3 }], tokenMeter, 'group');
  const before = session.appends.length;

  const undo = undoLast(session, tokenMeter, 'group');
  assert.equal(undo.ok, true);
  assert.equal(undo.restored, 2);
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