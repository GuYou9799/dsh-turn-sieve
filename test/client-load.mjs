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
for (const name of ['dts-hidden-node', 'dts-selected-node', 'dts-sel-first', 'dts-sel-last', 'dts-force-reveal', 'dts-confirm', 'dts-cancel', 'dts-scope-pill', 'dts-sheen', 'dts-overlay-glass']) {
  if (!source.includes(name)) throw new Error(`missing style rule for .${name}`);
}
for (const name of ['quickConfirmGroupTitle', 'quickConfirmMessageTitle', 'scopeGroup', 'scopeMessage', 'quickCancelSelection']) {
  if (!source.includes(name)) throw new Error(`missing string key ${name}`);
}
for (const name of ['dts-bubble', 'quickSwitchToMessage', 'quickRemoveGroup']) {
  if (source.includes(name)) throw new Error(`stale v0.5.0 modal artifact ${name} is still present`);
}
if (!source.includes('/api/dsh-turn-sieve/hidden')) throw new Error('missing hidden-nodes route');
console.log('client module loaded; registrations:', names.join(', '));