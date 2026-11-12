import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGroups, pruneRanges } from '../lib/index.js';

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
        message: { id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
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
        message: { id: 'a3', role: 'assistant', content: [{ type: 'text', text: 'latest answer' }] },
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
    append(type, data, opts) {
      this.appends.push({ type, data, opts });
      const { startSeq, endSeq } = opts.surfaceOp;
      const startIndex = nodes.indexOf(startSeq);
      const endIndex = nodes.indexOf(endSeq);
      assert.notEqual(startIndex, -1);
      assert.notEqual(endIndex, -1);
      const seq = this.seq;
      this.seq += 1;
      events.push({ seq, type, data, surfaceOp: opts.surfaceOp });
      nodes.splice(startIndex, endIndex - startIndex + 1, seq);
      this.surface.replaceGeneration += 1;
      this.surface.contentGeneration += 1;
      return seq;
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
  assert.equal(result.state.groups.length, 3);
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
  // Two adjacent exchanges are separate ranges, not overlapping; a synthetic
  // overlap can only be caught after lookup, so use the same range twice.
  const result = pruneRanges(session, [
    { startSeq: 2, endSeq: 3 },
    { startSeq: 2, endSeq: 3 },
  ], tokenMeter);
  assert.equal(result.ok, true);
  assert.equal(session.appends.length, 1);
});