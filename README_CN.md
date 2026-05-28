# Claude Frame

为命令行 AI 编程 agent 打造的精致 VS Code 聊天面板。

![Claude Frame 在 VS Code 里的聊天面板](images/screenshots/claude-frame-demo-001.jpg)

## ✨ 你会喜欢它的几个理由

- **♥ 跳动的心**。Agent 活跃的时候,会话标题旁边一颗小小的心会跳动;只是浏览历史时,它静止不动。一眼就知道这个会话是不是"活着的"。
- **🎨 每个会话独立颜色和标题**。原生取色器选任意颜色,会话起任意名字,两者都跨重启持久化。即使有三个并排的会话,远远一看也分得清谁是谁。
- **📋 干净复制,粘哪都能用**。每个 bubble 一个 Copy 按钮,每个代码块还有自己的 Copy。出来的是干净 Markdown,**不是带换行 artifacts、零宽空格、行尾余白的终端 scrollback**。代码块里的命令复制完直接粘到 shell 就能跑。多条一起拿用 **Copy Selected**。
- **🪟 多 tab 并发**。`Cmd+Alt+C` 每按一次就开一个新面板。多个 agent 会话可以在编辑器 tab 里并排跑,各有各的视觉标识。
- **🔁 一键 Resume,跨 VS Code 重启**。开了 tmux 后,关掉 VS Code,agent 依然在后台运行。重新打开扩展点 Resume,直接接上 —— 说不定离开期间 agent 已经把活儿干完了。
- **🧘 Zen 模式**。一键隐藏顶部所有 chrome。心脏和标题会滑到 badge 行的右侧,对话区接管整个屏幕。一切干扰都消失。
- **⌨️ 不打扰你**。`Cmd+Alt+C` (macOS) / `Ctrl+Alt+C` (Linux & Windows) 在 VS Code 的任何地方都能呼出聊天面板。不用碰鼠标。

<!-- TODO: 几个不同 accent 色的面板并排截图 -->

## 🚀 快速开始

1. **安装你的 AI agent CLI**。当前支持:[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)(Anthropic 官方 CLI)。
2. **(强烈建议)安装 tmux**。macOS:`brew install tmux`,Debian/Ubuntu:`apt install tmux`。原因见下面[为什么 tmux 让一切更好](#-为什么-tmux-让一切更好)。
3. **安装 Claude Frame** —— 从 VS Code Marketplace 装,或者从 [Releases](../../releases) 下载最新 `.vsix`。
4. 按 `Cmd+Alt+C` (macOS) 或 `Ctrl+Alt+C` (Linux/Windows)。选项目,点 **New Chat** 开新对话,或者选已有会话点 **Resume**。

详细步骤参见 [USER_MANUAL_CN.md](USER_MANUAL_CN.md)。

## 🛠 为什么 tmux 让一切更好

机器上装了 `tmux`,**Use tmux** 复选框默认就是勾上的 —— 而你应该让它保持勾上。原因如下。

开启 tmux 时,扩展会在以会话 ID 命名的 detached tmux session 里**长期保留一个 agent 进程**。每次用户输入只是把新消息扔给这个还活着的进程:

- **更省钱**。之前的对话内容一直留在模型的 prompt cache 里,后续每一轮只按新 token 计费 —— **大约只是正常 input token 成本的 10%**。Cache key 只在 agent CLI 升级、或者 cache TTL 过期(API key 是 5 分钟,订阅是 1 小时)时翻新;长期运行的进程把 cache 一直保持在温热状态。
- **更快**。没有每轮的启动开销。Agent 二进制已经加载好了,工具、MCP server、项目上下文都初始化过了。
- **关掉 VS Code 也不丢会话**。Tmux session 是 detached 的,关 VS Code(或者 SSH 断开)不会杀掉 agent。重新打开扩展,选同一个会话,直接接上 —— 说不定离开期间 agent 已经做完了。

关闭 tmux 时,每次输入都会启动一个全新的 non-interactive agent 进程(一次性模式)。能用,但每轮都要付冷启动代价:进程启动、会话读盘、完整上下文重发(虽然有 prompt cache 兜底但不是免费)、~1-2 秒的启动延迟。Agent 在轮次之间退出,所以关 VS Code 会终止会话。

只在真正只想"一次性看看会话内容、不想留后台进程"的场景下用关 tmux 模式 —— 比如快速只读浏览,或者你不希望机器上有长期运行 agent 的场合。

Windows 用户目前需要 [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) 才能用 tmux。

## ⚙️ 配置

无需配置。扩展自动适配 VS Code 的主题和字体。

要换快捷键:`Preferences → Keyboard Shortcuts → 搜索 "Claude Frame: Open"`。

## 🧩 支持的 agent

当前:
- **[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)** —— Anthropic 官方 CLI。

Backend 系统是可插拔的。每个 backend 都是 `src/backends/` 下的独立模块,实现一个小小的 `AgentBackend` 接口(项目和会话列表、基于文件的事件流、spawn / resume / send / interrupt / teardown)。加新 agent 基本上是增量改动,不影响 UI 层。欢迎 PR。

## 许可证

[MIT](LICENSE)。

---

English:[README.md](README.md)  ·  详细用户手册:[USER_MANUAL_CN.md](USER_MANUAL_CN.md) / [USER_MANUAL_EN.md](USER_MANUAL_EN.md)
