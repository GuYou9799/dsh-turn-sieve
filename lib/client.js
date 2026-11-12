/* global window, document, navigator */

/**
 * dsh-turn-sieve — browser half.
 *
 * The header utility opens a picker that groups the live surface into whole
 * exchanges. The Host endpoint does the append-only surface replacement; this
 * file only renders the picker and calls that endpoint through the same-origin
 * local route (the same route is available to the agent tool on the Host half).
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

    const L = zh ? {
      button: '回合筛',
      buttonTitle: '回合筛：选择性清理这段会话中不再需要的对话',
      title: '回合筛 · 选择性清理对话',
      subtitle: '勾选不再需要的整段问答，把它们从后续上下文中筛掉。系统提示词和最近一轮会自动保留；原始会话日志不会被删除。',
      loading: '正在读取会话结构…',
      loadFailed: '读取失败',
      retry: '重试',
      refresh: '刷新',
      close: '关闭',
      empty: '这个会话还没有可筛选的对话。',
      allProtected: '没有可移除的对话：系统提示与会话初始上下文、以及最近一轮会自动保留。',
      total: '当前上下文',
      tokens: 'tokens',
      exchanges: '段对话',
      selected: '已选',
      estimated: '预计释放',
      selectAll: '全选可移除',
      clearAll: '取消全选',
      busy: '助手正在回复。请等当前回合结束后再筛除对话。',
      busyShort: '回复中',
      latest: '保留 · 最近一轮',
      system: '保留 · 系统提示',
      you: '你',
      assistant: '助手',
      systemContext: '系统提示词与会话初始上下文',
      context: '上下文',
      items: '条',
      turn: '第',
      turnUnit: '轮',
      tools: '次工具',
      toolChanges: '含工具变更',
      note: '原始日志仍保留；被移除的回合只是不再进入后续上下文。此操作在界面中不可撤销。',
      cancel: '取消',
      apply: '移除所选对话',
      confirm: '确认移除',
      applying: '正在移除…',
      applied: '已移除',
      appliedTail: '段对话，预计为后续上下文释放约',
      appliedTail2: 'tokens。',
      stale: '会话结构已变化，请刷新后再选。',
      sessionMissing: '没有拿到当前会话 ID，请刷新页面后重试。',
      confirmHint: '再点一次确认。移除后这些问答不会再进入后续上下文。',
      applyFailed: '移除失败',
    } : {
      button: 'Turn Sieve',
      buttonTitle: 'Turn Sieve: selectively drop exchanges that no longer matter',
      title: 'Turn Sieve · selectively prune this conversation',
      subtitle: 'Tick whole Q&A exchanges you no longer need and keep them out of future context. The system context and the latest exchange are protected; the append-only session log is never deleted.',
      loading: 'Reading the conversation surface…',
      loadFailed: 'Could not load',
      retry: 'Retry',
      refresh: 'Refresh',
      close: 'Close',
      empty: 'This conversation has no exchanges to prune yet.',
      allProtected: 'Nothing can be removed: the system context and the latest exchange are protected.',
      total: 'Current context',
      tokens: 'tokens',
      exchanges: 'exchanges',
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
      systemContext: 'System prompt & initial context',
      context: 'Context',
      items: 'items',
      turn: 'turn',
      turnUnit: '',
      tools: 'tool calls',
      toolChanges: 'tool changes',
      note: 'The raw log is kept; removed exchanges simply stop entering future context. There is no undo in the UI.',
      cancel: 'Cancel',
      apply: 'Prune selected',
      confirm: 'Confirm removal',
      applying: 'Removing…',
      applied: 'Removed',
      appliedTail: 'exchange(s), freeing about',
      appliedTail2: 'tokens from future context.',
      stale: 'The conversation changed. Refresh and choose again.',
      sessionMissing: 'No current session id. Refresh the page and try again.',
      confirmHint: 'Click once more to confirm. These exchanges will stop entering future context.',
      applyFailed: 'Prune failed',
    };

    const CSS = `
.dts-button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1;white-space:nowrap;transition:background .12s ease,color .12s ease}
.dts-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dts-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.44);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.dts-dialog{width:760px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden}
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

    function GroupRow({ group, checked, index, onToggle }) {
      const disabled = group.deletable !== true;
      const isSystem = group.protectedReason === 'system-prompt' && !group.userPreview && !group.assistantPreview;
      const primary = isSystem
        ? L.systemContext
        : group.userPreview || group.assistantPreview || L.context;
      const secondary = group.assistantPreview && group.assistantPreview !== primary ? group.assistantPreview : '';
      const meta = [];
      meta.push(`#${index + 1}`);
      if (typeof group.turn === 'number') meta.push(`${L.turn} ${group.turn + 1}${L.turnUnit}`);
      const count = group.parts ? (group.parts.user + group.parts.assistant + group.parts.tool + group.parts.system + group.parts.developer) : 0;
      meta.push(`${count} ${L.items}`);
      meta.push(`~${fmtTokens(group.tokens)} ${L.tokens}`);
      if (group.toolCalls > 0) meta.push(`${group.toolCalls} ${L.tools}`);
      if (group.hasToolChange) meta.push(L.toolChanges);

      return h('label', {
        className: `dts-row${disabled ? ' dts-row-protected' : ''}`,
        title: disabled ? (group.protectedReason === 'system-prompt' ? L.system : L.latest) : undefined,
      },
      h('input', {
        type: 'checkbox',
        className: 'dts-check',
        checked,
        disabled,
        onChange: () => onToggle(group.id),
      }),
      h('div', { style: { minWidth: 0, flex: 1 } },
        h('div', { style: { display: 'flex', alignItems: 'center', minWidth: 0 } },
          h('span', { className: 'dts-badge' }, isSystem ? (zh ? '系统' : 'System') : L.you),
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
          disabled ? h('span', { className: 'dts-lock' }, group.protectedReason === 'system-prompt' ? L.system : L.latest) : null,
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
      const [state, setState] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [selected, setSelected] = React.useState(() => new Set());
      const [confirming, setConfirming] = React.useState(false);
      const [applying, setApplying] = React.useState(false);
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
        fetch(`${GROUPS_PATH}?sessionId=${encodeURIComponent(sessionId)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
          .then(readJson)
          .then((data) => {
            if (cancelled) return;
            setState(data);
            setSelected(new Set());
            setConfirming(false);
          })
          .catch((cause) => {
            if (cancelled || cause.name === 'AbortError') return;
            setError(cause.message || L.loadFailed);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [sessionId, nonce]);

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

      const groups = state?.groups ?? [];
      const selectedGroups = groups.filter((group) => selected.has(group.id));
      const selectedTokens = selectedGroups.reduce((sum, group) => sum + (Number(group.tokens) || 0), 0);
      const removable = groups.filter((group) => group.deletable);
      const allSelected = removable.length > 0 && removable.every((group) => selected.has(group.id));
      const canApply = selected.size > 0 && !applying && state?.busy !== true;

      const toggle = (id) => {
        const group = groups.find((candidate) => candidate.id === id);
        if (!group || !group.deletable || applying) return;
        setConfirming(false);
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
        setNotice('');
        if (allSelected) {
          setSelected(new Set());
          return;
        }
        setSelected(new Set(removable.map((group) => group.id)));
      };

      const apply = async () => {
        if (!canApply) return;
        if (!confirming) {
          setConfirming(true);
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
              ranges: selectedGroups.map((group) => ({ startSeq: group.startSeq, endSeq: group.endSeq })),
            }),
          }));
          if (data.state) setState(data.state);
          setSelected(new Set());
          setConfirming(false);
          setNotice(`${L.applied} ${data.pruned?.length ?? selectedGroups.length} ${L.appliedTail} ~${fmtTokens(data.freedTokens ?? selectedTokens)} ${L.appliedTail2}`);
        } catch (cause) {
          setError(`${L.applyFailed}: ${cause.message || L.applyFailed}`);
          setConfirming(false);
        } finally {
          setApplying(false);
        }
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
      h('span', null, `${groups.length} ${L.exchanges}`),
      selected.size > 0 ? h('span', { style: { color: 'var(--dsw-alias-brand-primary)', fontWeight: 600 } }, `${L.selected} ${selected.size} · ${L.estimated} ~${fmtTokens(selectedTokens)} ${L.tokens}`) : null,
      h('span', { style: { flex: 1 } }),
      state?.busy ? h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)', fontWeight: 600 } }, L.busyShort) : null,
      h('button', {
        type: 'button',
        className: 'dts-ghost',
        style: { height: 26, padding: '0 9px', fontSize: 11 },
        onClick: () => setNonce((value) => value + 1),
        disabled: loading || applying,
      }, L.refresh));

      const banners = [];
      if (state?.busy) {
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
      } else if (groups.length === 0) {
        body = h('div', { style: { padding: '36px 20px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } }, L.empty);
      } else {
        body = h('div', { className: 'dts-scroll' },
          groups.map((group, index) => h(GroupRow, {
            key: group.id,
            group,
            index,
            checked: selected.has(group.id),
            onToggle: toggle,
          })),
          removable.length === 0 ? h('div', {
            style: { padding: '10px 12px 4px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
          }, L.allProtected) : null,
        );
      }

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
      }, confirming ? L.confirmHint : L.note),
      h('button', {
        type: 'button',
        className: 'dts-ghost',
        onClick: () => {
          if (confirming) setConfirming(false);
          else onClose();
        },
        disabled: applying,
      }, confirming ? L.cancel : L.cancel),
      h('button', {
        type: 'button',
        className: 'dts-primary',
        onClick: apply,
        disabled: !canApply,
        style: confirming ? { background: 'var(--dsw-alias-state-error-primary)' } : undefined,
      }, applying ? L.applying : confirming ? `${L.confirm} (${selected.size})` : L.apply));

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
      }, header, stats, banners, body, footer)));
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