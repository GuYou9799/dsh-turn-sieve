import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('./lib/client.js', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src.length;
const log = [];

function cut(startMark, endMark, replacement, label) {
  const start = src.indexOf(startMark);
  if (start < 0) throw new Error(`start missing: ${label}`);
  const end = src.indexOf(endMark, start);
  if (end < 0) throw new Error(`end missing: ${label}`);
  src = src.slice(0, start) + replacement + src.slice(end);
  log.push(label);
}

function sub(find, replace, label) {
  const parts = src.split(find);
  if (parts.length !== 2) throw new Error(`anchor ${parts.length - 1}x: ${label}`);
  src = parts.join(replace);
  log.push(label);
}

/* 1. CSS: drop every absolutely positioned veil rule and paint the highlight on the
      selected nodes themselves. A node background can never exceed the node, so the
      highlight cannot spill out of the conversation again. */
sub(`.dts-selection-veil{position:absolute;pointer-events:none;border-radius:22px;background:color-mix(in srgb,currentColor 8%,transparent);box-shadow:0 14px 34px -14px rgba(0,0,0,.58),0 2px 10px -6px rgba(0,0,0,.32),inset 0 0 0 1.5px color-mix(in srgb,currentColor 26%,transparent);z-index:6}`,
`[data-chat-node-key].dts-selected-node,[data-chat-turn].dts-selected-node,[data-chat-group-key].dts-selected-node{background:color-mix(in srgb,currentColor 9%,transparent);border-radius:18px;box-shadow:0 12px 30px -16px rgba(0,0,0,.5),inset 0 0 0 1px color-mix(in srgb,currentColor 15%,transparent)}`, 'selected-node css');

sub(`.dts-selection-fallback{background:color-mix(in srgb,currentColor 10%,transparent);border-radius:20px;box-shadow:0 10px 26px -14px rgba(0,0,0,.5),inset 0 0 0 1px color-mix(in srgb,currentColor 16%,transparent)}\n`, '', 'fallback css');

sub(`[data-dts-effects="on"] .dts-selection-veil{animation:dts-veil-in .18s ease-out}\n`, '', 'veil animation');
sub(`@keyframes dts-veil-in{from{opacity:0;transform:scale(.994)}to{opacity:1;transform:none}}\n`, '', 'veil keyframes');

/* 2. JS: delete the whole veil machinery — it is what produced an overlay that could
      end up anywhere on the page. */
cut(`    /** Only an element that actually generates a box`, `    function paintSelection(selection) {`, '', 'veil functions');

cut(`    function releaseVeils() {`, `    function clearSelectedNodes() {`, '', 'releaseVeils');

sub(`    function clearSelectedNodes() {
      clearSelectedClasses();
      releaseVeils();
      veilDisabled = false;
    }`,
`    function clearSelectedNodes() {
      clearSelectedClasses();
    }`, 'clearSelectedNodes');

sub(`    let veilHost = null;
    let veilHostPosition = null;
    let veilHostIsolation = null;
    /** Sticky once a veil failed verification, so we stop retrying. Without it every paint
        retried the chat host first, failed, released the veil and re-appended it to
        <body> — two DOM writes per paint, which the MutationObserver turned into a
        200 ms rebuild loop that read as endless flicker. */
    let veilDisabled = false;
    let painting = false;
    const VEIL_PAD_X = 0;
    const VEIL_PAD_TOP = 4;
    const VEIL_PAD_BOTTOM = 6;`,
`    let painting = false;`, 'veil state');

sub(`    const VEIL_CLASS = 'dts-selection-veil';\n`, '', 'veil class const');

/* 3. paintSelectionNow: just mark the nodes; nothing is measured or positioned. */
sub(`      const clusters = [];
      let painted = [];
      if (selection) {
        const targets = selectionTargets(selection);
        targets.forEach((el) => el.classList.add(SELECTED_NODE_CLASS));
        if (targets.length > 0) clusters.push(...clusterTargets(targets));
        if (selection.actionEl) forceReveal(selection.actionEl);
        painted = targets;
      }
      if (armedNoticeHost?.isConnected) {
        clusters.push(...clusterTargets([armedNoticeHost]));
        painted = painted.concat([armedNoticeHost]);
      }
      // Safety net: when the veil cannot be placed exactly where the selection is
      // (paged-out node, detached host, unexpected containing block) fall back to a
      // rounded per-node highlight, so a selection is never invisible.
      const veilOk = layoutVeils(clusters);
      painted.forEach((el) => el.classList.toggle(FALLBACK_CLASS, !veilOk));`,
`      const painted = [];
      if (selection) {
        const targets = selectionTargets(selection);
        targets.forEach((el) => el.classList.add(SELECTED_NODE_CLASS));
        if (selection.actionEl) forceReveal(selection.actionEl);
        painted.push(...targets);
      }
      if (armedNoticeHost?.isConnected) painted.push(armedNoticeHost);
      /* The highlight is the selected nodes' own background: an absolutely positioned
         overlay measured against a chat that scrolls, pages and re-renders kept ending
         up outside the conversation column, while a node background cannot exceed the
         node by construction. Every selected node gets the same 18px rounding. */
      painted.forEach((el) => el.classList.add(SELECTED_NODE_CLASS));`, 'paintSelectionNow');

writeFileSync(file, src, 'utf8');
console.log(`veil removal (${log.length} edits): ${before} -> ${src.length} chars`);
