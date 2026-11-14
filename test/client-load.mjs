import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('lib/client.js', 'utf8');
const registrations = [];
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
for (const name of ['dts-hidden-node', 'dts-selected-node', 'dts-listin', 'content-visibility:auto', 'dts-force-reveal', 'dts-confirm', 'dts-cancel', 'dts-scope-pill', 'data-dts-effects', 'dts-fadein', 'dts-popin']) {
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
const backdropCount = (css.match(/[^-]backdrop-filter:/g) || []).length;
if (backdropCount > 4) throw new Error(`too many backdrop filters for a smooth panel: ${backdropCount}`);
for (const line of css.split('\n')) {
  if (!line.includes('backdrop-filter:')) continue;
  if (line.includes('[data-dts-effects=') || line.trimStart().startsWith('@media')) continue;
  throw new Error(`backdrop-filter outside the effects switch: ${line.slice(0, 90)}`);
}
if (!/\[data-dts-effects="off"\][^{]*\{[^}]*animation:none!important/.test(css)) {
  throw new Error('missing the single-attribute effects kill switch');
}
if (!css.includes('--dsw-alias-bg-mask-1')) throw new Error('the scrim no longer follows the host mask token');
if (!/@keyframes dts-popin\{[^}]*transform:/.test(css)) {
  throw new Error('the entrance animation no longer runs on transform/opacity only');
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
if (/\[data-dts-effects="on"\] \.dts-overlay\{[^}]*backdrop-filter/.test(css)) {
  throw new Error('the full-viewport scrim blur is back and will cost frames');
}
if (!/\[data-dts-effects="on"\] \.dts-dialog\{[^}]*backdrop-filter:blur\(2\dpx/.test(css)) {
  throw new Error('effects on no longer frost the panel visibly');
}
if (!/\[data-dts-effects="on"\] \.dts-list-wrap\{animation:dts-listin/.test(css)) {
  throw new Error('the mode switch no longer animates under the effects switch');
}
if (source.includes('index: items.indexOf(item)')) {
  throw new Error('the row list is quadratic again');
}
// v0.7.4: effects default to OFF and the legacy preferences are dropped
if (!/readEffectsPref\(\)\s*\{[^}]*getItem\(EFFECTS_KEY\) === '1'/.test(source)) {
  throw new Error('effects no longer default to off');
}
if (!source.includes("removeItem('dts-glass')") || !source.includes("removeItem('dts-motion')")) {
  throw new Error('the legacy glass/motion preferences are not cleaned up');
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
console.log('client module loaded; registrations:', names.join(', '));