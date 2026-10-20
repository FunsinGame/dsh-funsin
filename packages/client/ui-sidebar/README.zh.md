---
description: "dsh Web 客户端的侧边栏外壳插件：品牌行、New Session 操作、折叠控件、可感知滚动的区域席位与底部固定的 Settings 席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

桌面端产品事件使用可选的[产品埋点服务](../product-analytics/README.zh.md)，不包含普通 Web 交互。

## 概述

dsh Web 客户端的侧边栏让用户识别当前构建、启动新会话、将导航折叠为 56px 轨道、浏览 Workspace 与 Session，以及打开 Settings。它会将 Settings 入口固定在底部，并在隐藏空闲滚动条时避免浏览器行发生位移。New Session 优先使用显式选择的 Workspace，其次使用当前 Session 所属的 Workspace，再其次使用最近活跃的 Workspace；如果都不存在，则打开空白的 New Session 页面。部署可以替换品牌标记或名称，同时保留导航控件和轨道几何。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

侧边栏是导航外壳：用户启动新会话、折叠轨道并打开全局面板。功能插件填充它的席位——ui-workspace 填充 `sidebar.workspaces`，ui-settings 在 `sidebar.settings` 注册触发行与设置面板。

### New Session 与框架品牌

字标不属于本列：本包把 `FrameBrand` 注册进框架的 `shell.header` 区带，由它把 `shell.header.brand.mark` 与 `shell.header.brand.name` 渲染为两个独立的 single slot，并在任何活动下常驻。品牌是纯展示元素，不触发操作；在 Windows 桌面端它固定覆盖在窗口顶栏那一行、与原生菜单同排（见下文）。没有占位者时，外壳使用睡觉的小鲸鱼标记与 `deepsleep` 字标。完整构建会在字标旁显示代码徽标；该徽标使用 `DSH_CLIENT_VERSION`、可选的 7 位 `DSH_CLIENT_COMMIT_HASH` 与 `DSH_CLIENT_GIT_DIRTY=true` 组装成 `version[-commit][-dirty]`；缺少版本元数据时不显示徽标。New Session 优先使用作用域操作明确指定的 Workspace，否则使用当前 Session 所属 Workspace，再否则使用最近活跃 Workspace；一个 Workspace 都没有时则清空选择，进入空白 New Session 页面。 展开态的新建会话按钮在悬停或键盘聚焦时于右侧以灰色文字显示当前有效绑定。快捷键可见且空间较窄时，居中的图标与文字在快捷键之前渐隐；CSS 为快捷键保留宽度，无需测量按钮。纯图标控件保留使用平台键位样式的 tooltip，侧栏隐藏时常驻的 macOS 头部控件也保持一致。所有控件均提供 `aria-keyshortcuts`。

### 全局面板入口

插件在 root 作用域的 `sidebar.panellist` list 中注册图标组件，提供 `id`、可选 `order`，以及字符串或 locale-aware 的 `label`。同一个 id 寻址布局中 root 作用域 `main` keyed slot 的组件；选择不存在的主面板条目会抛错，并保留当前选中态。标签提供普通可见文字、无障碍名称和折叠提示。每一行通过 `usePanelInfo` 读取自己的选中态；DOM 焦点移到搜索框或目录选择器时，显示的面板及其列表项选中态不变。没有注册项时，列表及其间距均不渲染。产品随附的组合不注册示例面板。

### 折叠行为

侧栏及会话头部的开关从命令目录读取当前有效快捷键，用于悬停、键盘聚焦提示和 `aria-keyshortcuts`。未绑定的命令只显示操作名称。

侧栏收起时，顶部展开按钮承载可选、不可交互的 `sidebar.toggle.badge` slot。占用方提供状态和提示内容，不增加操作，也不改变按钮的导航行为。

实时收起时，展开内容在当前宽度淡出，上方控件共用同一段透明度渐变，并向左平移进入 56px 轨道，由布局的栏滑动结束整段动画。页面初始即为收起状态时会静态渲染轨道；减少动态效果模式会禁用两段过渡。固定在底部的 `sidebar.settings` 控件共用相同的透明度渐变时序，但不发生横向位移。

在 Windows Electron 中，`html[data-windows-titlebar]` 把字标放回窗口顶栏自身那一行、位于 Desktop 菜单左侧：FrameBrand 以固定定位覆盖顶栏（框架品牌区带在此时折叠为零高），并发布 `--dsh-windows-brand-end`，顶栏控件与原生菜单从该位置开始。侧栏顶部行只保留开关。侧栏开关在展开态隐藏，仅在收起态以“展开”控件的形式回到顶栏，新建会话紧随其后、排在菜单之前。此时品牌是拖拽面而不是新建会话快捷入口，新建会话由专用按钮负责。由于字标宽度取决于语言、品牌占位者与构建徽标，FrameBrand 会测量自身并在根元素上发布 `--dsh-windows-brand-end`、`--dsh-windows-caption-controls-start` 与 `--dsh-windows-menu-start`（品牌左边缘加上 `--dsh-windows-caption-controls-width`），因此替换工作区三列的活动也保持顶栏预留。侧栏只声明该控件宽度（展开态 0px、收起态 72px），并在卸载时释放。Desktop preload 用后者定位菜单，默认值为 48px。顶栏图标按钮采用紧凑控件圆角的 28px 控件，图标为居中 16px，并从窗口拖拽区域中排除。展开控件与新建会话的悬停提示在顶栏下方展开，Desktop 菜单文字不会盖住它们；占用 `sidebar.toggle.badge` 的控件自行决定气泡展开方向。从展开态收起使用键盘命令（`sidebar.left.toggle`）；`sidebar.toggle.badge` 槽位只在收起态的顶栏控件内渲染。

### macOS 桌面

在 `html[data-platform='darwin']`（仅由桌面 preload 设置）下，展开的侧边栏列顶部有一条 52px 的顶部条：避开 hiddenInset 红绿灯并承载收起按钮；顶部条与其下的 logo 行各自打上 `data-window-drag`，于是每行自己的盒子就是窗口的拖拽区（唯一的 darwin drag 规则由 ui-web base.css 声明），因此品牌 wordmark 在 macOS 上不再是 New Session 快捷入口——专用的 New Session 按钮保留该操作；收起时整列隐藏而非保留轨道。本包向框架的 `shell.leading` 窗口 chrome 座（ui-layout）注册 `HeaderLeadingControls`——打开侧边栏与 New Session 两个控件，由框架仅在列隐藏时挂载于红绿灯旁，覆盖所有主面板。[Desktop 参考](../../../apps/desktop/README.zh.md)负责窗口集成。

### 滚动条

栏内的滚动条是一种指针可供性：只要指针不在栏内，外壳就把滚动条间接层重新绑定为 `transparent`；指针离开后滑块再保留 2 秒，因此没人指向的列表不会带着滚动条。避免行位移的空间预留属于滚动区域本身（ui-workspace），所以显示滑块不会引起重排。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

外壳是纯组合：`SidebarRootComponentProps` 组合布局 owner share、全局 `useSessions` 与 `useWorkspaces` 钩子、已声明的品牌、`sidebar.workspaces` 与 `sidebar.settings` 子 slot，以及注入的导航回调。面板入口及其可选标题使用相同的组合方式。面板元数据由列表注册和 locale 变化派生；选中态属于布局存储。

### slot 纪律

声明感知的 `slots.inject()` 让替换包无论先于还是后于侧边栏激活都能生效。页脚承载 `sidebar.settings` 席位：侧边栏只渲染固定在底部的布局 slot，并共享其栏状态（`wide`）。`/client` 导出接口只包含插件主体（`apply`/`inject`）及约定类型；SidebarRoot、行组件与树派生仍由 slot 注册封装在包内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖填充外壳席位的各个界面与组合模型。

- [ui-workspace](../ui-workspace/README.zh.md)——渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器。
- [ui-settings](../ui-settings/README.zh.md)——在 `sidebar.settings` 注册触发行与设置面板的设置领域底座。
- [ui-layout](../ui-layout/README.zh.md)——折叠所使用轨道与栏状态的布局 owner。
- [ui-theme](../ui-theme/README.zh.md)——外壳所重新绑定的滚动条 token 间接层。
- [slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——席位背后的组合模型。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制定义外壳拥有什么、其占位方拥有什么；它们是当前包约束。

- **Session 状态点渲染由 ui-workspace 持有**：本外壳没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 ui-workspace，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
