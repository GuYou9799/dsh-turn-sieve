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
    };

    const CSS = `
.dts-button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1;white-space:nowrap;transition:background .12s ease,color .12s ease}
.dts-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.44);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.dts-dialog{width:780px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden}
.dts-tabs{display:flex;gap:4px;padding:0 20px 8px}
.dts-tab{height:28px;padding:0 11px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dts-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-tab-active{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.dts-hint{padding:0 20px 8px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
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
`;

    function ensureStyle() {
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
      const allSelected = removable.length > 0 && removable.every((item) => selected.has(item.id));
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
      h('span', { style: { flex: 1 } }),
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
        body = h('div', { className: 'dts-scroll' },
          items.map((item, index) => h(UnitRow, {
            key: item.id,
            item,
            mode,
            index,
            checked: selected.has(item.id),
            onToggle: toggle,
          })),
          removable.length === 0 ? h('div', {
            style: { padding: '10px 12px 4px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
          }, L.allProtected) : null,
        );
      }

      const undoButton = canUndo ? h('button', {
        type: 'button',
        className: 'dts-ghost',
        title: L.undo,
        onClick: runUndo,
        disabled: !canUndo,
        style: undoConfirm ? { borderColor: 'var(--dsw-alias-state-warn-primary)', color: 'var(--dsw-alias-state-warn-primary)' } : undefined,
      }, undoing ? L.undoing : (undoConfirm ? L.undoConfirm : `${L.undo} (${state.undo.ranges} ${undoWord})`)) : null;

      const footer = h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--dsw-alias-border-l1)',
        },
      },
      h('div', {
        style: { flex: 1, fontSize: 10.5, lineHeight: 1.45, color: 'var(--dsw-alias-label-secondary)' },
      }, confirming ? L.confirmHint : (mode === 'group' ? L.noteGroup : L.noteMessage)),
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
      },
    };
  },
});