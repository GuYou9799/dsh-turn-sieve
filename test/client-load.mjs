import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('lib/client.js', 'utf8');
const registrations = [];
let loaded = null;
const React = {
  createElement: () => null,
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  Fragment: 'fragment',
};
const window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      if (id !== 'dsh-turn-sieve') throw new Error(`unexpected id ${id}`);
      const plugin = factory((name) => {
        if (name === 'react') return React;
        if (name === 'react-dom') throw new Error('no react-dom in test');
        throw new Error(`unexpected require ${name}`);
      });
      if (plugin.name !== 'dsh-turn-sieve') throw new Error('missing plugin name');
      loaded = plugin;
      plugin.apply({
        slots: {
          inject(name, run) { run(); },
          register(definition, component) {
            registrations.push({ definition, component });
          },
        },
      });
    },
  },
};
const context = vm.createContext({
  window,
  navigator: { language: 'zh-CN' },
  document: { getElementById: () => null, createElement: () => ({ style: {}, textContent: '' }), head: { appendChild() {} } },
  console,
  setTimeout,
  clearTimeout,
});
vm.runInContext(source, context, { filename: 'lib/client.js' });
if (registrations.length !== 2) throw new Error(`expected 2 slot registrations, got ${registrations.length}`);
const names = registrations.map((entry) => `${entry.definition.name}:${entry.definition.id}`);
if (!names.includes('conversation.session.header.utilities:dsh-turn-sieve:open')) throw new Error(`missing header ${names}`);
if (!names.includes('conversation.chat.assistant-actions:dsh-turn-sieve:quick')) throw new Error(`missing quick ${names}`);
for (const entry of registrations) {
  if (typeof entry.component !== 'function') throw new Error(`slot ${entry.definition.id} has no component`);
}
for (const name of ['dts-star', 'dts-star-glyph', 'dts-star-spark', 'dts-star-pop', 'dts-hidden-node', 'dts-selected-node', 'dts-veil', 'dts-veil-box', 'content-visibility:auto', 'dts-force-reveal', 'dts-confirm', 'dts-cancel', 'dts-scope-pill']) {
  if (!source.includes(name)) throw new Error(`missing style rule for .${name}`);
}
for (const name of ['quickConfirmGroupTitle', 'quickConfirmMessageTitle', 'scopeGroup', 'scopeMessage', 'quickCancelSelection', 'scopePrompt', 'scopeReply', 'quickUserTitle', 'quickConfirmPromptTitle', 'quickConfirmReplyTitle']) {
  if (!source.includes(name)) throw new Error(`missing string key ${name}`);
}
for (const name of ['dts-bubble', 'quickSwitchToMessage', 'quickRemoveGroup', 'dts-sel-first', 'dts-sel-last']) {
  if (source.includes(name)) throw new Error(`stale artifact ${name} is still present`);
}
for (const name of ['dts-user-sieve', 'ensureUserControls', '13:input-message', 'dts-armed-host', 'function scopePlan', 'function availableScopes', 'function armFromMessage', 'function deleteSelection', 'armedNoticeHost', 'cacheRef']) {
  if (!source.includes(name)) throw new Error(`missing user-row sieve code ${name}`);
}
// v0.6.0: the dark left bar inside the selection shadow must be gone
if (/dts-selected-node[^}]*inset 3px 0 0/.test(source)) {
  throw new Error('the selection shadow still paints the dark left bar');
}
// v0.7.4: the panel must stay smooth — no liquid glass, no looping animation,
// no decorative blur layer, and blur only behind the single effects switch.
const css = source.slice(source.indexOf('const CSS ='), source.indexOf('function ensureStyle'));
for (const name of ['.dts-glass', '.dts-motion', 'dts-sheen', 'dts-liquid-a', 'dts-liquid-b', 'dts-overlay-glass']) {
  if (css.includes(name)) throw new Error(`stale liquid-glass artifact ${name} is still in the stylesheet`);
}
if (/\binfinite\b/.test(css)) throw new Error('the stylesheet still runs an infinite animation');
if (/(^|[^-])filter:\s*blur\(/.test(css)) throw new Error('the stylesheet still rasterizes a blurred decorative layer');
// v1.4.1: the effects switch is gone, so the panel is ONE plain host surface.
// A stray blur, gradient plate or effects-gated rule would now be unreachable
// styling that nobody can turn off — assert the whole family is really removed.
if (/[^-]backdrop-filter:/.test(css)) throw new Error('the panel still asks for a backdrop filter with no switch to turn it off');
for (const name of ['data-dts-effects', 'dts-fadein', 'dts-popin', 'dts-listin', 'dts-toggle-dot', '.dts-toggle{']) {
  if (css.includes(name)) throw new Error(`effects-era styling survived its removal: ${name}`);
}
if (!css.includes('--dsw-alias-bg-mask-1')) throw new Error('the scrim no longer follows the host mask token');
if (!/@keyframes dts-pop\{[^}]*transform:/.test(css)) {
  throw new Error('the armed cluster lost its one-shot entrance');
}
// v0.7.5: the selection highlight is the selected nodes' own rounded background.
// An absolutely positioned overlay was removed for good: measured against a chat that
// scrolls, pages and re-renders it kept ending up outside the conversation column,
// while a node background cannot exceed the node by construction.
if (!/\[data-chat-node-key\]\.dts-selected-node[^{]*\{[^}]*border-radius:18px/.test(css)) {
  throw new Error('the selection highlight lost its rounded corners');
}
if (!/\[data-chat-node-key\]\.dts-selected-node[^{]*\{[^}]*box-shadow:0 12px 30px -16px/.test(css)) {
  throw new Error('the selection highlight lost its contained soft shadow');
}
if (!/\[data-chat-node-key\]\.dts-selected-node[^{]*\{[^}]*background:color-mix/.test(css)) {
  throw new Error('the selection highlight is not painted on the selected nodes any more');
}
if (/dts-selection-veil|layoutVeils|veilHostFor|VEIL_PAD/.test(source)) {
  throw new Error('the absolutely positioned veil is back: it cannot be contained to the conversation column');
}
if (!source.includes('painted.forEach((el) => el.classList.add(SELECTED_NODE_CLASS));')) {
  throw new Error('paintSelection no longer marks the selected nodes themselves');
}
if (/showDiag|TEMP-DIAG|dts-diag|__dtsDiag/.test(source)) {
  throw new Error('the temporary self-check panel must never ship');
}
if (!source.includes('const ours = (node)')) {
  throw new Error('the observer lost the filter that ignores in-chat control writes');
}
if (!source.includes('dts-armed-notice')) {
  throw new Error('an armed notice card lost its own highlight class');
}
if (!/renderNoticeControl\(entry\);\s*paintSelection\(activeSelection\);/.test(source)) {
  throw new Error('arming a notice card must repaint immediately, not on the next unrelated mutation');
}
if (!source.includes('function paintSelectionNow')) {
  throw new Error('paintSelection lost its re-entrancy guard');
}
// The panel must never gain a full-viewport blur again: it is the one effect that
// re-samples the whole transcript on every frame.
if (/\.dts-overlay\{[^}]*backdrop-filter/.test(css)) {
  throw new Error('the full-viewport scrim blur is back and will cost frames');
}
if (source.includes('index: items.indexOf(item)')) {
  throw new Error('the row list is quadratic again');
}
// v1.4.1: the retired preference keys are cleaned up, not merely ignored — a stale
// dts-effects flag would otherwise re-apply a panel style nothing can switch off.
for (const key of ['dts-effects', 'dts-star-offered', 'dts-glass', 'dts-motion']) {
  if (!source.includes(`removeItem('${key}')`)) throw new Error(`the retired preference ${key} is not cleaned up`);
}
if (/function (readEffectsPref|applyEffectsPref|toggleEffects)/.test(source)) {
  throw new Error('the effects switch is still wired up');
}
if (/localStorage\.setItem\(STAR_KEY/.test(source) || /\bL\.starred\b/.test(source)) {
  throw new Error('the Star button still claims a Star the user may not have given');
}
for (const name of ['glassTitle', 'motionTitle', 'toggleGlass', 'toggleMotion', 'dts-overlay-glass']) {
  if (source.includes(name)) throw new Error(`stale toggle code ${name} is still present`);
}
if (!source.includes('/api/dsh-turn-sieve/hidden')) throw new Error('missing hidden-nodes route');
// v0.7.0: every in-turn notice card must be sieveable on its own
for (const name of [
  'NOTICE_KINDS', 'NOTICE_KIND_SET', 'ensureNoticeControls', 'renderNoticeControl',
  'dts-notice-sieve', 'dts-notices:', 'restoreAllNotices', 'hideNoticeKey',
  'noticeTurns', 'hiddenNoticeTurns', 'append_failed', 'appendFailed',
  'turn-error', 'turn-tail', 'turn-max-tokens', 'model-retry', 'manual-compaction',
]) {
  if (!source.includes(name)) throw new Error(`missing notice sieve code ${name}`);
}
// v0.7.0: notices of a pruned turn disappear together with that turn
if (!source.includes('data-chat-flow-kind=')) {
  throw new Error('notice hiding no longer matches the chat flow kind');
}
// v1.2.1: a card must be found through any key attribute the host emits, and its
// control must be visible without a hover path that some cards never satisfy.
for (const name of ['noticeHost', 'noticeStoreKey', 'parseNoticeKey', 'NOTICE_KEY_ATTRS', 'data-chat-flow-key']) {
  if (!source.includes(name)) throw new Error(`missing notice host resolution ${name}`);
}
// v1.3.1: the notice control is a capsule that stays invisible until the card that
// owns it is hovered, then takes pointer events back.
if (!source.includes('.dts-notice-sieve:hover')) {
  throw new Error('the notice control cannot be reached with the pointer at all');
}
if (!/.dts-notice-sieve{[^}]*opacity:0/.test(source) || !/.dts-notice-sieve{[^}]*pointer-events:none/.test(source)) {
  throw new Error('the notice control is visible without hovering its card');
}
if (!/\[data-dts-notice-host\]:hover>\.dts-notice-sieve[^{]*{[^}]*pointer-events:auto/.test(source)) {
  throw new Error('hovering the card never re-enables the notice control');
}
if (!source.includes("setAttribute('data-dts-notice-host', '1')")) {
  throw new Error('the notice host is not tagged, so the reveal rule cannot match');
}
if (source.includes("'dts-user-sieve dts-notice-sieve'")) {
  throw new Error('a notice root borrows the message control class and displaces it');
}
if (!source.includes("root.className = 'dts-notice-sieve'")) {
  throw new Error('the notice control lost its own class');
}
if (!source.includes('catch { /* skip this card, keep the rest */ }')) {
  throw new Error('one broken card can still abort the whole control pass');
}
if (!source.includes('catch { /* one broken card stays unsieveable */ }')) {
  throw new Error('the nothing-hidden branch returns before any control is created');
}
if (!source.includes('try { paintSelection(activeSelection); } catch { /* the preview is cosmetic */ }\n        return;')) {
  throw new Error('the nothing-hidden branch returns without repainting an armed preview');
}
if (!source.includes('ensureUserControls(); } catch { /* keep whatever is already mounted */ }')) {
  throw new Error('message controls are not refreshed independently of the notice pass');
}
// v1.3.3: the preview is one region, not a pile of per-row tints.
if (!source.includes("setAttribute('data-dts-veil', 'on')")) {
  throw new Error('the selection region layer is never switched on');
}
if (!source.includes("document.querySelectorAll('[data-chat-group-key]')")) {
  throw new Error('the collapsed process group is left out of the selection region');
}
const mergeRuns = loaded?.__test?.mergeRuns;
if (typeof mergeRuns !== 'function') throw new Error('mergeRuns is not exposed for geometry checks');
const stacked = mergeRuns([
  { left: 10, top: 0, right: 110, bottom: 20 },
  { left: 10, top: 22, right: 110, bottom: 40 },
  { left: 10, top: 41, right: 110, bottom: 60 },
]);
if (stacked.length !== 1) throw new Error(`adjacent rows must merge into one box, got ${stacked.length}`);
if (stacked[0].top !== 0 || stacked[0].left !== 10) throw new Error('the merged box lost its origin');
if (stacked[0].width !== 100 || stacked[0].height !== 60) {
  throw new Error(`the merged box is ${stacked[0].width}x${stacked[0].height}, expected 100x60`);
}
const split = mergeRuns([
  { left: 10, top: 0, right: 110, bottom: 20 },
  { left: 10, top: 100, right: 110, bottom: 120 },
]);
if (split.length !== 2) throw new Error(`separated rows must stay apart, got ${split.length}`);
if (split[0].height !== 20 || split[1].height !== 20) throw new Error('a separated box lost its height');
const hollow = mergeRuns([
  { left: 0, top: 0, right: 100, bottom: 20 },
  { left: 200, top: 0, right: 300, bottom: 20 },
]);
if (hollow.length !== 2) throw new Error('side-by-side boxes must not merge into one wide box');

// The region must live in the transcript's own coordinates: a viewport-anchored
// layer slides away from its rows as soon as the user turns the wheel, which is
// exactly the bug this asserts against.
if (source.includes('position:fixed;pointer-events:none;z-index:2147482000')) {
  throw new Error('the region is anchored to the viewport instead of the transcript');
}
if (!source.includes('host.appendChild(veilLayer)')) {
  throw new Error('the region layer is not hosted by the transcript scroll container');
}
const veilFrame = loaded?.__test?.veilFrame;
const toScrollRect = loaded?.__test?.toScrollRect;
if (typeof veilFrame !== 'function' || typeof toScrollRect !== 'function') {
  throw new Error('the region geometry is not exposed for checks');
}
const host = {
  scrollTop: 0,
  scrollLeft: 0,
  clientTop: 0,
  clientLeft: 0,
  getBoundingClientRect: () => ({ left: 40, top: 100 }),
};
const atTop = toScrollRect({ left: 40, top: 300, right: 440, bottom: 340, width: 400, height: 40 }, veilFrame(host));
if (atTop.top !== 200 || atTop.left !== 0) {
  throw new Error(`the row is placed at ${atTop.left},${atTop.top} instead of 0,200`);
}
// Same row, measured again after the transcript scrolled by 120px: the box must
// land on the very same pair, or the region would drift with the scroll.
host.scrollTop = 120;
const afterScroll = toScrollRect({ left: 40, top: 180, right: 440, bottom: 220, width: 400, height: 40 }, veilFrame(host));
if (JSON.stringify(afterScroll) !== JSON.stringify(atTop)) {
  throw new Error(`scrolling moved the region: ${JSON.stringify(atTop)} vs ${JSON.stringify(afterScroll)}`);
}
// v1.4.1: the panel header offers a Star and nothing else besides the close button.
if (!source.includes("const STAR_URL = 'https://github.com/GuYou9799/dsh-turn-sieve'")) {
  throw new Error('the Star nudge has no repository to open');
}
const starAt = source.indexOf("className: 'dts-star'");
if (starAt < 0) throw new Error('the Star nudge is not rendered');
if (!source.includes("window.open(STAR_URL, '_blank', 'noopener,noreferrer')")) {
  throw new Error('the Star nudge does not open the repository in a new tab');
}
if (/ofm_star|dsh-our-free-model/.test(source)) {
  throw new Error('the Star nudge must not reference another plugin');
}
// The header cluster must hold the Star and the close button only: the retired
// effects switch left an empty wrapper that would keep reserving its slot.
const toggles = source.slice(source.indexOf("className: 'dts-view-toggles'"), source.indexOf("className: 'dts-ghost'"));
if (/dts-toggle/.test(toggles)) throw new Error('a toggle survived in the header cluster');
// Clicking Star must not fabricate state: no stored flag, no "Starred" label.
if (/STAR_KEY/.test(source)) throw new Error('the Star button still stores a guessed starred flag');
if (!/const openRepo = \(\) => \{[\s\S]*?setNotice\(L\.starOpened\)/.test(source)) {
  throw new Error('the Star click no longer reports that the repository was opened');
}
console.log('client module loaded; registrations:', names.join(', '));