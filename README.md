# dsh-turn-sieve · 回合筛

> 不用新开会话，也能把一段对话里不再有价值的问答从后续上下文中筛掉。

DSH 的会话日志是只追加的：一旦聊长了，早期的寒暄、走错方向的尝试、重复的排错过程就会一直占着上下文。`dsh-turn-sieve` 在会话右上角的工具区加了一个「回合筛」入口，把当前会话按**整段问答**列出来，你可以勾掉不需要的部分，让它们不再进入后续请求。

![npm](https://img.shields.io/npm/v/dsh-turn-sieve)

## 安装

在 DSH Web 的插件页点击「添加插件」，输入：

```text
dsh-turn-sieve
```

或者使用命令行：

```bash
dsh plugin add dsh-turn-sieve
```

安装后无需重启，打开任意会话即可在右上角看到漏斗图标和「回合筛」。

## 使用

1. 打开一个已经聊了多轮的会话。
2. 点击右上角的 **回合筛**。
3. 在列表里勾选不再需要的整段问答（可以多选，也可以全选可移除项）。
4. 点击「移除所选对话」，再点一次确认。

列表里每一行会显示：

- 这段对话的开头（你的提问或助手回复）；
- 第几轮、包含多少条消息；
- 大约占用多少 tokens；
- 工具调用数量；
- 受保护的原因（如果有）。

移除后，这些问答不会再进入后续模型上下文；当前上下文会立即变短，下一轮请求即可生效。

## 安全边界

- **不会删除原始日志。** 插件只向 Session 追加一个空的 `system/message` 事件，并用 `replace` surface 操作覆盖选中的区间。原始事件仍完整保留在会话日志里，可用于导出或审计。
- **系统提示词与会话初始上下文受保护。** 包含 surface 节点 0 的 system/developer 上下文不会被移除。
- **最近一轮受保护。** 正在进行或刚刚完成的最后一轮问答始终保留，避免误删当前任务。
- **助手回复期间不可操作。** 当前回合没有结束时，插件会拒绝修改，等本轮结束后再试。
- **按整段问答删除。** 不会拆开 assistant 的 tool-call 与对应的 tool-result，避免产生不完整的工具调用历史。
- **界面内没有撤销。** 日志还在，但目前没有一键恢复入口；请只勾选确定不需要的段落。

## 和上下文压缩插件的关系

`dsh-turn-sieve` 不是自动压缩：

- 压缩插件（如 `dsh-compaction-basic`、`billion-context`）在上下文接近上限时自动把旧内容总结成 checkpoint；
- 回合筛是**手动、可挑选**的：由你决定哪几段问答不再重要，然后直接把它们从未来上下文中移除，不生成摘要，也不额外消耗一次总结请求。

两者可以同时安装。

## 工作原理

DSH 的 `Session` 有一个「surface」概念：日志保存全部事件，surface 决定哪些事件会投影成模型消息。`dsh-turn-sieve` 做的事是：

1. 按 surface 顺序把节点分组：每遇到一条**真实用户输入**的 `user/message` 就开启一段新的问答；DSH 在每一步注入的运行时上下文（`Time sampled...`、`Current runtime context.`、`<system-reminder>`、`<hindsight_pages>` 等）虽然也以 `user/message` 记录，但会并入当前问答，不会把一段问答拆散。开头的 system/developer 上下文单独成组并受保护。
2. 对每一组生成预览、消息数量、工具调用数和 token 估算。
3. 用户勾选后，为每个选中区间追加：

```js
session.append('system/message', {
  turn,
  step: 0,
  message: { id, role: 'system', source: { kind: 'system-prompt' }, content: [] },
}, {
  surfaceOp: { op: 'replace', startSeq, endSeq },
  sourceEventSeqs: shadowedSeqs,
});
```

空内容的 system message 不会投影成模型消息，因此整段区间从 `deriveMessages()` 中消失；日志本身没有被修改。

> 注意：替换会让该区间之后的 KV 缓存前缀失效。下一轮请求的输入会明显变小，但首 token 延迟可能略有变化，这是 surface 替换的正常代价。

## Agent 工具

插件同时注册了 `turn_sieve` 工具，助手可以在你明确要求时列出或移除对话段落：

- `action: "list"`：返回当前会话的段落列表、受保护标记和 token 估算；
- `action: "prune"`：传入 `ranges: [{ startSeq, endSeq }]` 执行移除。

工具和界面共用同一套 Host 逻辑，行为一致。删除操作仍然只作用于当前会话。

## 限制

- 只支持当前在 Host 中处于活动状态的会话；已归档或未加载的会话请先打开。
- 只支持按整段问答移除，暂不支持单条 tool-result 级别的精细裁剪。
- token 数来自 `tokenMeter` 的估算，界面上显示为“约”，用于比较相对大小。
- 需要 DSH `>= 0.2.0-rc.2`。

## 开发

```bash
git clone https://github.com/GuYou9799/dsh-turn-sieve.git
cd dsh-turn-sieve
npm test
```

项目结构：

```text
lib/index.js        Host 插件：HTTP 路由、分组、surface 替换、Agent 工具
lib/client.js       Web 客户端：会话头部按钮与筛选对话框
locale/*.json       插件市场元数据
cordis.patch.yml    Bundle 插入补丁
test/*.test.mjs     分组与移除逻辑测试
```

本地安装：

```bash
# 在 DSH 中执行，或使用 GUI 的“安装本地 Bundle”
dsh plugin add /absolute/path/to/dsh-turn-sieve
```

## License

MIT © 2026 Gu You