/* global window, document, navigator */

/**
 * dsh-turn-sieve — browser half.
 *
 * The header utility opens a picker for whole exchanges or single messages.
 * The Host endpoint performs the append-only surface replacement; this file
 * only renders the picker and calls the same-origin local routes that the agent
 * tool uses. Message mode keeps an assistant tool-call message atomic with its
 * tool results, and both modes can undo the most recent prune.
 */

window.__ModuleLoader__.load({
  id: 'dsh-turn-sieve',
  factory(require) {
    const React = require('react');
    let ReactDOM = null;
    try {
      ReactDOM = require('react-dom');
    } catch {
      ReactDOM = null;
    }
    const h = React.createElement;
    const zh = String(navigator.language || '').toLowerCase().startsWith('zh');

    const GROUPS_PATH = '/api/dsh-turn-sieve/groups';
    const PRUNE_PATH = '/api/dsh-turn-sieve/prune';
    const UNDO_PATH = '/api/dsh-turn-sieve/undo';
    const LOOKUP_PATH = '/api/dsh-turn-sieve/lookup';
    const HIDDEN_PATH = '/api/dsh-turn-sieve/hidden';

    const L = zh ? {
      button: '回合筛',
      buttonTitle: '回合筛：选择性清理这段会话中不再需要的对话',
      title: '回合筛 · 选择性清理对话',
      subtitle: '按整段问答或按单条消息，把不再需要的内容从后续上下文中筛掉。系统提示与会话初始上下文会自动保留；原始会话日志不会被删除。',
      tabsGroup: '按整段',
      tabsMessage: '按单条消息',
      hintGroup: '整段 = 一次提问及其后续全部回复和工具调用。系统提示和最近一轮自动保留。',
      hintMessage: '单条 = 逐条消息选择。含工具调用的助手消息会连同它的工具结果一起删除；最近一轮也可以删除。',
      loading: '正在读取会话结构…',
      loadFailed: '读取失败',
      retry: '重试',
      refresh: '刷新',
      close: '关闭',
      empty: '这个会话还没有可筛选的内容。',
      allProtected: '没有可移除的内容：系统提示与会话初始上下文会自动保留。',
      total: '当前上下文',
      tokens: 'tokens',
      exchanges: '段对话',
      messages: '条消息',
      selected: '已选',
      estimated: '预计释放',
      searchPlaceholder: '搜索对话内容…',
      selectedPreview: '将要删除的内容（对应会话中的这些消息）',
      noMatches: '没有匹配的内容，换个关键词试试。',
      selectedMore: '另有 {n} 项已选',
      selectAll: '全选可移除',
      clearAll: '取消全选',
      busy: '助手正在回复。请等当前回合结束后再筛除内容。',
      busyShort: '回复中',
      latest: '保留 · 最近一轮',
      system: '保留 · 系统提示',
      you: '你',
      assistant: '助手',
      tool: '工具结果',
      systemLabel: '系统',
      developer: '开发者',
      systemContext: '系统提示词与会话初始上下文',
      context: '上下文',
      internal: '运行时注入',
      items: '条',
      turn: '第',
      turnUnit: '轮',
      tools: '次工具',
      toolChanges: '含工具变更',
      noteGroup: '原始日志仍保留；被移除的整段对话只是不再进入后续上下文。',
      noteMessage: '原始日志仍保留；被移除的消息只是不再进入后续上下文。',
      undo: '撤销上一次删除',
      undoConfirm: '确认撤销',
      undoing: '正在撤销…',
      undoDone: '已恢复',
      undoDoneTail: '条消息，恢复内容已追加到会话末尾。',
      undoFailed: '撤销失败',
      noUndo: '这个会话没有可撤销的删除记录。',
      protected: '这个项目受保护，不能移除。',
      cancel: '取消',
      applyGroup: '移除所选对话',
      applyMessage: '移除所选消息',
      confirm: '确认移除',
      applying: '正在移除…',
      stale: '会话结构已变化，请刷新后再选。',
      sessionMissing: '没有拿到当前会话 ID，请刷新页面后重试。',
      confirmHint: '再点一次确认。移除后这些内容不会再进入后续上下文。',
      applyFailed: '移除失败',
      quickButton: '筛除',
      quickTitle: '选中这一段对话（直接在对话里确认，不弹窗）',
      quickDone: '已移除，这段内容也已从对话中消失。可在「回合筛」里撤销。',
      quickNoTarget: '没有找到这条消息对应的可删除内容，请刷新页面或改用「回合筛」。',
      quickBusy: '助手正在回复，等当前回合结束后再操作。',
      quickProtected: '这条内容受保护，不能移除。',
      quickCancelSelection: '取消选择（✕）',
      quickLoading: '读取中…',
      quickConfirmGroupTitle: '确认删除整段问答（✓）',
      quickConfirmMessageTitle: '确认删除这条回复（✓）',
      quickRemoving: '删除中…',
      scopeGroup: '整段',
      scopeMessage: '仅本条',
      scopeGroupTitle: '选中整段问答：提问 + 这次回复及其工具调用',
      scopeMessageTitle: '只选中这一条消息，保留提问',
      scopePrompt: '提问',
      scopePromptTitle: '只删除我在这段里的发言，保留智能体的回复',
      scopeReply: '回复',
      scopeReplyTitle: '只删除智能体在这段里的回复与工具调用，保留我的提问',
      quickConfirmPromptTitle: '确认删除这段提问（✓）',
      quickConfirmReplyTitle: '确认删除这段回复（✓）',
      quickUserTitle: '筛除我这条发言',
      effects: '特效',
      effectsTitle: '开启遮罩模糊、面板毛玻璃与一次性入场动画（默认关闭，保证滚动和刷新流畅）',
      effectsOn: '特效已开启',
      effectsOff: '特效已关闭，界面只用宿主原生表面',
      noticeButtonTitle: '筛除这条提示',
      noticeConfirmTitle: '确认隐藏这条提示（✓）',
      noticeHidden: '提示已隐藏，可在「回合筛」面板底部恢复。',
      restoreNotices: '恢复提示',
      restoreNoticesTitle: '恢复本会话中被隐藏的全部提示卡片',
      noticesRestored: '已恢复被隐藏的提示。',
      appendFailed: '写入筛除标记失败，本次没有删除任何内容（原始记录未改动），请稍后重试。',
      noticeKinds: {
        'turn-error': '本轮运行失败',
        'turn-tail': '回合结束提示',
        'turn-max-tokens': '已达长度上限',
        'model-retry': '已重试模型请求',
        'compaction': '上下文压缩',
        'manual-compaction': '手动压缩',
        'command': '命令',
        'command-input': '命令输入',
        'question-reply': '问题回复',
        'workflow-run': '工作流',
        'unknown': '其他事件',
      },
    } : {
      button: 'Turn Sieve',
      buttonTitle: 'Turn Sieve: selectively drop conversation content that no longer matters',
      title: 'Turn Sieve · selectively prune this conversation',
      subtitle: 'Drop whole exchanges or single messages from future context. The system context is always kept and the append-only session log is never deleted.',
      tabsGroup: 'Whole exchanges',
      tabsMessage: 'Single messages',
      hintGroup: 'An exchange = one prompt plus all of its replies and tool calls. The system context and the latest exchange are kept automatically.',
      hintMessage: 'Pick individual messages. An assistant message with tool calls is removed together with its tool results; the latest exchange is not protected here.',
      loading: 'Reading the conversation surface…',
      loadFailed: 'Could not load',
      retry: 'Retry',
      refresh: 'Refresh',
      close: 'Close',
      empty: 'This conversation has nothing to prune yet.',
      allProtected: 'Nothing can be removed: the system context is always kept.',
      total: 'Current context',
      tokens: 'tokens',
      exchanges: 'exchanges',
      messages: 'messages',
      selected: 'selected',
      estimated: 'freed',
      searchPlaceholder: 'Search this conversation…',
      selectedPreview: 'About to remove (these are the messages in the conversation)',
      noMatches: 'No matching content. Try another keyword.',
      selectedMore: '{n} more selected',
      selectAll: 'Select all removable',
      clearAll: 'Clear selection',
      busy: 'The agent is still replying. Wait for this turn to finish before pruning.',
      busyShort: 'running',
      latest: 'kept · latest',
      system: 'kept · system',
      you: 'You',
      assistant: 'Assistant',
      tool: 'Tool result',
      systemLabel: 'System',
      developer: 'Developer',
      systemContext: 'System prompt & initial context',
      context: 'Context',
      internal: 'runtime injection',
      items: 'items',
      turn: 'turn',
      turnUnit: '',
      tools: 'tool calls',
      toolChanges: 'tool changes',
      noteGroup: 'The raw log is kept; removed exchanges simply stop entering future context.',
      noteMessage: 'The raw log is kept; removed messages simply stop entering future context.',
      undo: 'Undo last deletion',
      undoConfirm: 'Confirm undo',
      undoing: 'Undoing…',
      undoDone: 'Restored',
      undoDoneTail: 'message(s); the restored content was appended to the end of the history.',
      undoFailed: 'Undo failed',
      noUndo: 'There is no recent deletion to undo in this session.',
      protected: 'This item is protected and cannot be removed.',
      cancel: 'Cancel',
      applyGroup: 'Prune selected',
      applyMessage: 'Prune selected messages',
      confirm: 'Confirm removal',
      applying: 'Removing…',
      stale: 'The conversation changed. Refresh and choose again.',
      sessionMissing: 'No current session id. Refresh the page and try again.',
      confirmHint: 'Click once more to confirm. These items will stop entering future context.',
      applyFailed: 'Prune failed',
      quickButton: 'Sieve',
      quickTitle: 'Select this part (confirm in place, no dialog)',
      quickConfirmGroupTitle: 'Confirm: remove the whole exchange (✓)',
      quickConfirmMessageTitle: 'Confirm: remove this reply (✓)',
      quickRemoving: 'Removing…',
      scopeGroup: 'Exchange',
      scopeMessage: 'Only reply',
      scopeGroupTitle: 'Select the whole exchange: the prompt plus this reply and its tool calls',
      scopeMessageTitle: 'Select only this message and keep the prompt',
      scopePrompt: 'Prompt',
      scopePromptTitle: 'Remove only my words in this exchange and keep the reply',
      scopeReply: 'Reply',
      scopeReplyTitle: 'Remove only the agent reply and its tool calls, keep my prompt',
      quickConfirmPromptTitle: 'Confirm: remove this prompt (✓)',
      quickConfirmReplyTitle: 'Confirm: remove this reply (✓)',
      quickUserTitle: 'Sieve this message of mine',
      quickDone: 'Removed, and it is gone from the transcript. Undo it from Turn Sieve.',
      quickNoTarget: 'No removable unit was found for this message. Refresh the page or use Turn Sieve.',
      quickBusy: 'The agent is still replying. Wait for this turn to finish.',
      quickProtected: 'This content is protected and cannot be removed.',
      quickCancelSelection: 'Cancel the selection (✕)',
      quickLoading: 'Loading…',
      effects: 'Effects',
      effectsTitle: 'Turn on mask blur, a frosted panel and one-shot entrance animations (off by default so scrolling stays smooth)',
      effectsOn: 'Effects on',
      effectsOff: 'Effects off: host-native surfaces only',
      noticeButtonTitle: 'Sieve this notice',
      noticeConfirmTitle: 'Confirm: hide this notice (✓)',
      noticeHidden: 'Notice hidden. Restore it from the Turn Sieve footer.',
      restoreNotices: 'Restore notices',
      restoreNoticesTitle: 'Bring back every notice card hidden in this session',
      noticesRestored: 'Hidden notices are back.',
      appendFailed: 'The session refused the sieve marker, so nothing was removed. The log is unchanged; try again.',
      noticeKinds: {
        'turn-error': 'Turn failed',
        'turn-tail': 'Turn summary',
        'turn-max-tokens': 'Max tokens reached',
        'model-retry': 'Model request retried',
        'compaction': 'Context compaction',
        'manual-compaction': 'Manual compaction',
        'command': 'Command',
        'command-input': 'Command input',
        'question-reply': 'Question reply',
        'workflow-run': 'Workflow run',
        'unknown': 'Other event',
      },
    };

    const CSS = `
.dts-button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1;white-space:nowrap;transition:background .12s ease,color .12s ease}
.dts-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-overlay{position:fixed;inset:0;z-index:2147483000;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.44));display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.dts-dialog{width:780px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));border-radius:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 28px 80px rgba(0,0,0,.42);overflow:hidden}
.dts-tabs{display:flex;gap:4px;padding:0 20px 8px}
.dts-tab{height:28px;padding:0 11px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dts-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-tab-active{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.dts-hint{padding:0 20px 8px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dts-list-wrap{display:flex;flex-direction:column;flex:1;min-height:0}
.dts-search{height:27px;width:210px;max-width:42vw;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;outline:none}
.dts-search:focus{border-color:var(--dsw-alias-brand-primary)}
.dts-preview{padding:9px 20px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);max-height:160px;overflow:auto}
.dts-preview-title{padding-bottom:5px;font-size:10.5px;font-weight:650;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.dts-preview-row{display:flex;gap:8px;margin-top:5px;font-size:11.5px;line-height:1.45}
.dts-preview-role{flex:none;min-width:30px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dts-preview-text{min-width:0;white-space:pre-wrap;word-break:break-word;max-height:50px;overflow:hidden}
.dts-preview-more{margin-top:5px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dts-scroll{overflow:auto;padding:4px 8px 8px;display:flex;flex-direction:column;gap:2px;flex:1;min-height:120px}
.dts-row{display:flex;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid transparent;cursor:pointer;align-items:flex-start}
.dts-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dts-row-protected{cursor:default;opacity:.62}
.dts-row-protected:hover{background:transparent}
.dts-check{margin:3px 0 0;width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);flex:none}
.dts-badge{display:inline-flex;align-items:center;height:19px;padding:0 6px;margin-right:7px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;flex:none}
.dts-lock{display:inline-flex;align-items:center;height:18px;padding:0 6px;margin-left:7px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary);font-size:10px;font-weight:600;flex:none}
.dts-primary{height:32px;padding:0 14px;border:1px solid transparent;border-radius:9px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.dts-primary:disabled{opacity:.42;cursor:not-allowed}
.dts-ghost{height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dts-ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-ghost:disabled{opacity:.42;cursor:not-allowed}
.dts-ghost:hover:disabled{background:transparent;color:var(--dsw-alias-label-secondary)}
.dts-scroll::-webkit-scrollbar{width:10px}
.dts-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:10px;border:3px solid var(--dsw-alias-bg-overlay)}
.dts-quick-action{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 7px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;cursor:pointer;white-space:nowrap}
.dts-quick-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-toast{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483001;max-width:min(560px,92vw);padding:10px 14px;border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 10px 36px rgba(0,0,0,.28);font-size:12px;line-height:1.5}
.dts-hidden-node{display:none !important}
[data-chat-node-key].dts-selected-node,[data-chat-turn].dts-selected-node,[data-chat-group-key].dts-selected-node{background:color-mix(in srgb,var(--dsw-alias-label-primary,#111) 11%,transparent);box-shadow:0 16px 38px color-mix(in srgb,var(--dsw-alias-label-primary,#111) 16%,transparent),inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary,#111) 12%,transparent);transition:background .18s ease,box-shadow .18s ease}
.dts-selected-node .dts-selected-node{background:transparent;box-shadow:none}
.dts-sel-first{border-top-left-radius:18px;border-top-right-radius:18px}
.dts-sel-last{border-bottom-left-radius:18px;border-bottom-right-radius:18px}
.dts-sel-first.dts-sel-last{border-radius:18px}
.dts-force-reveal{opacity:1 !important}
.dts-armed{display:inline-flex;align-items:center;gap:5px;flex:none;animation:dts-pop .16s ease-out}
.dts-inline{display:inline-flex;align-items:center;gap:5px;flex:none}
.dts-scope-switch{display:inline-flex;align-items:center;height:22px;padding:1px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 72%,transparent);flex:none}
.dts-scope-pill{height:18px;padding:0 7px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;line-height:1;cursor:pointer;white-space:nowrap}
.dts-scope-pill:hover{color:var(--dsw-alias-label-primary)}
.dts-scope-pill.dts-scope-on{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}
.dts-scope-pill:disabled{opacity:.4;cursor:not-allowed}
.dts-cancel{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);font:400 12px/1 inherit;cursor:pointer;flex:none}
.dts-cancel:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-cancel:disabled{opacity:.4;cursor:not-allowed}
.dts-confirm{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:var(--dsw-alias-state-error-primary);color:#fff;font:700 13px/1 inherit;cursor:pointer;flex:none;box-shadow:0 3px 12px color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent)}
.dts-confirm:hover{filter:brightness(1.1)}
.dts-confirm:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.dts-quick-action.is-loading{opacity:.55;cursor:wait}
.dts-view-toggles{display:flex;align-items:center;gap:6px;flex:none;margin-top:1px}
.dts-toggle{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.dts-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-toggle[aria-pressed="true"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}
.dts-toggle:disabled{opacity:.4;cursor:not-allowed}
.dts-toggle-dot{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.45;flex:none}
.dts-toggle[aria-pressed="true"] .dts-toggle-dot{opacity:1;background:var(--dsw-alias-brand-primary)}
.dts-footer{display:flex;align-items:center;gap:10px;padding:12px 20px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
/* ── Appearance ──────────────────────────────────────────────────────────────
   Effects OFF (the default) is the plain host surface above: DSW tokens only,
   no backdrop-filter and no looping animation, so nothing is re-composited per
   frame. Effects ON adds exactly two large-surface backdrop filters (the scrim
   and the panel) plus one-shot transform/opacity entrances. Small cards never
   get a blur — they use translucent overlays so scrolling stays smooth. The
   single root attribute below is the kill switch for everything we render. */
[data-dts-effects="on"] .dts-overlay{-webkit-backdrop-filter:var(--dsw-mask-blur,blur(8px)) saturate(140%);backdrop-filter:var(--dsw-mask-blur,blur(8px)) saturate(140%);animation:dts-fadein .24s ease}
[data-dts-effects="on"] .dts-dialog{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 95%,transparent);-webkit-backdrop-filter:blur(14px) saturate(150%);backdrop-filter:blur(14px) saturate(150%);animation:dts-popin .34s cubic-bezier(.16,1,.3,1)}
[data-dts-effects="on"] .dts-row,[data-dts-effects="on"] .dts-preview-row{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 62%,transparent)}
[data-dts-effects="on"] .dts-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,transparent)}
[data-dts-effects="on"] .dts-tab-active,[data-dts-effects="on"] .dts-search,[data-dts-effects="on"] .dts-badge{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent)}
[data-dts-effects="on"] .dts-user-sieve.dts-armed-host,[data-dts-effects="on"] .dts-notice-sieve .dts-quick-action{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent)}
[data-dts-effects="off"] .dts-overlay,[data-dts-effects="off"] .dts-overlay *,[data-dts-effects="off"] .dts-overlay *::before,[data-dts-effects="off"] .dts-overlay *::after,[data-dts-effects="off"] .dts-user-sieve,[data-dts-effects="off"] .dts-user-sieve *,[data-dts-effects="off"] .dts-user-sieve *::before,[data-dts-effects="off"] .dts-user-sieve *::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;filter:none!important;animation:none!important;transition:none!important;will-change:auto!important}
.dts-user-sieve{position:absolute;left:0;top:50%;transform:translateY(-50%);display:flex;align-items:center;z-index:2;opacity:0;pointer-events:none;transition:opacity .15s ease}
[data-chat-node-key]:hover>.dts-user-sieve,.dts-user-sieve.dts-armed-host{opacity:1;pointer-events:auto}
.dts-user-sieve.dts-armed-host{padding:2px 4px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 94%,transparent);box-shadow:0 6px 18px -10px rgba(0,0,0,.6)}
.dts-notice-sieve{left:auto;right:6px;top:6px;transform:none}
.dts-notice-sieve .dts-quick-action{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent)}
@keyframes dts-pop{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes dts-fadein{from{opacity:0}to{opacity:1}}
@keyframes dts-popin{from{opacity:0;transform:translateY(16px) scale(.965)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dts-overlay,.dts-overlay *,.dts-overlay *::before,.dts-overlay *::after,.dts-user-sieve,.dts-user-sieve *,.dts-armed{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

`;

    const EFFECTS_KEY = 'dts-effects';

    function readEffectsPref() {
      try { return window.localStorage.getItem(EFFECTS_KEY) === '1'; } catch { return false; }
    }

    function applyEffectsPref(on) {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      if (root) root.setAttribute('data-dts-effects', on ? 'on' : 'off');
    }

    function forgetLegacyPrefs() {
      try {
        window.localStorage.removeItem('dts-glass');
        window.localStorage.removeItem('dts-motion');
      } catch {}
    }

    function ensureStyle() {
      applyEffectsPref(readEffectsPref());
      forgetLegacyPrefs();
      if (typeof document === 'undefined') return;
      if (document.getElementById('dsh-turn-sieve-style')) return;
      const style = document.createElement('style');
      style.id = 'dsh-turn-sieve-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    function portal(node) {
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body);
      }
      return node;
    }

    function fmtTokens(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return '0';
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 10_000) return `${Math.round(n / 1000)}k`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
      return String(Math.round(n));
    }

    async function readJson(response) {
      const text = await response.text();
      let data;
      try {
        data = text === '' ? {} : JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!data.ok) {
        const error = new Error(data.message || `HTTP ${response.status}`);
        error.code = data.code;
        throw error;
      }
      return data;
    }

    function errorText(cause, fallback) {
      if (cause && cause.code === 'busy') return L.busy;
      if (cause && cause.code === 'stale') return L.stale;
      if (cause && cause.code === 'protected') return L.protected;
      if (cause && cause.code === 'no_undo') return L.noUndo;
      if (cause && cause.code === 'append_failed') return L.appendFailed;
      return cause && cause.message ? cause.message : fallback;
    }

    function FunnelIcon() {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        style: { flex: 'none' },
      }, h('path', {
        d: 'M2.2 3.1h11.6L9.4 8.7v4.2l-2.8 1.4V8.7L2.2 3.1Z',
        stroke: 'currentColor',
        strokeWidth: 1.35,
        strokeLinejoin: 'round',
      }));
    }

    function UnitRow({ item, mode, checked, index, onToggle }) {
      const disabled = item.deletable !== true;
      const isSystem = item.protectedReason === 'system-prompt';
      const role = mode === 'group'
        ? (isSystem ? L.systemLabel : L.you)
        : (item.kind === 'user'
          ? L.you
          : item.kind === 'assistant'
            ? L.assistant
            : item.kind === 'tool'
              ? L.tool
              : item.kind === 'system'
                ? L.systemLabel
                : L.developer);

      const primary = mode === 'group'
        ? (item.title || item.userPreview || item.assistantPreview || L.context)
        : (item.preview || item.title || L.context);
      const secondary = mode === 'group' && item.assistantPreview && item.assistantPreview !== primary
        ? item.assistantPreview
        : '';

      const meta = [`#${index + 1}`];
      if (typeof item.turn === 'number') meta.push(`${L.turn} ${item.turn + 1}${L.turnUnit}`);
      if (mode === 'group' && item.parts) {
        const count = item.parts.user + item.parts.assistant + item.parts.tool + item.parts.system + item.parts.developer;
        meta.push(`${count} ${L.items}`);
      }
      meta.push(`~${fmtTokens(item.tokens)} ${L.tokens}`);
      if (item.toolCalls > 0) meta.push(`${item.toolCalls} ${L.tools}`);
      if (item.hasToolChange) meta.push(L.toolChanges);
      if (item.internal) meta.push(L.internal);

      return h('label', {
        className: `dts-row${disabled ? ' dts-row-protected' : ''}`,
        title: disabled ? (isSystem ? L.system : L.latest) : undefined,
      },
      h('input', {
        type: 'checkbox',
        className: 'dts-check',
        checked,
        disabled,
        onChange: () => onToggle(item.id),
      }),
      h('div', { style: { minWidth: 0, flex: 1 } },
        h('div', { style: { display: 'flex', alignItems: 'center', minWidth: 0 } },
          h('span', { className: 'dts-badge' }, role),
          h('span', {
            style: {
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
              fontWeight: 600,
            },
          }, primary),
          disabled ? h('span', { className: 'dts-lock' }, isSystem ? L.system : L.latest) : null,
        ),
        secondary ? h('div', {
          style: {
            marginTop: 3,
            fontSize: 12,
            color: 'var(--dsw-alias-label-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }, `${L.assistant}: ${secondary}`) : null,
        h('div', {
          style: {
            marginTop: 4,
            fontSize: 11,
            color: 'var(--dsw-alias-label-secondary)',
            opacity: 0.85,
          },
        }, meta.join(' · ')),
      ));
    }

    function PruneDialog({ sessionId, onClose }) {
      const [mode, setMode] = React.useState('group');
      const [state, setState] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [selected, setSelected] = React.useState(() => new Set());
      const [confirming, setConfirming] = React.useState(false);
      const [applying, setApplying] = React.useState(false);
      const [undoing, setUndoing] = React.useState(false);
      const [undoConfirm, setUndoConfirm] = React.useState(false);
      const [notice, setNotice] = React.useState('');
      const [nonce, setNonce] = React.useState(0);
      const [query, setQuery] = React.useState('');
      const [effects, setEffects] = React.useState(readEffectsPref);
      const toggleEffects = () => {
        const next = !effects;
        setEffects(next);
        applyEffectsPref(next);
        try { window.localStorage.setItem(EFFECTS_KEY, next ? '1' : '0'); } catch {}
        setNotice(next ? L.effectsOn : L.effectsOff);
      };

      React.useEffect(() => {
        ensureStyle();
        let cancelled = false;
        const controller = new AbortController();
        if (!sessionId) {
          setError(L.sessionMissing);
          setLoading(false);
          return () => controller.abort();
        }
        setLoading(true);
        setError('');
        setNotice('');
        setConfirming(false);
        setUndoConfirm(false);
        fetch(`${GROUPS_PATH}?sessionId=${encodeURIComponent(sessionId)}&mode=${mode}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
          .then(readJson)
          .then((data) => {
            if (cancelled) return;
            setState(data);
            setSelected(new Set());
            if (data.hidden) setHiddenPayload(data.hidden, sessionId);
          })
          .catch((cause) => {
            if (cancelled || cause.name === 'AbortError') return;
            setError(errorText(cause, L.loadFailed));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [sessionId, nonce, mode]);

      React.useEffect(() => {
        const listener = () => setNonce((value) => value + 1);
        changeListeners.add(listener);
        return () => { changeListeners.delete(listener); };
      }, []);

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
          window.removeEventListener('keydown', onKey);
          document.body.style.overflow = previous;
        };
      }, [onClose]);

      const items = state
        ? (mode === 'group' ? state.groups ?? [] : state.messages ?? [])
        : [];
      const selectedItems = items.filter((item) => selected.has(item.id));
      const selectedTokens = selectedItems.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0);
      const removable = items.filter((item) => item.deletable === true);
      const q = query.trim().toLowerCase();
      const filteredItems = q
        ? items.filter((item) => [item.title, item.preview, item.userPreview, item.assistantPreview]
          .some((value) => String(value || '').toLowerCase().includes(q)))
        : items;
      const visibleRemovable = filteredItems.filter((item) => item.deletable === true);
      const allSelected = visibleRemovable.length > 0 && visibleRemovable.every((item) => selected.has(item.id));
      const previewText = (item) => {
        if (mode === 'group') return [item.userPreview, item.assistantPreview].filter(Boolean).join('  ·  ');
        return item.preview || item.title || '';
      };
      const selectedPreview = selectedItems.length > 0 ? h('div', { className: 'dts-preview' },
        h('div', { className: 'dts-preview-title' }, L.selectedPreview + ' · ' + selectedItems.length),
        selectedItems.slice(0, 3).map((item) => h('div', { key: item.id, className: 'dts-preview-row' },
          h('span', { className: 'dts-preview-role' }, mode === 'group' ? L.you : (item.kind === 'assistant' ? L.assistant : item.kind === 'user' ? L.you : item.kind === 'tool' ? L.tool : L.context)),
          h('span', { className: 'dts-preview-text' }, previewText(item) || L.context),
        )),
        selectedItems.length > 3 ? h('div', { className: 'dts-preview-more' }, L.selectedMore.replace('{n}', String(selectedItems.length - 3))) : null,
      ) : null;
      const busy = state?.busy === true;
      const canApply = selected.size > 0 && !busy && !applying && !undoing;
      const canUndo = state?.undo?.available === true && !busy && !applying && !undoing;
      const unitWord = mode === 'group' ? L.exchanges : L.messages;
      const undoWord = state?.undo?.mode === 'message' ? L.messages : L.exchanges;

      const switchMode = (next) => {
        if (next === mode) return;
        setMode(next);
        setState(null);
        setSelected(new Set());
        setConfirming(false);
        setUndoConfirm(false);
        setNotice('');
        setError('');
        setQuery('');
      };

      const toggle = (id) => {
        const item = items.find((candidate) => candidate.id === id);
        if (!item || item.deletable !== true || applying) return;
        setConfirming(false);
        setUndoConfirm(false);
        setNotice('');
        setSelected((previous) => {
          const next = new Set(previous);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };

      const toggleAll = () => {
        setConfirming(false);
        setUndoConfirm(false);
        setNotice('');
        if (allSelected) {
          setSelected(new Set());
          return;
        }
        setSelected(new Set(removable.map((item) => item.id)));
      };

      const apply = async () => {
        if (!canApply) return;
        if (!confirming) {
          setConfirming(true);
          setUndoConfirm(false);
          return;
        }
        setApplying(true);
        setError('');
        setNotice('');
        try {
          const data = await readJson(await fetch(PRUNE_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              sessionId,
              mode,
              ranges: selectedItems.map((item) => ({ startSeq: item.startSeq, endSeq: item.endSeq })),
            }),
          }));
          if (data.state) setState(data.state);
          if (data.hidden) setHiddenPayload(data.hidden, sessionId);
          setSelected(new Set());
          setConfirming(false);
          const count = data.pruned?.length ?? selectedItems.length;
          const freed = data.freedTokens ?? selectedTokens;
          setNotice(zh
            ? `已移除 ${count} ${unitWord}，预计为后续上下文释放约 ${fmtTokens(freed)} tokens。`
            : `Removed ${count} ${unitWord}, freeing about ${fmtTokens(freed)} tokens from future context.`);
        } catch (cause) {
          setError(`${L.applyFailed}: ${errorText(cause, L.applyFailed)}`);
          setConfirming(false);
        } finally {
          setApplying(false);
        }
      };

      const runUndo = async () => {
        if (!canUndo) return;
        if (!undoConfirm) {
          setUndoConfirm(true);
          setConfirming(false);
          return;
        }
        setUndoing(true);
        setError('');
        setNotice('');
        try {
          const data = await readJson(await fetch(UNDO_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId, mode }),
          }));
          if (data.state) setState(data.state);
          if (data.hidden) setHiddenPayload(data.hidden, sessionId);
          setSelected(new Set());
          setUndoConfirm(false);
          setNotice(zh
            ? `${L.undoDone} ${data.restored ?? 0} ${L.undoDoneTail}`
            : `${L.undoDone} ${data.restored ?? 0} ${L.undoDoneTail}`);
        } catch (cause) {
          setError(`${L.undoFailed}: ${errorText(cause, L.undoFailed)}`);
          setUndoConfirm(false);
          if (cause && cause.code === 'no_undo') {
            setState((previous) => (previous ? { ...previous, undo: { available: false } } : previous));
          }
        } finally {
          setUndoing(false);
        }
      };

      const cancel = () => {
        if (confirming) setConfirming(false);
        else if (undoConfirm) setUndoConfirm(false);
        else onClose();
      };

      const header = h('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 12px' },
      },
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: 16, fontWeight: 650, letterSpacing: '.1px' } }, L.title),
        h('div', {
          style: {
            marginTop: 5,
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--dsw-alias-label-secondary)',
          },
        }, L.subtitle),
      ),
      h('div', { className: 'dts-view-toggles' },
        h('button', {
          type: 'button',
          className: 'dts-toggle',
          'aria-pressed': effects,
          title: L.effectsTitle,
          onClick: toggleEffects,
        }, h('span', { className: 'dts-toggle-dot' }), L.effects)),
      h('button', {
        type: 'button',
        className: 'dts-ghost',
        style: { width: 32, height: 32, padding: 0, fontSize: 18, lineHeight: '28px', flex: 'none' },
        onClick: onClose,
        title: L.close,
        'aria-label': L.close,
      }, '×'));

      const tabs = h('div', { className: 'dts-tabs', role: 'tablist' },
        h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': mode === 'group',
          className: `dts-tab${mode === 'group' ? ' dts-tab-active' : ''}`,
          onClick: () => switchMode('group'),
          disabled: applying || undoing,
        }, L.tabsGroup),
        h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': mode === 'message',
          className: `dts-tab${mode === 'message' ? ' dts-tab-active' : ''}`,
          onClick: () => switchMode('message'),
          disabled: applying || undoing,
        }, L.tabsMessage));

      const hint = h('div', { className: 'dts-hint' }, mode === 'group' ? L.hintGroup : L.hintMessage);

      const stats = h('div', {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 14px',
          alignItems: 'center',
          padding: '0 20px 10px',
          fontSize: 12,
          color: 'var(--dsw-alias-label-secondary)',
        },
      },
      h('span', null, `${L.total}: ~${fmtTokens(state?.totalTokens)} ${L.tokens}`),
      h('span', null, `${items.length} ${unitWord}`),
      selected.size > 0 ? h('span', { style: { color: 'var(--dsw-alias-brand-primary)', fontWeight: 600 } }, `${L.selected} ${selected.size} · ${L.estimated} ~${fmtTokens(selectedTokens)} ${L.tokens}`) : null,
      items.length > 0 ? h('input', {
        type: 'search',
        className: 'dts-search',
        value: query,
        placeholder: L.searchPlaceholder,
        'aria-label': L.searchPlaceholder,
        onChange: (event) => setQuery(event.target.value),
      }) : null,
      h('span', { style: { flex: 1 } }),
      q && filteredItems.length !== items.length ? h('span', null, filteredItems.length + '/' + items.length) : null,
      busy ? h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)', fontWeight: 600 } }, L.busyShort) : null,
      h('button', {
        type: 'button',
        className: 'dts-ghost',
        style: { height: 26, padding: '0 9px', fontSize: 11 },
        onClick: () => setNonce((value) => value + 1),
        disabled: loading || applying || undoing,
      }, L.refresh));

      const banners = [];
      if (busy) {
        banners.push(h('div', {
          key: 'busy',
          style: {
            margin: '0 20px 8px',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--dsw-alias-state-warn-primary)',
            background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent)',
          },
        }, L.busy));
      }
      if (notice) {
        banners.push(h('div', {
          key: 'notice',
          style: {
            margin: '0 20px 8px',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--dsw-alias-state-success-primary)',
            background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)',
          },
        }, notice));
      }
      if (error) {
        banners.push(h('div', {
          key: 'error',
          style: {
            margin: '0 20px 8px',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--dsw-alias-state-error-primary)',
            background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)',
          },
        }, error));
      }

      let body;
      if (loading) {
        body = h('div', { style: { padding: '36px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } }, L.loading);
      } else if (items.length === 0) {
        body = h('div', { style: { padding: '36px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } }, L.empty);
      } else {
        body = h('div', { className: 'dts-list-wrap' },
          selectedPreview,
          h('div', { className: 'dts-scroll' },
            filteredItems.map((item) => h(UnitRow, {
              key: item.id,
              item,
              mode,
              index: items.indexOf(item),
              checked: selected.has(item.id),
              onToggle: toggle,
            })),
            filteredItems.length === 0 ? h('div', {
              style: { padding: '24px 12px', textAlign: 'center', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
            }, L.noMatches) : null,
            removable.length === 0 ? h('div', {
              style: { padding: '10px 12px 4px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
            }, L.allProtected) : null,
          ),
        );
      }

      const restoreNoticesButton = hiddenNotices.size > 0 ? h('button', {
        type: 'button',
        className: 'dts-ghost',
        title: L.restoreNoticesTitle,
        onClick: () => {
          restoreAllNotices();
          showToast(L.noticesRestored);
        },
      }, `${L.restoreNotices} (${hiddenNotices.size})`) : null;

      const undoButton = canUndo ? h('button', {
        type: 'button',
        className: 'dts-ghost',
        title: L.undo,
        onClick: runUndo,
        disabled: !canUndo,
        style: undoConfirm ? { borderColor: 'var(--dsw-alias-state-warn-primary)', color: 'var(--dsw-alias-state-warn-primary)' } : undefined,
      }, undoing ? L.undoing : (undoConfirm ? L.undoConfirm : `${L.undo} (${state.undo.ranges} ${undoWord})`)) : null;

      const footer = h('div', { className: 'dts-footer' },
      h('div', {
        style: { flex: 1, fontSize: 10.5, lineHeight: 1.45, color: 'var(--dsw-alias-label-secondary)' },
      }, confirming ? L.confirmHint : (mode === 'group' ? L.noteGroup : L.noteMessage)),
      restoreNoticesButton,
      undoButton,
      h('button', {
        type: 'button',
        className: 'dts-ghost',
        onClick: cancel,
        disabled: applying || undoing,
      }, L.cancel),
      h('button', {
        type: 'button',
        className: 'dts-primary',
        onClick: apply,
        disabled: !canApply,
        style: confirming ? { background: 'var(--dsw-alias-state-error-primary)' } : undefined,
      }, applying ? L.applying : confirming ? `${L.confirm} (${selected.size})` : (mode === 'group' ? L.applyGroup : L.applyMessage)));

      return portal(h('div', {
        className: 'dts-overlay',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose();
        },
      }, h('div', {
        className: 'dts-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': L.title,
      }, header, tabs, hint, stats, banners, body, footer)));
    }

    function showToast(message) {
      if (typeof document === 'undefined') return;
      ensureStyle();
      const node = document.createElement('div');
      node.className = 'dts-toast';
      node.textContent = message;
      document.body.appendChild(node);
      window.setTimeout(() => node.remove(), 4200);
    }

    const SELECTED_NODE_CLASS = 'dts-selected-node';
    const FIRST_NODE_CLASS = 'dts-sel-first';
    const LAST_NODE_CLASS = 'dts-sel-last';
    const FORCE_REVEAL_CLASS = 'dts-force-reveal';
    const HIDDEN_NODE_CLASS = 'dts-hidden-node';
    let activeSelection = null;
    const selectionListeners = new Set();
    const changeListeners = new Set();
    const hiddenKeys = new Set();
    const hiddenTurns = new Set();
    let hiddenSessionId = null;
    let hiddenObserver = null;
    let hiddenTimer = null;
    let hiddenInFlight = null;
    let hiddenLoadedFor = null;

    // ---- notice cards: 已停止 / 处理失败 / 已重试模型请求 / 压缩 … --------------
    // Notices are not surface events (SURFACE_EVENT_TYPES only carries the five
    // message types), so they never cost model context and the host has nothing
    // to prune: hiding them is a view-side decision, remembered per session.
    const NOTICE_KINDS = [
      'turn-error', 'turn-tail', 'turn-max-tokens', 'model-retry', 'compaction',
      'manual-compaction', 'command', 'command-input', 'question-reply',
      'workflow-run', 'unknown',
    ];
    const NOTICE_KIND_SET = new Set(NOTICE_KINDS);
    const NOTICE_STORE_PREFIX = 'dts-notices:';
    const hiddenNotices = new Set();
    const hiddenNoticeTurns = new Set();
    const noticeControls = new Map();
    let noticeStoreSession = null;

    function noticeLabel(kind) {
      return L.noticeKinds?.[kind] ?? String(kind ?? '');
    }

    function loadNoticeStore(sessionId) {
      const id = String(sessionId ?? '');
      if (!id || noticeStoreSession === id) return;
      noticeStoreSession = id;
      hiddenNotices.clear();
      try {
        const raw = window.localStorage?.getItem(NOTICE_STORE_PREFIX + id);
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) list.forEach((key) => hiddenNotices.add(String(key)));
      } catch { /* an unreadable store simply means nothing is hidden */ }
    }

    function saveNoticeStore() {
      if (!noticeStoreSession || typeof window === 'undefined') return;
      try {
        window.localStorage?.setItem(NOTICE_STORE_PREFIX + noticeStoreSession, JSON.stringify(Array.from(hiddenNotices)));
      } catch { /* private mode: the hide still applies for this page */ }
    }

    function hideNoticeKey(key) {
      hiddenNotices.add(String(key));
      saveNoticeStore();
      applyHidden();
      notifyChanged();
    }

    function restoreAllNotices() {
      const count = hiddenNotices.size;
      hiddenNotices.clear();
      saveNoticeStore();
      applyHidden();
      notifyChanged();
      return count;
    }

    function isNoticeNode(el) {
      const kind = el?.getAttribute?.('data-chat-flow-kind');
      return Boolean(kind && NOTICE_KIND_SET.has(kind) && el.getAttribute('data-chat-node-key'));
    }

    function renderNoticeControl(entry) {
      const root = entry.root;
      root.classList.toggle('dts-armed-host', entry.armed);
      const signature = entry.armed ? 'armed' : 'idle';
      if (entry.signature === signature && root.childElementCount > 0) return;
      entry.signature = signature;
      root.textContent = '';
      if (!entry.armed) {
        root.appendChild(makeButton('dts-quick-action', L.quickButton, `${L.noticeButtonTitle} · ${noticeLabel(entry.kind)}`, () => {
          entry.armed = true;
          renderNoticeControl(entry);
        }));
        return;
      }
      const cluster = document.createElement('span');
      cluster.className = 'dts-armed';
      cluster.appendChild(makeButton('dts-cancel', '✕', L.quickCancelSelection, () => {
        entry.armed = false;
        renderNoticeControl(entry);
      }));
      cluster.appendChild(makeButton('dts-confirm', '✓', L.noticeConfirmTitle, () => {
        entry.armed = false;
        hideNoticeKey(entry.key);
        showToast(L.noticeHidden);
      }));
      root.appendChild(cluster);
    }

    function ensureNoticeControls() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const seen = new Set();
      document.querySelectorAll('[data-chat-flow-kind]').forEach((node) => {
        if (!isNoticeNode(node)) return;
        const key = node.getAttribute('data-chat-node-key');
        if (seen.has(key)) return;
        seen.add(key);
        if (node.classList.contains(HIDDEN_NODE_CLASS) || node.closest('.' + HIDDEN_NODE_CLASS)) return;
        let entry = noticeControls.get(key);
        if (!entry || entry.host !== node || !entry.root.isConnected) {
          entry?.root.remove();
          const root = document.createElement('div');
          root.className = 'dts-user-sieve dts-notice-sieve';
          root.setAttribute('data-dts-notice', key);
          if (window.getComputedStyle?.(node)?.position === 'static') node.style.position = 'relative';
          node.appendChild(root);
          entry = {
            host: node,
            root,
            key,
            kind: node.getAttribute('data-chat-flow-kind'),
            armed: false,
            signature: '',
          };
          noticeControls.set(key, entry);
        }
        renderNoticeControl(entry);
      });
      noticeControls.forEach((entry, key) => {
        if (!entry.host.isConnected) {
          entry.root.remove();
          noticeControls.delete(key);
        }
      });
    }

    function cssEscape(value) {
      const text = String(value ?? '');
      const escaper = typeof window === 'undefined' ? null : window.CSS?.escape;
      return typeof escaper === 'function' ? escaper(text) : text.replace(/["\\]/g, '\\$&');
    }

    function notifyChanged() {
      changeListeners.forEach((listener) => {
        try { listener(); } catch { /* one failing listener must not block the rest */ }
      });
    }

    function setHiddenPayload(payload, sessionId) {
      hiddenKeys.clear();
      hiddenTurns.clear();
      hiddenNoticeTurns.clear();
      (payload?.keys ?? []).forEach((key) => hiddenKeys.add(String(key)));
      (payload?.turns ?? []).forEach((turn) => hiddenTurns.add(String(turn)));
      (payload?.noticeTurns ?? []).forEach((turn) => hiddenNoticeTurns.add(String(turn)));
      if (sessionId) {
        hiddenSessionId = String(sessionId);
        hiddenLoadedFor = hiddenSessionId;
      }
      loadNoticeStore(hiddenSessionId);
      applyHidden();
    }

    function refreshHidden(sessionId, force) {
      const id = sessionId ?? hiddenSessionId;
      if (!id || typeof document === 'undefined') return;
      const key = String(id);
      // Every assistant row mounts this hook: only fetch once per session.
      if (!force && hiddenLoadedFor === key) {
        loadNoticeStore(key);
        applyHidden();
        return;
      }
      if (hiddenInFlight === key) return;
      hiddenInFlight = key;
      hiddenSessionId = key;
      fetch(`${HIDDEN_PATH}?sessionId=${encodeURIComponent(key)}`, { headers: { accept: 'application/json' } })
        .then(readJson)
        .then((payload) => setHiddenPayload(payload, key))
        .catch(() => { /* keep the current visibility when the host is unreachable */ })
        .finally(() => { hiddenInFlight = null; });
    }

    function matchesHidden(el) {
      if (!el?.getAttribute) return false;
      const key = el.getAttribute('data-chat-node-key');
      if (key && (hiddenKeys.has(key) || hiddenNotices.has(key))) return true;
      const turn = el.getAttribute('data-chat-turn');
      if (turn && hiddenTurns.has(turn)) return true;
      const kind = el.getAttribute('data-chat-flow-kind');
      return Boolean(turn && kind && NOTICE_KIND_SET.has(kind) && hiddenNoticeTurns.has(turn));
    }

    function applyHidden() {
      if (typeof document === 'undefined') return;
      const nothing = hiddenKeys.size === 0 && hiddenTurns.size === 0
        && hiddenNoticeTurns.size === 0 && hiddenNotices.size === 0;
      if (nothing) {
        document.querySelectorAll('.' + HIDDEN_NODE_CLASS).forEach((el) => el.classList.remove(HIDDEN_NODE_CLASS));
        return;
      }
      hiddenKeys.forEach((key) => {
        document.querySelectorAll(`[data-chat-node-key="${cssEscape(key)}"]`).forEach((el) => el.classList.add(HIDDEN_NODE_CLASS));
      });
      hiddenNotices.forEach((key) => {
        document.querySelectorAll(`[data-chat-node-key="${cssEscape(key)}"]`).forEach((el) => el.classList.add(HIDDEN_NODE_CLASS));
      });
      hiddenTurns.forEach((turn) => {
        document.querySelectorAll(`[data-chat-turn="${cssEscape(turn)}"]`).forEach((el) => el.classList.add(HIDDEN_NODE_CLASS));
      });
      // A pruned turn also takes its notice cards with it, even when the unit
      // only covered part of that turn.
      hiddenNoticeTurns.forEach((turn) => {
        NOTICE_KINDS.forEach((kind) => {
          document.querySelectorAll(`[data-chat-turn="${cssEscape(turn)}"][data-chat-flow-kind="${cssEscape(kind)}"]`)
            .forEach((el) => el.classList.add(HIDDEN_NODE_CLASS));
        });
      });
      document.querySelectorAll('[data-chat-group-key]').forEach((wrapper) => {
        const kids = wrapper.querySelectorAll('[data-chat-node-key]');
        if (kids.length === 0) {
          wrapper.classList.toggle(HIDDEN_NODE_CLASS, matchesHidden(wrapper));
          return;
        }
        let visible = 0;
        kids.forEach((kid) => { if (!kid.classList.contains(HIDDEN_NODE_CLASS)) visible += 1; });
        wrapper.classList.toggle(HIDDEN_NODE_CLASS, visible === 0);
      });
      paintSelection(activeSelection);
      ensureNoticeControls();
    }

    function observeHidden() {
      if (hiddenObserver || typeof document === 'undefined' || typeof window === 'undefined') return;
      if (typeof window.MutationObserver !== 'function') return;
      hiddenObserver = new window.MutationObserver(() => {
        if (hiddenTimer) return;
        hiddenTimer = window.setTimeout(() => {
          hiddenTimer = null;
          applyHidden();
          ensureUserControls();
          ensureNoticeControls();
          if (activeSelection?.actionEl) forceReveal(activeSelection.actionEl);
        }, 200);
      });
      hiddenObserver.observe(document.body, { childList: true, subtree: true });
    }

    function rangeOf(unit) {
      return { startSeq: unit.startSeq, endSeq: unit.endSeq };
    }

    /** The user's own words in the exchange, as opposed to everything the agent produced. */
    function isPromptPart(part) {
      return part.kind === 'user' && part.internal !== true;
    }

    function promptParts(selection) {
      return (selection?.parts ?? []).filter((part) => part.deletable === true && isPromptPart(part));
    }

    function replyParts(selection) {
      return (selection?.parts ?? []).filter((part) => part.deletable === true && !isPromptPart(part));
    }

    function scopeUnits(selection) {
      switch (selection?.choice) {
        case 'group': return selection.group ? [selection.group] : [];
        case 'prompt': return promptParts(selection);
        case 'reply': return replyParts(selection);
        default: return selection.message ? [selection.message] : [];
      }
    }

    function scopePlan(selection) {
      const units = scopeUnits(selection);
      if (units.length === 0) return null;
      return {
        mode: selection.choice === 'group' ? 'group' : 'message',
        ranges: units.map(rangeOf),
        tokens: units.reduce((sum, unit) => sum + (unit.tokens ?? 0), 0),
        count: units.length,
      };
    }

    /** Which scope choices this exchange actually offers. */
    function availableScopes(selection) {
      const scopes = [];
      if (selection?.group?.deletable === true) scopes.push('group');
      if (promptParts(selection).length > 0) scopes.push('prompt');
      const replies = replyParts(selection);
      if (replies.length > 0) scopes.push('reply');
      // "just this message" is only a real extra choice when it is narrower than the reply
      if (selection?.message?.deletable === true && replies.length > 1) scopes.push('message');
      return scopes;
    }

    function scopeLabel(scope) {
      if (scope === 'group') return L.scopeGroup;
      if (scope === 'prompt') return L.scopePrompt;
      if (scope === 'reply') return L.scopeReply;
      return L.scopeMessage;
    }

    function scopeTitle(scope) {
      if (scope === 'group') return L.scopeGroupTitle;
      if (scope === 'prompt') return L.scopePromptTitle;
      if (scope === 'reply') return L.scopeReplyTitle;
      return L.scopeMessageTitle;
    }

    function confirmTitleFor(selection, plan) {
      const base = selection?.choice === 'group' ? L.quickConfirmGroupTitle
        : selection?.choice === 'prompt' ? L.quickConfirmPromptTitle
          : selection?.choice === 'reply' ? L.quickConfirmReplyTitle
            : L.quickConfirmMessageTitle;
      return plan ? `${base} · ~${fmtTokens(plan.tokens)} ${L.tokens}` : base;
    }

    function selectionTargets(selection) {
      if (!selection || typeof document === 'undefined') return [];
      const found = new Set();
      const add = (el) => { if (el?.getAttribute) found.add(el); };
      scopeUnits(selection).forEach((unit) => {
        (unit.nodeKeys ?? []).forEach((key) => document.querySelectorAll(`[data-chat-node-key="${cssEscape(key)}"]`).forEach(add));
        (unit.fullTurns ?? []).forEach((turn) => document.querySelectorAll(`[data-chat-turn="${cssEscape(turn)}"]`).forEach(add));
      });
      if (found.size === 0) add(selection.nodeEl);
      const all = Array.from(found);
      const topmost = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
      const list = topmost.length > 0 ? topmost : all;
      return list.sort((a, b) => (((a.compareDocumentPosition(b) & 4) === 4) ? -1 : 1));
    }

    function clearSelectedNodes() {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('.' + SELECTED_NODE_CLASS).forEach((node) => {
        node.classList.remove(SELECTED_NODE_CLASS, FIRST_NODE_CLASS, LAST_NODE_CLASS);
      });
      document.querySelectorAll('.' + FORCE_REVEAL_CLASS).forEach((node) => node.classList.remove(FORCE_REVEAL_CLASS));
    }

    function forceReveal(node) {
      let current = node;
      let steps = 0;
      while (current && current !== document.body && steps < 8) {
        if (current.classList?.add) current.classList.add(FORCE_REVEAL_CLASS);
        current = current.parentElement;
        steps += 1;
      }
    }

    function paintSelection(selection) {
      clearSelectedNodes();
      if (!selection) return;
      const targets = selectionTargets(selection);
      targets.forEach((el) => el.classList.add(SELECTED_NODE_CLASS));
      if (targets.length > 0) {
        targets[0].classList.add(FIRST_NODE_CLASS);
        targets[targets.length - 1].classList.add(LAST_NODE_CLASS);
      }
      if (selection.actionEl) forceReveal(selection.actionEl);
    }

    function publishSelection(selection) {
      activeSelection = selection;
      paintSelection(selection);
      renderUserControls();
      selectionListeners.forEach((listener) => {
        try { listener(selection); } catch { /* one failing listener must not block the rest */ }
      });
    }

    /* ---- the same entry point on the user's own messages -------------------
       DSH gives plugins no action slot inside a user row, so the control is
       attached to the chat node itself and rebuilt whenever the DOM settles. */

    const USER_NODE_PREFIX = '13:input-message';
    const userControls = new Map();
    let currentSessionId = null;

    function closestChatNode(el) {
      return el?.closest?.('[data-chat-node-key]') ?? null;
    }

    function makeButton(className, label, title, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      if (title) {
        button.title = title;
        button.setAttribute('aria-label', title);
      }
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    function renderUserControl(entry) {
      const root = entry.root;
      const selection = activeSelection && String(activeSelection.messageId) === String(entry.messageId)
        ? activeSelection
        : null;
      const plan = selection ? scopePlan(selection) : null;
      const signature = selection ? `armed:${selection.choice}:${plan?.count ?? 0}:${plan?.tokens ?? 0}` : 'idle';
      root.classList.toggle('dts-armed-host', Boolean(selection));
      // Rebuilding on every mutation would steal focus and burn frames for nothing.
      if (entry.signature === signature && root.childElementCount > 0) {
        if (selection) forceReveal(root);
        return;
      }
      entry.signature = signature;
      root.textContent = '';
      if (!selection) {
        root.appendChild(makeButton('dts-quick-action', L.quickButton, L.quickUserTitle, () => {
          void armFromMessage(currentSessionId, entry.messageId, root, 'prompt');
        }));
        return;
      }
      const cluster = document.createElement('span');
      cluster.className = 'dts-armed';
      const scopes = availableScopes(selection);
      if (scopes.length > 1) {
        const wrap = document.createElement('span');
        wrap.className = 'dts-scope-switch';
        scopes.forEach((scope) => {
          const pill = makeButton(
            `dts-scope-pill${selection.choice === scope ? ' dts-scope-on' : ''}`,
            scopeLabel(scope),
            scopeTitle(scope),
            () => publishSelection({ ...selection, choice: scope }),
          );
          pill.setAttribute('aria-pressed', String(selection.choice === scope));
          wrap.appendChild(pill);
        });
        cluster.appendChild(wrap);
      }
      cluster.appendChild(makeButton('dts-cancel', '✕', L.quickCancelSelection, () => publishSelection(null)));
      const confirm = makeButton('dts-confirm', '✓', confirmTitleFor(selection, plan), () => {
        void confirmSelection(selection, confirm);
      });
      if (!plan) confirm.disabled = true;
      cluster.appendChild(confirm);
      root.appendChild(cluster);
      forceReveal(root);
    }

    async function confirmSelection(selection, button) {
      if (button) {
        button.disabled = true;
        button.textContent = '…';
      }
      try {
        await deleteSelection(selection);
      } catch (cause) {
        showToast(errorText(cause, L.applyFailed));
        if (button) {
          button.disabled = false;
          button.textContent = '✓';
        }
      }
    }

    function renderUserControls() {
      userControls.forEach((entry) => {
        try {
          renderUserControl(entry);
        } catch { /* a detached row must not break the other rows */ }
      });
    }

    function ensureUserControls() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const seen = new Set();
      document.querySelectorAll(`[data-chat-node-key^="${USER_NODE_PREFIX}"]`).forEach((node) => {
        const key = node.getAttribute('data-chat-node-key') ?? '';
        const messageId = key.slice(USER_NODE_PREFIX.length);
        if (!messageId || seen.has(messageId)) return;
        seen.add(messageId);
        if (node.classList.contains(HIDDEN_NODE_CLASS)) return;
        // Only real user bubbles: steering batches and context injections render elsewhere.
        const flowKind = node.getAttribute('data-chat-flow-kind');
        if (flowKind === 'steering' || flowKind === 'context') return;
        let entry = userControls.get(messageId);
        if (!entry || entry.host !== node || !entry.root.isConnected) {
          entry?.root.remove();
          const root = document.createElement('div');
          root.className = 'dts-user-sieve';
          root.setAttribute('data-dts-message', messageId);
          if (window.getComputedStyle?.(node)?.position === 'static') node.style.position = 'relative';
          node.appendChild(root);
          entry = { host: node, root, messageId, signature: '' };
          userControls.set(messageId, entry);
        }
        renderUserControl(entry);
      });
      userControls.forEach((entry, messageId) => {
        if (!entry.host.isConnected) {
          entry.root.remove();
          userControls.delete(messageId);
        }
      });
    }

    /** Fetch the exchange around one chat message and arm the inline confirmation. */
    async function armFromMessage(sessionId, messageId, originEl, preferredChoice) {
      const id = sessionId ?? currentSessionId;
      if (!id) {
        showToast(L.sessionMissing);
        return null;
      }
      try {
        const payload = await readJson(await fetch(
          `${LOOKUP_PATH}?sessionId=${encodeURIComponent(id)}&messageId=${encodeURIComponent(String(messageId ?? ''))}`,
          { headers: { accept: 'application/json' } },
        ));
        if (payload.hidden) setHiddenPayload(payload.hidden, id);
        if (payload.busy === true) {
          showToast(L.quickBusy);
          return null;
        }
        const draft = {
          sessionId: id,
          messageId,
          choice: 'group',
          group: payload.group ?? null,
          message: payload.message ?? null,
          parts: payload.parts ?? [],
          nodeEl: closestChatNode(originEl),
          actionEl: originEl ?? null,
        };
        const scopes = availableScopes(draft);
        if (scopes.length === 0) {
          showToast(L.quickProtected);
          return null;
        }
        draft.choice = scopes.includes(preferredChoice) ? preferredChoice
          : scopes.includes('group') ? 'group' : scopes[0];
        publishSelection(draft);
        return draft;
      } catch (cause) {
        showToast(errorText(cause, L.quickNoTarget));
        return null;
      }
    }

    async function deleteSelection(selection) {
      const plan = scopePlan(selection);
      if (!plan) return false;
      const payload = await readJson(await fetch(PRUNE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId: selection.sessionId, mode: plan.mode, ranges: plan.ranges }),
      }));
      setHiddenPayload(payload.hidden, selection.sessionId);
      publishSelection(null);
      notifyChanged();
      ensureUserControls();
      const freed = payload.freedTokens ?? plan.tokens;
      showToast(`${L.quickDone} ~${fmtTokens(freed)} ${L.tokens}`);
      return true;
    }

    function QuickAction(props) {
      const sessionId = props.sessionId;
      const messageId = props.messageId;
      const rootRef = React.useRef(null);
      const [selection, setSelection] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [applying, setApplying] = React.useState(false);

      React.useEffect(() => {
        if (sessionId) currentSessionId = sessionId;
        ensureStyle();
        observeHidden();
        refreshHidden(sessionId);
        ensureUserControls();
      }, [sessionId]);

      React.useEffect(() => {
        const listener = (next) => setSelection(next && String(next.messageId) === String(messageId) ? next : null);
        selectionListeners.add(listener);
        listener(activeSelection);
        return () => { selectionListeners.delete(listener); };
      }, [messageId]);

      React.useEffect(() => {
        if (selection) paintSelection(selection);
      }, [selection]);

      const armed = Boolean(selection);
      const plan = armed ? scopePlan(selection) : null;
      const scopes = armed ? availableScopes(selection) : [];

      const remove = async () => {
        if (!plan || applying || !selection) return;
        setApplying(true);
        try {
          await deleteSelection(selection);
        } catch (cause) {
          showToast(errorText(cause, L.applyFailed));
        } finally {
          setApplying(false);
        }
      };

      return h('span', { ref: rootRef, className: 'dts-inline' }, armed
        ? h('span', { className: 'dts-armed' },
          scopes.length > 1 ? h('span', { className: 'dts-scope-switch' }, scopes.map((scope) => h('button', {
            type: 'button',
            key: scope,
            className: `dts-scope-pill${selection.choice === scope ? ' dts-scope-on' : ''}`,
            title: scopeTitle(scope),
            'aria-pressed': selection.choice === scope,
            onClick: () => publishSelection({ ...selection, choice: scope }),
            disabled: applying,
          }, scopeLabel(scope)))) : null,
          h('button', {
            type: 'button',
            className: 'dts-cancel',
            title: L.quickCancelSelection,
            'aria-label': L.quickCancelSelection,
            onClick: () => publishSelection(null),
            disabled: applying,
          }, '✕'),
          h('button', {
            type: 'button',
            className: 'dts-confirm',
            title: confirmTitleFor(selection, plan),
            'aria-label': confirmTitleFor(selection, plan),
            onClick: remove,
            disabled: !plan || applying,
          }, applying ? '…' : '✓'))
        : h('button', {
          type: 'button',
          className: `dts-quick-action${loading ? ' is-loading' : ''}`,
          title: L.quickTitle,
          'aria-label': L.quickTitle,
          onClick: () => {
            if (loading || applying) return;
            setLoading(true);
            void armFromMessage(sessionId, messageId, rootRef.current, 'group').finally(() => setLoading(false));
          },
          disabled: loading,
        }, h(FunnelIcon), h('span', null, loading ? L.quickLoading : L.quickButton)));
    }

    function HeaderButton(props) {
      const [open, setOpen] = React.useState(false);
      React.useEffect(ensureStyle, []);
      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          className: 'dts-button',
          title: L.buttonTitle,
          'aria-label': L.buttonTitle,
          onClick: () => setOpen(true),
        }, h(FunnelIcon), h('span', null, L.button)),
        open ? h(PruneDialog, { sessionId: props.sessionId, onClose: () => setOpen(false) }) : null);
    }

    return {
      name: 'dsh-turn-sieve',
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'dsh-turn-sieve:open',
          order: 25,
        }, HeaderButton));
        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions',
          id: 'dsh-turn-sieve:quick',
          order: 30,
        }, QuickAction));
      },
    };
  },
});