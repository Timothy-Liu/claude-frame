# Claude Frame — 用户手册

> Claude Frame 是一个为命令行 AI 编程 agent 准备的 VS Code 聊天面板。
> 本文档详细介绍每个功能。简要概览见 [README_CN.md](README_CN.md)。

## 目录

- [快速上手](#快速上手)
- [核心概念](#核心概念)
- [常见工作流](#常见工作流)
- [UI 详解](#ui-详解)
- [小技巧](#小技巧)
- [已知问题](#已知问题)
- [疑难排查](#疑难排查)
- [架构](#架构)

---

## 快速上手

### 前置条件
- VS Code 1.85 或更高版本。
- 一个已安装且在 `PATH` 里的 AI agent CLI。当前支持:[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)。
- **(强烈建议)tmux 3.0+**。没有 tmux 扩展也能跑(一次性模式),但每次输入都付冷启动代价,关 VS Code 也会杀死 agent。

### 安装扩展
- 从 Marketplace:在 Extensions 视图搜索 **Claude Frame**,点 Install。
- 或者从 [Releases](../../releases) 下载最新 `.vsix`,VS Code 里执行 `Extensions: Install from VSIX...`。

### 第一次聊天
1. 打开你想工作的项目文件夹。
2. 按 `Cmd+Alt+C` (macOS) 或 `Ctrl+Alt+C` (Linux/Windows)。聊天面板作为 editor tab 打开。
3. **Project** 下拉框会自动选中你当前 workspace 对应的项目;**Conversation** 下拉框列出该项目下所有历史会话(初次使用是空的)。
4. 点 **New Chat**。在弹窗里输入初始 prompt,按 Enter。
5. 面板重置,短暂显示 loading 转圈,然后 agent 的回应开始流式出现。标题左边的心脏开始跳 —— 你的 agent 活了。

<!-- TODO: New Chat 对话框 + 第一条回应的截图 -->

---

## 核心概念

### Conversation(会话)
最基本的单位。每个 conversation 有:
- 一个唯一 ID(UUID)。
- 磁盘上一个 `.jsonl` 日志,记录每一轮 —— 由 agent CLI 自己维护,不是扩展管理。
- 一个可选的、用户自定义的**标题**和**强调色**,由扩展持久化、跨重启保留。

Conversation ID 是唯一的事实来源:标题、颜色、tmux session 名(若启用)、磁盘日志文件名,全部以它为 key。

### Project(项目)
Agent 运行所在的目录。扩展按工作目录给 conversation 分组,这样你在每个项目里只看到相关的会话。

**Project** 下拉框列出所有曾经承载过会话的目录。打开面板时,如果当前 workspace 跟某个项目对得上,会自动选中它。

### tmux 模式 vs 一次性模式

扩展提供两种 agent 运行方式,由工具栏的 **Use tmux** 复选框切换:

|  | **tmux 开**(推荐) | **tmux 关** |
|---|---|---|
| 进程模型 | 一个长期存活的 interactive agent,跑在 detached tmux session 里 | 每一轮都启动一个全新的 non-interactive agent |
| 每轮成本 | 只算新 token(prompt cache 一直温热) | 大部分走 cache,但 TTL 过期 / CLI 升级时需要完整重发 |
| 每轮延迟 | 即时 —— 进程已加载好 | 大约 1-2 秒启动开销 |
| 关 VS Code 后存活 | ✅ | ❌ agent 跟随 extension host 一起退出 |
| 适用场景 | 默认。任何持续性工作。 | 快速只读浏览;不能用 tmux 的机器 |

完整原因见 [README 的 tmux 章节](README_CN.md#-为什么-tmux-让一切更好)。

### 心跳 ♥
标题左边一颗小心脏。Conversation 处于活跃状态时(你刚 **Resume** 或刚 **New Chat**),它按稳定的两连击节奏跳动。你只是浏览历史不接管会话时,它静止不动。一眼就知道 agent 进程是不是活着的。

### 每会话独立标识
- **标题** —— 双击标题文字,或者点 ✏️ 铅笔图标,进入编辑模式。按 Enter 或点别处保存。跨重启持久化。Conversation 下拉框和编辑器 tab 标题都同步显示。
- **强调色** —— 点 🎨 调色盘图标,弹出系统原生取色器,选任意颜色。标题、心脏、UI 各处的强调高亮、Send 按钮全部立刻染上新色。每个会话独立持久化。

### Backend(后端)
扩展的 UI 不知道任何具体 agent 的协议。它只跟一个小小的 `AgentBackend` 接口对话;默认的 backend 包装 Claude Code。Backend 负责启动 agent、监听会话日志的事件、把用户输入路由回去。见 [架构](#架构)。

---

## 常见工作流

### 开新会话
1. 按 `Cmd+Alt+C`(或聚焦到已有面板)。
2. 确认 **Use tmux** 已勾选(tmux 装了的话默认就勾上)。
3. 点 **New Chat**。在 VS Code 输入框里敲初始 prompt,按 Enter。
4. 面板重置,短暂 loading 后开始流式接收 agent 回应。心脏开始跳。

### Resume 已有会话
1. **Conversation** 下拉框选一个历史会话。历史加载完(只读)。
2. 点 **Resume**。Agent 进程拉起(或接到已有 tmux session)。心脏开始跳。输入区变成可编辑。
3. 输入下一条消息,按 Enter。

### 只浏览,不接管
1. **Conversation** 下拉框选会话。历史加载。
2. **不要**点 Resume。心脏保持静止;输入区仍只读。你可以读、滚动、选 bubble、复制内容 —— 但不能发新消息。

### 在多个活跃会话之间切换
- 每按一次 `Cmd+Alt+C` 都开一个全新面板。可以并排开任意多个 tab。
- 用不同的颜色和标题区分,一眼就能识别。

### 改名 / 换色
- 标题:双击标题文字,输入新名,按 Enter。
- 颜色:点 🎨 调色盘,从原生取色器里选。
- 都立刻保存并在面板各处生效。

### 进入 / 退出 Zen 模式
- 点 batch 栏里的 `▲ Zen Mode`(或自己绑的快捷键)。
- Header 和 settings 栏消失。心脏和标题滑到 batch 栏右侧(字号缩到 13px 跟周围一致)。
- 对话区扩展到全屏。
- 点 `▼ Exit Zen` 复原。

---

## UI 详解

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ♥  My Refactor Session   ✏️  🎨                                        │  ← Header
├─────────────────────────────────────────────────────────────────────────┤
│  Project: /home/me/repo ▾    Conversation: My Refactor ▾    Refresh    │
│                              Resume   New Chat   ☑ Use tmux            │
├─────────────────────────────────────────────────────────────────────────┤
│  ☐ Align all left   ☑ Group by turn                                    │  ← Settings 栏
├─────────────────────────────────────────────────────────────────────────┤
│  ▲ Zen   Select All   Clear   Copy Selected (0)        abc-1234 📋 ID │  ← Batch 栏
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                                                  👤 You                 │
│                              Refactor handleResume to use the new API.  │
│                                                                         │
│   🤖 Assistant                                                         │
│   I'll start by reading the current implementation in panel.ts...      │
│   ```typescript                                                         │
│   private async handleResume(...) { ... }                              │
│   ```                                                                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ───── (拖拽调整高度) ─────                                              │
│  Type your message here (Enter to send, Shift+Enter for newline)        │
│                                                                  [Send] │
└─────────────────────────────────────────────────────────────────────────┘
```

### Header
- **♥ 心脏图标** —— 活跃时跳动,空闲时静止。颜色跟随强调色。
- **标题** —— 强调色加粗。双击或点 ✏️ 铅笔进入改名模式。
- **✏️ 铅笔** —— 改名模式的另一个触发入口。
- **🎨 调色盘** —— 打开系统原生取色器。

### 工具栏
- **Project 下拉** —— 切换到其他有历史会话的项目目录。当前 workspace 优先选中。
- **Conversation 下拉** —— 选当前项目下的历史会话。有标题就显示标题,没有就显示完整 conversation ID。
- **Refresh** —— 从磁盘重新扫描 project / conversation 列表。如果 agent 在外部刚创建了新会话,刷新后能看到。
- **Resume** —— 把选中的会话作为活跃 session 接管。
- **New Chat** —— 新开会话。弹出输入框让你写初始 prompt。
- **Use tmux** —— 启用长期 tmux 后台。机器装了 tmux 时默认勾上;没装时 checkbox disabled。

### Settings 栏
- **Align all left** —— 不要"你的消息靠右、agent 的靠左"那种聊天气泡布局,所有消息一律靠左,呈聊天日志风格。
- **Group by turn** —— 把用户消息和 agent 回应配对成一张卡片显示。

### Batch 栏
- **Zen toggle**(`▲ Zen Mode` / `▼ Exit Zen`)—— 隐藏 / 显示 header + settings 栏。
- **Select All** / **Clear Selection** —— 全选 / 清除所有可见的 turn。
- **Copy Selected (N)** —— 把选中的 turn 以干净 Markdown 复制到剪贴板(不是终端 scrollback)。数字实时更新。
- **Conversation ID + 📋 Copy ID** —— 会话加载后显示。点击复制完整 UUID。

### 对话区
- 每个 turn 是一个 bubble。Hover 出现虚线 accent 外框。点 bubble 任意非按钮区域切换选中(实线 accent 环)。
- 代码块走 Prism 语法高亮,每块有自己的 **Copy** 按钮。复制出去的是底层 Markdown 源文本 —— 没有终端换行 artifacts、没有零宽空格、没有行尾余白。`bash` 块里的命令复制完直接粘到 shell 就能跑。
- 长会话自然滚动,新消息自动滚到底部。
- 点 Send 之后立刻出现 thinking 转圈占位,agent 回应到达时消失。

### 输入区
- **Textarea** —— Enter 发送,Shift+Enter 换行。
- **Splitter** —— textarea 上方那条窄条,拖拽调整输入区高度(40px ~ 视口高度 60% 之间)。
- **Send 按钮** —— 默认半透明,hover 全不透明,有响应进行中时 disabled。

### Zen 模式
隐藏 header 和 settings 栏。对话区扩展占用更多屏幕。心脏和标题搬到 batch 栏右侧 —— 字号缩到 13px 跟周围统一,但仍然紧贴 conversation ID,身份感不丢失。

---

## 小技巧

### 用颜色区分并行任务
同时开 3-5 个会话散落在 tab 里。每个用不同的 accent:红色给紧急 bug,绿色给 feature,紫色给实验。一眼就知道你在哪个会话里。

### 让标题救你的记忆
离开前把会话重命名成有意义的话("修支付重试流程")。两天后回来,下拉框读起来像 TODO 列表,而不是一堆 UUID。

### 真的,用 tmux
成本和延迟的差别是实打实的,一天下来累积可观。见 [README 的 tmux 章节](README_CN.md#-为什么-tmux-让一切更好)。

### 重载 UI 不杀 agent
`Developer: Reload Window`(或开发宿主里 `Cmd+R`)只重载 webview,不动 tmux。迭代扩展代码时很好用 —— agent 状态原样保留。

### 复制即用
一个细微但实在的效率提升:从终端渲染的 agent 界面复制代码,通常会带上终端的换行包装、ANSI 颜色码、行尾余白,命令得清洗一遍才能跑。从 Claude Frame 复制出去的是底层 Markdown 源文本 —— `bash` 块里的命令一粘进 shell 就能跑。

### 长对话用 Zen 模式
回顾长会话时,Zen 模式把 header 占用的高度还给内容。心脏和标题仍在 batch 栏可见,上下文不丢。

---

## 已知问题

### Agent 卡在交互式提示上

扩展启动 agent 时用了**auto-permission 模式**,大多数动作 agent 自己判断不再问。但仍有少量交互场景会**在 agent 的 pane 里弹出提示**,webview 没法渲染也没法响应:

- 第一次在某个目录用时的 workspace 信任确认
- 编号选项("Choose: 1) … 2) … 3) …")
- 自带 UI 的 slash 命令
- 权限策略仍然认为需要升级确认的动作

症状:心跳一直跳,**Thinking** 转圈不停,新一轮没出现。

**解法是 attach 到 agent 的 tmux session 在里面回应**:

```bash
tmux ls                                                # 找到与 conversation ID 同名的 session
tmux attach -t <你的-conversation-id>                   # 看到提示并回答
# 完事 detach(别 kill):先 Ctrl-b,再 d
```

在 pane 里回答完,agent 继续往下走。Webview 自动接住新一轮,不用刷新。

如果是**关 tmux**(一次性模式)在跑,没有 pane 可 attach。Agent 碰到没法在非交互模式回答的提示就退出,情况依实现而定。最省事:开会话之前先勾上 tmux。

### 推荐习惯:在面板旁边常开一个 tmux-attached 终端

聊天面板没法渲染 agent 可能弹出的所有交互式提示。务实的做法是 **从一开始就**在面板旁开一个 attach 到 tmux 的终端,这样 agent 一弹出提示你立刻就能看到。

1. 用扩展开会话,**Use tmux** 勾上。
2. 打开 VS Code 集成终端(`` Ctrl + ` ``)。
3. **把终端挪到右边**,跟聊天面板并排 —— 把终端标签拖到编辑器区右边缘,或从命令面板跑 `Terminal: Move Terminal into Editor Area` 再拖。这样聊天面板和实时 agent pane 能同时看见。
4. `tmux attach -t <你的-conversation-id>` 进入活的 agent session。完事 `Ctrl-b d` detach(别 `Ctrl-d`,那会终止 session)。
5. 工作时瞟一眼终端。Webview 渲染不出来的提示都会在那儿出现,直接在 pane 里回答即可。Agent 继续往下走,webview 自动接住新一轮。

扩展的 webview 一直在独立地流式显示对话,两边读的是同一个 `.jsonl` 文件。

> **注意**:不要同时从聊天面板和终端往同一会话发消息。按 Anthropic 文档,两个并发的 prompt 会在 transcript 里交错 —— 功能上能跑,但读起来很乱。

如果一开始没 attach,后来 agent 看起来 hang 住了(心跳还在跳、Thinking 转圈不出新一轮),同样 `tmux attach -t <你的-conversation-id>` 看一眼就知道在等什么,直接回答即可。

---

## 疑难排查

### "AI agent CLI not found on PATH"
面板顶部 banner 提示。期待的 CLI 二进制不在 PATH 上。按 [README 快速开始](README_CN.md#-快速开始)装上,然后重新打开面板或点 **Refresh**。

### Send 按钮没反应 / thinking 转圈不停
1. 在终端里确认 agent CLI 能跑:比如 `claude --version`。
2. 开了 tmux 的话:`tmux ls` 应该能看到与 conversation ID 同名的 session。
3. 没开 tmux 的话:每轮都启动新 agent。手动在终端跑一遍对应命令看报错。

### tmux session 杀不掉
- 杀某个:`tmux kill-session -t <conversation-id>`。
- 杀全部:`tmux kill-server`。

### 下拉框里的某个 conversation 不见了
扩展列出的是当前项目目录下的 `.jsonl` 文件。文件被搬走或删除,会话就消失。检查 agent 的会话存储位置(通常 `~/.claude/projects/<encoded-cwd>/`)。

### 改了某些东西 webview 没刷新
右键 panel tab,选 `Reload Webview`。或者 `Developer: Reload Window` 整体重置。

### "Cannot resume: session not found on disk"
下拉里的 conversation ID 在磁盘上找不到对应文件。通常不会发生 —— 点 **Refresh** 重新扫描一下。

---

## 架构

扩展围绕一个小小的 backend 接口构建:

```typescript
interface AgentBackend {
  id: string;
  displayName: string;
  capabilities: { groupByProject; canPresetSessionId; supportsTmux; supportsInterrupt };

  isAvailable(): Promise<boolean>;
  listProjects(): Promise<Project[]>;
  listSessions(projectId: string): Promise<Session[]>;
  watchSession(sessionId: string, onEvent: (e: NormalizedEvent) => void): vscode.Disposable;
  sessionFilePath(projectId: string, sessionId: string): string;

  spawnNewSession(opts: SpawnOpts): Promise<{ sessionId: string }>;
  resumeSession(sessionId: string, useTmux: boolean): Promise<void>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  teardown(sessionId: string): Promise<void>;
}
```

UI 从不知道任何具体 agent 的协议。它只渲染 `NormalizedEvent`(`user` / `assistant` / `error`)并通过接口把用户输入投递出去。每个 backend 都是 `src/backends/` 下的独立模块。加新 agent 基本上是增量改动,不动 UI 层。

欢迎 PR。先开 issue 讨论你想加的 agent。

---

English:[USER_MANUAL_EN.md](USER_MANUAL_EN.md)  ·  README:[README_CN.md](README_CN.md) / [README.md](README.md)
