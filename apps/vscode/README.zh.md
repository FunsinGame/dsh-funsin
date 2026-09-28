# dsh-vscode

[English](README.md) | 中文

DeepSeek Harness VS Code 扩展：它在回环端口上启动 harness 的 `web` profile，绑定当前打开的工作区，并把完整的 DeepSeek Harness GUI 嵌入活动栏视图。由于 harness 以该工作区为工作目录启动，GUI 的会话列表显示的正是当前工作区的对话；点击一个会话即打开它的对话。界面就是 DeepSeek Harness web GUI 本身，因此与 `dsh --profile web` 完全一致——包含全部功能与交互。

## How it works

1. 激活时扩展注册一个活动栏 **DeepSeek Harness** 视图，以及若干命令（`Open`、`Open in Browser`、`Restart`、`Stop`，以及用于编辑器选区和文件标签页的 `发送到 DSH`）。它还会注册一个显示 harness 状态的状态栏按钮；`dsh.showStatusBar` 可打开该按钮。
2. 打开该视图时按以下顺序解析 `dsh` CLI：`dsh.cliPath` 设置、`DSH_CLI` 环境变量、源码检出中构建出的 `apps/cli/lib/bin.js`，最后是 `PATH` 上的 `dsh`。
3. 它以第一个工作区文件夹为工作目录启动 `dsh --profile web --host 127.0.0.1 --port <dsh.port> --no-open`（端口 `0` 请求由操作系统分配，`--no-open` 让默认浏览器保持关闭），然后等待 `dsh web: http://127.0.0.1:<port>/?token=...` 就绪行。
4. 视图在一个全尺寸 iframe 中渲染该 URL。`Open in Browser` 把同一 URL 交给 `vscode.env.openExternal`。在嵌入模式（`DSH_VSCODE=1`）下，harness 把启动 token 保留在 iframe URL 中，并在 `/api` 调用和 WebSocket mux 上接受它，因此侧边栏不依赖跨站 cookie。
5. 扩展还启动一个受 token 保护的回路桥，并把 `DSH_VSCODE=1`、`DSH_VSCODE_BRIDGE`、`DSH_VSCODE_BRIDGE_TOKEN` 传给子进程。检测到嵌入模式的 harness 插件可以调用该桥上的 `POST /open-file` 和 `POST /open-diff`，在当前 VS Code 窗口中打开文件或差异，而不是另起一个 `code` 进程。
6. 点击对话中的文件会在本窗口中打开它：嵌入的单列布局不挂载右侧栏，因此页面通过 webview frame 发送一条 `open-file` 消息，扩展用 `vscode.window.showTextDocument` 显示该路径（相对路径先基于已打开的工作区文件夹解析），然后把结果答复给页面。磁盘上没有文件的文档走同一条通道，消息类型为 `open-document`：扩展注册 `dsh-doc:` 内容提供方，按请求标题推导出的标签名保存页面送来的正文，并以只读编辑器文档展示，因此已提交的计划会打开在原本属于右侧栏的位置。标签页沿用页面给出的语言 id，计划因此以 Markdown 高亮显示。

## Send to DeepSeek Harness

- 在文件编辑器中右键一段文本选择，或右键一个文件标签页，选择 **发送到 DSH**，即可把该文件作为原子引用块加入输入框。它不会替换任何内容：引用块落在输入框光标处，随时可以搭配一条消息。
- 引用块以文件名加选区范围作为标签——`余烬狩猎.md:53-63`，单行选择为 `余烬狩猎.md:53`，整个文件标签页则只有文件名。点击引用块会在本窗口中打开该文件；带范围的引用块会落到该范围的首行。
- 引用的模型形式是文件的绝对路径，若来自选区则再附加 `:line` 或 `:start-end`（1 起算，含两端），例如 `c:\g-workspace\Heyang-Projects\All-Wiki\余烬狩猎.md:53-63`。
- DSH 视图中必须先打开一个会话，因为引用会落到该会话的输入框；只显示会话列表时没有输入框，命令会明确提示这一点。执行发送命令时扩展会自动打开或等待侧边栏。

## Requirements

- Node.js `^22.19 || >=24`（harness 的引擎要求），并且 `dsh` 可用，或者使用通过 `pnpm run build` 构建的本仓库检出。
- 已配置的模型提供方。GUI 在没有提供方时也能启动并显示引导；Agent 需要 `DEEPSEEK_API_KEY` 或 harness 中等价的配置。

## Development

```sh
pnpm install
pnpm --filter dsh-vscode run build   # tsc -> dist/extension.js
```

要在扩展开发宿主中运行该扩展，打开 `apps/vscode` 文件夹，并添加一个 `.vscode/launch.json`，其中 `extensionHost` 配置的 `args` 为 `["--extensionDevelopmentPath=${workspaceFolder}"]`，`preLaunchTask` 运行 `build` 脚本。也可以打包后再安装（见下文）。

## Packaging

在 `apps/vscode` 下执行：

```sh
npx --yes @vscode/vsce package --no-dependencies
```

该命令会运行 `vscode:prepublish` 构建（`tsc`）并生成 `dsh-vscode-<version>.vsix`；用 VS Code 的 `Extensions: Install from VSIX...` 命令安装。打包后的扩展不内置 `dsh` CLI，因此目标机器需要 `PATH` 上有 `dsh`，或者必须把 `dsh.cliPath` 指向构建出的 `apps/cli/lib/bin.js`（或已安装的 `@deepseek-ai/dsh` 的 `lib/bin.js`）。

## Troubleshooting

如果侧边栏视图显示完整的浏览器布局而不是嵌入的单列布局，说明该扩展使用的 `dsh` CLI 的 web 前端尚不支持 `?embed=1`。修复步骤如下：

1. 使用活动栏的 **DeepSeek Harness** 视图（或 `DeepSeek Harness: Open`），而不是 `DeepSeek Harness: Open in Browser`。
2. 把 `dsh.cliPath` 设置为本检出中已构建的 CLI，例如：
   ```json
   "dsh.cliPath": "C:\\g-workspace\\deepseek-harness-vscode\\apps\\cli\\lib\\bin.js"
   ```
3. 确认当前的 web 前端已构建（在仓库根目录运行 `pnpm run build:web`）。
4. 运行 `DeepSeek Harness: Restart` 或重新加载 VS Code 窗口。

## Settings

| 键 | 默认值 | 含义 |
|---|---|---|
| `dsh.cliPath` | `""` | `dsh` CLI 入口（`lib/bin.js`）的绝对路径。留空则从 `PATH` 解析 `dsh`。 |
| `dsh.host` | `127.0.0.1` | 回环绑定主机（只提供回环地址）。 |
| `dsh.port` | `0` | 监听端口；`0` 请求由操作系统分配。 |
| `dsh.showStatusBar` | `false` | 是否显示状态栏按钮；该按钮显示 harness 状态，点击时打开视图。 |
