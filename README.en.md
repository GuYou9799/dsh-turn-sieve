# dsh-turn-sieve · Turn Sieve

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
2. Click **Turn Sieve** at the top right. The panel uses the liquid-glass look by default; the **Liquid glass** and **Motion** switches in its header can turn it off at any time and the preference is stored locally.
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

## Appearance and motion

- **Liquid glass (bright and translucent)**: the main panel uses a liquid-glass surface by default — a white translucent gradient, `blur(46px) saturate(200%) brightness(1.14)` background blur, edge highlights, a diagonal sheen across the top and two slowly drifting soft lights behind it. Inside the panel the plugin forces light-theme text and border variables, so the panel stays bright and translucent even when DSH runs a dark theme. The **Liquid glass** switch in the header returns to the plain theme background.
- **Motion**: the **Motion** switch drives the drifting lights and the sheen; turning it off keeps the glass but freezes it completely. The switch disables itself when liquid glass is off.
- Both switches are pill buttons with a status dot, stored in the browser `localStorage` (`dts-glass`, `dts-motion`) and still applied after a refresh.
- With `prefers-reduced-motion: reduce` the animations turn off automatically and only the static glass remains.
- The deepened background, rounded corners and shadow of an in-place selection are mixed from the current text colour (`currentColor`), so they stay clearly visible in light and dark themes — with **no** hard vertical bar.

## Limitations

- Only sessions currently active in the Host are supported; open an archived or unloaded session first.
- **Sieve** on an assistant reply appears in that reply's action row (only once the turn has finished); on your own messages it floats in from the left of the bubble on hover.
- "Gone from the transcript" is a client-side visual clear: the raw log is kept, so exporting the session or opening it on another device still shows the full content.
- The hidden set is derived per session and applied per browser tab; another tab needs a refresh to catch up.
- Undo covers only the most recent removal and only lives in memory; earlier removals cannot be undone after a restart (already hidden content stays hidden).
- Token counts come from `tokenMeter` estimates and are shown as approximate — use them to compare relative sizes.
- Requires DSH `>= 0.2.2-rc.2` (Node.js `>= 24.9.0`).

## Changelog

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
                    notice cards, ✓ confirmation, chat-node hiding, liquid-glass panel, search and preview
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
