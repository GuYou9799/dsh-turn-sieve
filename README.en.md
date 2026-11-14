# dsh-turn-sieve · Turn Sieve

[![CI](https://github.com/GuYou9799/dsh-turn-sieve/actions/workflows/ci.yml/badge.svg)](https://github.com/GuYou9799/dsh-turn-sieve/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-turn-sieve.svg)](https://www.npmjs.com/package/dsh-turn-sieve)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![DSH 0.2.2-rc.3](https://img.shields.io/badge/DSH-0.2.2--rc.3-4c8dff.svg)
![Node >= 24.9.0](https://img.shields.io/badge/node-%E2%89%A524.9.0-339933.svg)
[![dshmarket](https://img.shields.io/badge/dshmarket-listed-8b5cf6.svg)](https://dshmarket.com)

[中文 README](README.md) | **English**

> Drop the exchanges or single messages that no longer matter — without starting a new session — and undo the last removal if you change your mind.

A DSH session log is append-only: once a conversation runs long, early small talk, wrong turns and repetitive debugging keep occupying the context forever. `dsh-turn-sieve` adds a **Turn Sieve** entry to the utilities area at the top right of a session, listing the current conversation by **whole exchange** or by **single message** so you can tick off the parts that should stop reaching the model.

Since 0.6.0, **every row in the chat can be sieved**, and no dialog is involved at any point:

- Assistant replies: hover a reply and **Sieve** appears in its action row on the right;
- Your own messages: hover the message and **Sieve** floats in on the **left** of the bubble;
- One click selects that part in place — the background deepens, the first and last corners round to 18px, and a soft shadow appears;
- The same spot then shows **✓ (confirm the removal)**, **✕ (cancel)** and a scope switch: **Exchange / Prompt / Reply / Only this**;
- Switching scope moves the highlight immediately, so you can see exactly what will go before you confirm;
- After ✓ the content **disappears from the transcript right away** (the client hides the matching chat nodes) and stops entering the following context; one click on undo in the Turn Sieve panel brings it back.

> ✓ means "yes, this is the selection" and ✕ means cancel — the semantics were deliberately fixed in 0.5.1.

![npm](https://img.shields.io/npm/v/dsh-turn-sieve)

## Installation

In the DSH Web plugin page click **Add plugin** and enter:

```text
dsh-turn-sieve
```

or from the command line:

```bash
dsh plugin add dsh-turn-sieve
```

No restart is needed: open any session and the funnel icon with **Turn Sieve** is already in the top-right utilities area.

## Usage

1. Open a session that already has several turns.
2. Click **Turn Sieve** at the top right. The panel uses the host-native look by default (no backdrop blur, no looping animation); the **Effects** switch in its header turns on mask blur and the entrance animations, and the preference is stored locally.
3. Pick a mode:
   - **By exchange**: one prompt together with every reply and tool call it produced, treated as a whole;
   - **By message**: tick individual messages, for example to drop one long reply or one tool output.
4. Type a keyword in the search box above the list to narrow it down. Once rows are ticked, a sticky **About to remove** panel appears above the list; it mirrors the original prompt and reply from the conversation so you can double-check before confirming.
5. Tick whatever you no longer need (multi-select, or select every removable row).
6. Click **Remove selected exchanges / messages**, then click once more to confirm.
7. Changed your mind? Click **Undo last removal** and confirm to restore the most recent removal.

### Sieve straight from the chat (recommended)

When you would rather not open a long list, work directly in the conversation — **every row works**:

- **Assistant reply**: hover it and **Sieve** appears in the action row on the right;
- **Your own message**: hover it and **Sieve** floats in on the left of the bubble;
- **No dialog at all**: the click selects that part in place — deeper background, 18px rounded corners at both ends, soft shadow (and no black bar on the left any more);
- Default scope: **Exchange** when you enter from an assistant reply, **Prompt** when you enter from your own message; if a scope is protected the plugin falls back to an available one;
- Four scopes appear automatically, depending on what the part actually contains:
  - **Exchange**: this prompt plus every assistant reply and tool call it produced;
  - **Prompt**: only your messages in this part, keeping the assistant reply;
  - **Reply**: only the assistant replies and tool calls in this part, keeping your prompt;
  - **Only this**: just the message you clicked (offered when **Reply** spans more than one message);
- The highlight follows the scope switch immediately, so you can see exactly which rows will go before confirming;
- **✓** removes: the content **vanishes from the transcript at once** (the client hides the corresponding chat nodes) and leaves the following context;
- **✕** cancels the selection and everything looks as before;
- Afterwards, **Undo last removal** in the Turn Sieve panel makes the content reappear in its original place.

#### Stopped and failed turns can be sieved too

As long as the agent is **not currently running**, the newest exchange is no longer locked — turns you stopped manually, that timed out or that failed can be sieved like any other. Only while the agent is still working does the newest exchange show as in progress and refuse removal, so a context that is being written is never damaged.

#### In-turn notice cards can be sieved as well

Cards such as **Stopped**, **This turn failed**, **Model request retried**, **Length limit reached**, **Context compaction** or **Command** show a **Sieve** button in their top-right corner on hover; click it and confirm with **✓** to hide the card, or **✕** to cancel. When you sieve a whole exchange, that turn's notice cards disappear with it, so nothing misleading is left behind for the next turn.

Worth stating plainly: these notices are **not part of the model context** — a DSH surface only contains `system/message`, `developer/message`, `user/message`, `assistant/message` and `tool/result`. Notice cards are interface state; they cannot mislead the model, but they do clutter reading. Hiding them is therefore purely a front-end action, recorded per session in the browser (`localStorage` key `dts-notices:<sessionId>`), and **Restore notices (N)** at the bottom of the main panel brings all of them back.

Every row in the list shows (and lets you verify):

- how the exchange or message starts;
- which turn it belongs to and how many messages it contains (exchange mode);
- roughly how many tokens it occupies;
- how many tool calls it contains;
- whether it is a runtime injection;
- why it is protected, when it is.

After removal these parts no longer enter the following model context; the current context shrinks immediately and the next request already reflects it.

## The two modes

### By exchange

- A new part starts at every **real user input** and collects every assistant reply and tool call that input triggered;
- The system prompt and the initial session context are protected;
- **The newest part is protected only while the agent is still running**: stopped, failed or already finished turns can be removed normally;
- Best for clearing a whole wrong direction or a long debugging detour.

### By message

- One selectable unit per message;
- An assistant message containing a tool call is removed together with the matching tool results, so no dangling tool-call history is left;
- Only the system/developer context at surface node 0 is protected, **the newest turn is not** — the point of this mode is dropping one unwanted reply;
- Best for a single very long tool output, a repeated answer or an irrelevant greeting.

## Undo

- Only the **most recent** removal keeps an undo record;
- Undo re-appends the original messages to the session log and lifts the client-side hiding for that range. Assistant replies and tool calls reappear **in place**; a restored user prompt gets a fresh message id and therefore shows up at the end of the transcript, but it does re-enter the following context;
- Undo records live in Host process memory and are gone after a DSH restart;
- Undo is refused while the assistant is replying — wait for the turn to finish.

## Safety boundaries

- **The raw log is never deleted.** The plugin only appends an empty `system/message` event to the session and covers the selected range with a `replace` surface operation. The original events stay intact in the session log and remain available for export or audit.
- **"Gone from the transcript" is a client-side visual clear.** The Host derives the affected chat nodes for a pruned range (`GET /api/dsh-turn-sieve/hidden`) and the client hides them. After a page refresh, a session reload or a DSH restart the hidden set is rebuilt automatically from the removal markers in the log — no extra switch involved.
- **The system prompt and the initial session context are protected.** System/developer context containing surface node 0 is never removed.
- **Exchange mode protects only the newest turn, and only while it runs.** Message mode allows removing recent content, but a tool call and its results always stay together.
- **No changes while the assistant is replying.** The plugin refuses to modify an unfinished turn; try again once it ends.
- **Tool calls are never split.** An assistant tool call and its matching tool result are treated as one unit, so no incomplete tool history is produced.
- **Undo is one level deep** and kept in memory, so it is lost when the Host restarts.
- **Hiding notice cards is local view state.** They were never in the model context; the record is kept per session in the browser `localStorage`, so another browser or cleared site data shows them again. **Restore notices** in the panel footer recovers them at any time.
- **Write failures are reported honestly.** If DSH rejects the sieve marker (for example because the session is being written), the plugin returns its own explanation instead of leaking the underlying validator text, and it never leaves a half-removed state.

## Relation to context-compaction plugins

`dsh-turn-sieve` is not automatic compaction:

- Compaction plugins (`dsh-compaction-basic`, `billion-context`, …) summarise older content into a checkpoint automatically when the context approaches its limit;
- Turn Sieve is **manual and selective**: you decide which exchanges or messages stopped mattering and remove them from the future context directly, without generating a summary and without spending an extra summarising request.

Both can be installed at the same time.

## How it works

A DSH `Session` has a "surface": the log keeps every event, while the surface decides which events are projected into model messages. `dsh-turn-sieve` does the following:

1. It reads `session.surface.nodes` and scans the events in surface order:
   - Exchange mode: every **real user input** opens a new part. The runtime context DSH injects at each step (`source.kind === 'runtime-context'`, plus `Time sampled...`, `Current runtime context.`, `<system-reminder>`, `<hindsight_pages>` and friends in older sessions) is recorded as `user/message` too, but it is merged into the current part instead of splitting it. The leading system/developer context forms its own protected part.
   - Message mode: one unit per event; a tool call inside an assistant message waits for its matching tool result and both merge into one atomic unit; empty system markers left by earlier removals stay hidden.
2. For every unit it builds a preview, a message count, a tool-call count and a token estimate.
3. When you confirm, it appends this for each selected range:

```js
session.append('system/message', {
  turn,                       // >= 1, format v4 requires a positive turn
  step: index + 1,            // >= 1, format v4 requires a positive step
  message: { id, role: 'system', source: { kind: 'system-prompt' }, content: [] },
}, {
  surfaceOp: { op: 'replace', startSeq, endSeq },
  sourceEventSeqs: shadowedSeqs,
});
```

An empty system message is never projected into a model message, so the whole range disappears from `deriveMessages()`; the log itself is untouched.

4. Before removing, the covered original events are copied into an in-memory undo slot. Undo re-appends them with `surfaceOp: 'append'` and writes a `turn-sieve-restored-…-r<startSeq>-<endSeq>` marker.
5. Every removal marker encodes the range it covered in its message id (`turn-sieve-<stamp>-<index>-r<startSeq>-<endSeq>[-t<turns>][-n<noticeTurns>]`). `hiddenState(session)` only has to scan the session events to recover "which ranges were sieved": every event inside a range maps to a chat node key (`13:input-message<messageId>`, `14:assistant-step<turn>:<step>`, `9:tool-call<callId>`, `16:developer-message<messageId>`), plus the turn numbers fully contained in the range for exchange mode. The client receives `{ keys, turns, noticeTurns, ranges }`, hides those DOM nodes, collapses a turn container once all of its children are hidden, and a `MutationObserver` re-applies everything after paging or remounting.

> Note: a replacement invalidates the KV-cache prefix from that range onwards. The next request carries visibly less input, while first-token latency may shift slightly — the normal cost of a surface replacement.

## Agent tool

The plugin also registers a `turn_sieve` tool, so the assistant can list, remove or undo when you explicitly ask:

- `action: "list"`: returns the units of the current session with protection flags and token estimates; `mode` may be `group` or `message`;
- `action: "prune"`: pass `mode` and `ranges: [{ startSeq, endSeq }]` to remove;
- `action: "undo"`: restores the most recent removal.

Tool and interface share the same Host logic, so they behave identically, and removals still only affect the current session.

## Appearance and effects

- **Default look**: the panel uses the host DSW variables directly (scrim `--dsw-alias-bg-mask-1`, surface `--dsw-alias-bg-overlay`, border `--dsw-alias-border-l2`), so light and dark themes both follow automatically. There is no backdrop blur and no looping animation, so an idle panel costs nothing per frame.
- **Effects switch (off by default)**: turning it on frosts one surface only — the panel gets `blur(22px) saturate(180%)` over a 68% translucent surface, a brighter border and a static specular highlight. The scrim itself is a plain tint and is **never blurred**: a full-viewport `backdrop-filter` was exactly what cost frames in 0.7.4. Entrances stay one-shot (a `.2s` scrim fade and a `.34s` `translateY + scale` pop), so on and off are visibly different.
- **Mode switching is no longer abrupt**: switching between “By exchange” and “By message” renders the previous payload instantly and refreshes quietly in the background, so there is no “clear → loading → refill” flash; the list container also plays a one-shot `.22s` fade-and-slide (only while effects are on).
- **Long lists stay cheap**: every row carries `content-visibility:auto` with `contain-intrinsic-size`, so 1300+ messages only paint the rows in view, and the O(n²) `items.indexOf(item)` call is gone from rendering.
- **Smoothness rules**: every animation runs once and only touches `opacity` / `transform` (compositor-only). The plugin has no looping animation, no decorative light blobs and no sheen layer, and `backdrop-filter` appears only on the panel behind the switch.
- **One kill switch**: the preference lives on the root attribute `data-dts-effects`; while it is off, a single rule forces `backdrop-filter` / `filter` / `animation` / `transition` / `will-change` back to none for everything the plugin renders, including the in-chat controls.
- Stored in the browser `localStorage` (`dts-effects`) and still applied after a refresh; the two preference keys left over from older versions are removed on first run.
- With `prefers-reduced-motion: reduce`, animation durations drop to `.01ms` and only the static look remains.
- **The highlight is painted on the selected messages themselves**: no extra absolutely positioned layer is generated any more — it kept being measured wrong, scrolling away from the selection and spilling outside the conversation column — instead every selected chat node gets its own rounded background (`border-radius:18px`, a translucent `currentColor` tint) plus one contained soft shadow (`0 12px 30px -16px`, no horizontal overshoot). The node is its own boundary, so the highlight can never cover the sidebars or the panel; whole exchanges, single messages, your own prompts and in-turn notice cards all share the same styling, with uniform rounded corners and no hard vertical bar.

## Limitations

- Only sessions currently active in the Host are supported; open an archived or unloaded session first.
- **Sieve** on an assistant reply appears in that reply's action row (only once the turn has finished); on your own messages it floats in from the left of the bubble on hover.
- "Gone from the transcript" is a client-side visual clear: the raw log is kept, so exporting the session or opening it on another device still shows the full content.
- The hidden set is derived per session and applied per browser tab; another tab needs a refresh to catch up.
- Undo covers only the most recent removal and only lives in memory; earlier removals cannot be undone after a restart (already hidden content stays hidden).
- Token counts come from `tokenMeter` estimates and are shown as approximate — use them to compare relative sizes.
- Requires DSH `>= 0.2.2-rc.3` (Node.js `>= 24.9.0`).

## Troubleshooting: a release-age error while updating another plugin

If updating any plugin in Plugin Manager fails outright and the log shows `ERR_PNPM_RESOLUTION_POLICY_VIOLATIONS_UNHANDLED` or “1 package violates the policy”, the blocker is DSH's supply-chain policy rather than this plugin:

- DSH installs plugins with pnpm and enables `minimumReleaseAge` (an observation window, about 24 hours): a version younger than the window may not be installed automatically.
- pnpm 11 verifies the **whole** lockfile before any mutation, so a single package still inside the window aborts the entire install — even when the plugin you are updating is a different one.
- This plugin is a `link:` dependency in the profile (it points at a local directory), so pnpm never resolves it from the registry and it cannot be the offending package.

Find the package that trips it:

```bash
node scripts/check-release-age.mjs
```

The script reads the profile's dependencies, asks npm when each one was published, lists the ones still inside the window and not yet exempted, and prints the lines to add.

Fix: append those lines under `minimumReleaseAgeExclude` in `~/.dsh/profiles/desktop/pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - some-package@1.2.3
```

Or bypass the window once by passing `--config.minimum-release-age=0` to the pnpm command. The lines can be removed once the window has passed.

## Changelog

- **1.1.0**: adds a diagnostic for failed plugin updates. `scripts/check-release-age.mjs` reads the profile's dependencies, asks npm when each one was published, lists the packages held back by DSH's `minimumReleaseAge` supply-chain policy, and prints the exact lines to add under `minimumReleaseAgeExclude`; the readme gains the matching troubleshooting section. This plugin is a `link:` dependency in the profile, so pnpm never resolves it from the registry and it cannot trip that policy. Runtime behaviour is identical to 1.0.1.
- **1.0.1**: docs and automation. Both readmes gained six badges under the title (CI, npm, License: MIT, DSH version, Node version, market listing); a GitHub Actions workflow (`.github/workflows/ci.yml`) runs `npm test` on Node 24 with no dependency install; the regression suite now asserts the badges and the workflow, so the docs and CI cannot silently fall behind. Runtime behaviour is identical to 1.0.0.
- **1.0.0**: first stable release. The selection feedback now lives on the selected chat nodes themselves — an 18px rounded tint plus one contained soft shadow — so a node is its own boundary: the highlight can never spill outside the conversation column or cover the sidebars and the panel. Whole exchanges, single messages, your own prompts and in-turn notice cards all share the same highlight, and an armed notice card shows it in the same frame as the click. The old absolutely positioned veil (measured wrong, drifting away while scrolling, sometimes landing elsewhere in the window) is deleted along with all its positioning and measurement code, so the flicker caused by rebuilding it on every paint is gone too. Effects, mode switching and long-list performance follow the 0.7.5 design. Tests: 23 host + 10 docs + client assembly.
- **0.7.5**: three visual problems fixed. (1) The in-chat selection highlight is now painted on the selected chat nodes themselves — an 18px rounded tint plus one contained soft shadow — instead of a separate absolutely positioned layer, which was measured wrong, drifted away from the selection while scrolling and spilled outside the conversation column. The node is its own boundary, so the highlight can never exceed the conversation or cover the sidebars, and whole exchanges, single messages, your own prompts and in-turn notice cards all share the same rounded styling. (2) An armed in-turn notice card now gets that same highlight, so it finally gives visible feedback (before, only its buttons changed). (3) Effects were rebuilt: the full-viewport scrim blur is gone, replaced by a single frosted panel layer (`blur(22px) saturate(180%)` plus a static specular highlight) that is visibly different from the off state; switching between “By exchange” and “By message” renders from cache with a one-shot `.22s` fade instead of flashing; every row gained `content-visibility:auto` and the O(n²) `items.indexOf` call was removed. The style-budget test now pins all of it: the highlight must be painted on the nodes with an 18px radius and a contained shadow, no absolutely positioned layer may return, the scrim must not blur again, effects on must frost the panel, the list animation must stay behind the effects switch, and list rendering must not go quadratic again.
- **0.7.4**: the panel look was rebuilt for smoothness — the liquid-glass layers that kept the compositor busy are gone (a full-viewport scrim blur, a `blur(46px)` panel, two `blur(46px)` decorative blobs with a sheen layer, and three looping animations; while enabled they made every frame re-sample the backdrop and measurably dropped frames). The default is now the host-native DSW surface, a new **Effects** switch (off by default) adds blur to two large surfaces plus one-shot entrances, and the root attribute `data-dts-effects` force-disables every filter / animation / transition the plugin renders. The in-chat ✓ / ✕, scope pills and selection highlight now use host variables too, the two stored preferences merge into a single `dts-effects`, and a style-budget regression test now forbids looping animations and decorative blur layers and only allows `backdrop-filter` behind the effects switch.
- **0.7.3**: adapted to and verified against DeepSeek Harness `0.2.2-rc.3` — the rc.2 and rc.3 `app.asar` archives were compared package by package, and every dependency of this plugin is byte-identical: `dsh-client-ui-chat` (chat node definitions, the `data-chat-node-key` DOM attributes, the hover-gated action row), `dsh-client-ui-conversation` (the node key formula and the slots), `dsh-session`, `dsh-session-persistence-jsonl` (the format v4 write validator), `dsh-token-meter`, `dsh-host-webserver` and `dsh-agent-loop`. The only slot rc.3 adds is `sidebar.session.action`; the `conversation.session.header.utilities` and `conversation.chat.assistant-actions` definitions this plugin uses are unchanged. Adds the `pins the chat node key mapping of DSH 0.2.2-rc.3` regression test (`contextKey` / `nodeKeysForEvent` are now exported and 12 mappings are pinned, including the premise that notice events are not surface events and therefore have no durable message id), and the documented engine floor moves to rc.3; no runtime behaviour change.
- **0.7.2**: documentation only — restores the shorter **Liquid glass** bullet label in the appearance section (the redundant “(bright and translucent)” suffix is gone) so both readmes agree; no runtime change.
- **0.7.1**: documentation only — an English readme (`README.en.md`), a localized About document per locale (`docs/DETAIL.md`, `docs/DETAIL.zh.md`) with a text-free preview illustration, so the plugin detail page no longer falls back to the Chinese readme in an English UI; the stale `step: 0` sample is corrected as well.
- **0.7.0**: fixes a fatal bug — the sieve marker used to be written with `turn/step = 0` while the DSH format-v4 writer requires both to be positive, so since 0.2.0 every sieve failed at the very first step (`append_failed`) and nothing was ever removed; markers now use `turn >= 1` and `step = index + 1`. Also adds in-place sieving of in-turn notice cards (Stopped / This turn failed / Model request retried / Context compaction …) with **Restore notices**, reports write failures with the plugin's own message instead of leaking validator internals, and removes the repeated hidden-state request that every assistant row used to trigger.
- **0.6.0**: every chat row can be sieved (a floating entry on the left of your own messages); new **Prompt / Reply** scopes; stopped and failed turns became removable; the black bar on the left of the selection shadow is gone; the liquid glass turned bright and translucent.
- **0.5.1**: ✓ now confirms the removal and ✕ cancels; removed content disappears from the transcript (undoable).
- **0.5.0**: in-place selection plus the liquid-glass panel and its motion switch.
- **0.4.0**: the **Sieve** entry beside the conversation, search and the **About to remove** preview.

## Development

```bash
git clone https://github.com/GuYou9799/dsh-turn-sieve.git
cd dsh-turn-sieve
npm test
```

Project layout:

```text
lib/index.js        Host plugin: HTTP routes (groups/prune/undo/lookup/hidden), grouping, surface replacement,
                    hidden-range derivation, undo, agent tool
lib/client.js       Web client: session header entry, in-place Sieve on assistant replies, your own messages and
                    notice cards, ✓ confirmation, chat-node hiding, host-native panel with an effects switch, search and preview
locale/*.json       Plugin metadata (title, description, detail document per locale)
docs/               About-page detail documents and the preview illustration
cordis.patch.yml    Bundle insertion patch
test/*.mjs          Grouping, removal, undo, lookup, hidden state, docs and client-load tests
```

Install locally:

```bash
# Run inside DSH, or use "Install local bundle" in the GUI
dsh plugin add /absolute/path/to/dsh-turn-sieve
```

## License

MIT © 2026 Gu You
