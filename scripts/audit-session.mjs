#!/usr/bin/env node
/**
 * Audit a DSH session log for rows that the format v4 loader would reject.
 *
 * The 1.1.0 build of this plugin appended its prune marker while no turn was
 * open and stamped the row with a fabricated `turn: 1, step: 1`. Format v4
 * requires every step-scoped row (system/message, developer/message,
 * assistant/attempt) to carry the turn/step that is actually open, so a single
 * such row makes the whole session unreadable:
 *
 *   SessionFormatError: system/message does not match an open turn and step
 *
 * This script replays the loader's turn/step rules over the log and reports the
 * offending rows. With --fix it removes the trailing frames that produced them
 * (the marker was always written last), after copying the log to <file>.bak.
 *
 * Usage:
 *   node scripts/audit-session.mjs <session.v4.jsonl.zstd> [--fix]
 *
 * The log is a sequence of independent zstd frames, one per append batch, so it
 * is walked frame by frame; decompressing the whole file only yields frame one.
 */
import { copyFileSync, readFileSync, statSync, truncateSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const STEP_SCOPED = new Set(['system/message', 'developer/message', 'assistant/attempt']);

function framesOf(buffer) {
  const offsets = [];
  for (let i = 0; i + 3 < buffer.length; i += 1) {
    if (
      buffer[i] === ZSTD_MAGIC[0]
      && buffer[i + 1] === ZSTD_MAGIC[1]
      && buffer[i + 2] === ZSTD_MAGIC[2]
      && buffer[i + 3] === ZSTD_MAGIC[3]
    ) offsets.push(i);
  }
  return offsets;
}

function readLog(path) {
  const buffer = readFileSync(path);
  const offsets = framesOf(buffer);
  const rows = [];
  for (let index = 0; index < offsets.length; index += 1) {
    const start = offsets[index];
    const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length;
    let text;
    try {
      text = zstdDecompressSync(buffer.subarray(start, end)).toString('utf8');
    } catch (cause) {
      rows.push({ type: '<undecodable frame>', seq: -1, frame: start, undecodable: String(cause) });
      continue;
    }
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        rows.push({ type: '<unparsable row>', seq: -1, frame: start, undecodable: line.slice(0, 80) });
        continue;
      }
      event.frame = start;
      rows.push(event);
    }
  }
  return { bytes: buffer.length, offsets, rows };
}

function audit(rows) {
  let turn = null;
  let step = null;
  const violations = [];
  for (const event of rows) {
    const data = event.data ?? {};
    if (event.type === 'turn/start') {
      turn = data.turn;
      step = null;
      continue;
    }
    if (event.type === 'turn/end') {
      if (step !== null) violations.push({ event, why: `turn/end while step ${turn}/${step} is open` });
      step = null;
      continue;
    }
    if (event.type === 'step/start') {
      turn = typeof data.turn === 'number' ? data.turn : turn;
      step = typeof data.step === 'number' ? data.step : null;
      continue;
    }
    if (event.type === 'step/end') {
      step = null;
      continue;
    }
    if (!STEP_SCOPED.has(event.type)) continue;
    if (step === null) {
      violations.push({ event, why: `no step is open, but the row claims turn ${data.turn} step ${data.step}` });
      continue;
    }
    if (data.turn !== turn || data.step !== step) {
      violations.push({ event, why: `row claims turn ${data.turn} step ${data.step}, open step is ${turn}/${step}` });
    }
  }
  return violations;
}

const [path, ...flags] = process.argv.slice(2);
if (!path) {
  console.error('usage: node scripts/audit-session.mjs <session.v4.jsonl.zstd> [--fix]');
  process.exit(2);
}
const fix = flags.includes('--fix');

const { bytes, offsets, rows } = readLog(path);
const violations = audit(rows);
console.log(`log         ${path}`);
console.log(`bytes       ${bytes.toLocaleString('en-US')}`);
console.log(`frames      ${offsets.length}`);
console.log(`events      ${rows.length}`);
console.log(`violations  ${violations.length}`);

if (violations.length > 0) {
  for (const item of violations.slice(0, 20)) {
    console.log(`  seq ${item.event.seq} ${item.event.type} — ${item.why} (frame @${item.event.frame})`);
  }
  if (violations.length > 20) console.log(`  … ${violations.length - 20} more`);
  const kept = rows.filter((event) => !violations.some((item) => item.event === event));
  const remaining = audit(kept).length;
  console.log(`after dropping those rows: ${kept.length} events, ${remaining} violations`);
}

if (!fix) process.exit(violations.length === 0 ? 0 : 1);

if (violations.length === 0) {
  console.log('nothing to fix');
  process.exit(0);
}

const badFrames = [...new Set(violations.map((item) => item.event.frame))].sort((a, b) => a - b);
const lastGoodFrame = offsets.filter((offset) => offset < badFrames[0]).at(-1);
if (lastGoodFrame === undefined) {
  console.error('refusing to fix: the very first frame of the log already violates the format rules.');
  console.error('the damage is not a trailing marker; restore the session from a backup instead.');
  process.exit(1);
}
const trailing = offsets.slice(offsets.indexOf(lastGoodFrame) + 1);
const onlyTrailing = badFrames.every((frame) => trailing.includes(frame));
if (!onlyTrailing) {
  console.error('refusing to fix: violations are not confined to the trailing frames of the log.');
  process.exit(1);
}

const backup = `${path}.bak`;
copyFileSync(path, backup);
truncateSync(path, lastGoodFrame);
const after = readLog(path);
const left = audit(after.rows);
console.log(`backup      ${backup}`);
console.log(`truncated   ${bytes.toLocaleString('en-US')} → ${statSync(path).size.toLocaleString('en-US')} bytes`);
console.log(`dropped     ${(bytes - statSync(path).size).toLocaleString('en-US')} trailing bytes across ${trailing.length} frame(s)`);
console.log(`now         ${after.rows.length} events, ${left.length} violations`);
process.exit(left.length === 0 ? 0 : 1);
