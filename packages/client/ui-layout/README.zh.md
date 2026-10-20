---
description: "Web GUI 的外壳布局：三栏 AppFrame（右栏作为贴边面板的轨道）、面板几何服务与主题呈现；供窗口外壳的使用者与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的三栏 AppFrame、左右栏宽度与 `ctx.layout` 呈现控制。右栏先让步以保护中栏空间，全屏由占用方呈现，框架保留宽屏底层轨道。主题呈现器负责配色、别名 token、字号、字体列表与 document 元数据；布局状态在刷新后重置。

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

桌面 Mod+B 通过与控件共用的布局操作切换左侧栏。模态弹窗打开时此快捷键不可用；终端输入优先。

本插件在 root slot 中组合五段式工作台：品牌区带、工作区页签带、工作台行、底部面板与状态栏。工作台行依次为 48px 活动栏、侧边栏、主内容和右栏；活动栏同时跨越页签带，因此从品牌区带之下延伸到三列底部。侧边栏宽度为 264～420px，默认为 280px，收起后保留 56px 控制栏；内容宽低于 1024px 时自动收起，打开右侧面板也会收起手动展开的侧边栏。右侧面板首次打开时使用视口宽度的 45%，之后保留用户的像素宽度偏好，上限为 70%。为给中栏保留 400px，框架先将右侧面板缩减至 300px，再报告空间不足，使占用方将其关闭，最后才进一步压缩中栏。拖动没有过渡延迟；右侧手柄在关闭或全屏时不显示。

全局面板占据 root 作用域的 `main` keyed slot；`conversation` 是为会话界面保留的 key。`ctx.layout.selectPanel(id)` 选中已注册面板，`null` 则选中会话界面，但不改变当前会话。出厂的全局面板（目前是定时任务）仍使用侧栏的面板列表；Plugins 页面已从该列表移到活动栏。

root 作用域的单一 `shell.header` slot 横跨所有其他区带上方的整行：它是框架的品牌区带，由 ui-sidebar 的 `FrameBrand` 占据，使产品标识与名称在任何活动下都常驻。在 Windows 桌面下字标改放在窗口顶栏自身那一行、与原生菜单同一行，因此本区带折叠为零高。占用方控制自身高度；空内容不预留空间。

root 作用域的单一 `shell.workspace.tabs` slot 是工作区活动页面的顶部：位于活动栏右侧、侧边栏上方，ui-workspace 的工作区页签条就在此处。框架仅在内置 `workspace` 活动被选中时渲染它，因此注册的活动会连同其下方的三列一起替换该页签带。

### 活动栏

活动栏是框架的第一列：root 作用域的单一 `shell.activitybar` 座，由本包自己的活动栏占据，并声明 `shell.activitybar.items`。每个列表项只绘制自己的字形；按钮、工具提示、可访问名与选中标记由外壳持有，标签从注册元数据解析。因此一个活动只需贡献一个字形和一个内容视图，二者用同一个 id 关联：

```ts ignore-check
ctx.slots.inject('shell.activitybar.items', () => ctx.slots.register({
  name: 'shell.activitybar.items', id: 'plugins', order: 200, label: () => t('plugins'),
}, PluginGlyph))

ctx.slots.inject('shell.activity', () => ctx.slots.register({
  name: 'shell.activity', key: 'plugins',
}, PluginActivity))
```

活动栏底部承载 root 作用域的单一 `shell.activitybar.settings` 座：ui-settings-general 的设置外壳以紧凑形态占据它，并把账户入口叠放在设置触发器之上，因此两者都位于活动栏底部而不是侧栏页脚。

内置的 `workspace` 入口是框架自己的组合——侧边栏、主内容与右栏——不是列表项，因此插件无法覆盖它。被选中活动的 `shell.activity` 视图占据活动栏右侧的整块区域，替代三列。选中未注册视图的入口会抛错并保留当前选中；被选中的入口注销后回落到 `workspace`。`ctx.layout.selectActivity(id)` 以编程方式做同样的选中——插件管理器用它从任意位置打开组合包详情——`ctx.layout.activityInfo` 发布当前 id，供需要感知「离开自己的活动」的界面使用。活动栏无论列表是否为空都预留 48px 轨道，`layoutInfo.viewportWidth`（也就是右栏占用方拿到的 `viewportWidth`）是该轨道右侧的宽度，而非窗口宽度。

出厂 Plugins 页面是第一个活动：入口绘制插件字形，`shell.activity` 视图就是管理页面，选中即用该页面替代工作台三列。

root 作用域的单一 `shell.bottom` slot 横跨工作台行下方、状态栏上方的整行。占用方控制自身高度与显隐；三列按该高度缩短，空内容不预留空间。切换主面板时保留底部组件。列宽拖拽手柄止于底部内容上方，`shell.overlay` 仍覆盖整个框架。默认组合不占用此 slot。

### 状态栏

状态栏是框架的最后一段：root 作用域的单一 `shell.statusbar` 座，由本包自己的状态栏占据。与 `shell.bottom` 不同，即使没有任何条目它也预留自身高度（22px），因为这条带本身就是 chrome。它声明两个列表 slot：`shell.statusbar.left` 与 `shell.statusbar.right`；前导组占用剩余宽度并先截断，尾部组永不收缩。

条目自行绘制内容，并通过注册的观测源保持最新：

```ts ignore-check
ctx.slots.inject('shell.statusbar.left', () => ctx.slots.register({
  name: 'shell.statusbar.left', id: 'build', order: 100, locale: 'myPlugin',
  inject: () => ({ hooks: { build: buildState } }),
}, BuildStatus))
```

当 `buildState` 发布新值时，绑定的 `useBuild` 会重渲染该条目，因此更新不需要调用状态栏；状态栏自身不持有任何条目状态。

<a id="window-chrome-seat"></a>
### 窗口 chrome 座

在 macOS 桌面（`html[data-platform='darwin']`，仅由桌面 preload 设置）下，收起的侧边栏整列隐藏而非保留控制栏，框架在左上角挂载 root 作用域的单一 `shell.leading` 座——位于 hiddenInset 红绿灯旁，覆盖所有主面板；ui-sidebar 以重新打开与 New Session 控件占据该座。座挂载期间框架发布 `--dsh-frame-leading-clearance`：窗口 chrome 占据的行内带宽，自框架左边缘起量；内容抵达左上角的主面板以它做内边距，避免落在红绿灯或控件之下。框架还始终在根元素上发布 `--dsh-frame-top-clearance`（48px）：窗口顶带之下的固定下沉量；主面板中的入口型页面（插件管理器等类似页面，非对话）以它做顶部内边距。框架自己不声明任何 darwin drag：每个 chrome 行给自身打上 `data-window-drag`，ui-web base.css 把该标记变成唯一那条 darwin drag 规则，于是行自己的盒子就是窗口的可拖几何——行的空白段可拖，控件保持可点。框架仅剩的那条 drag 规则属于 Windows 标题栏行。

Windows Electron 的 `data-windows-titlebar` 标记在所有列上方预留顶栏高度，并移除收起后的侧栏轨道。内容区仅左上角保留 16px 圆角，其余角和内部交界处保持直角。框架发布 `--dsh-windows-content-radius` 和 `--dsh-windows-sidebar-width`，供 ui-sidebar-right 的全屏圆角及侧栏避让使用。普通 Web 文档不会获得该标记；macOS 保留其独立布局。

根元素通过 `--dsh-frame-top-clearance` 发布顶栏占用量（macOS 为 48px，Windows 为标题栏高度），通过 `--dsh-frame-overlay-top` 为弹窗和菜单再留出 20px。原生全屏时浮层起点降为 20px；弹窗仍保留自身 24px 的最小边距。`--dsh-frame-chrome-top` 让模态遮罩不绘制 Windows 顶栏区域，全屏时归零。覆盖整个视口的模态层仍阻挡背景点击。普通浏览器文档不发布这些值。

### 主题呈现

呈现器消费解析后的主题快照，并投影到 document：`html { color-scheme }` 驱动原生 UA 控件，依据当前配色方案设置 `body[data-ds-dark-theme]`，把主题的别名 token、`--dsh-content-font-size`、`--dsh-code-font-size`、`--dsh-terminal-font-size` 以及每个非空的 `--dsh-font-family-<role>` 列表设为 body 上的内联变量，并持有一个 `<meta name="theme-color">`，其内容随计算后的 body 背景色更新。对呈现器执行 dispose（资源释放）时，它会连同其他全局写入一起移除自己的元数据节点。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`selectPanel(id)` 在改变选中态前检查实时 `main` 注册表；缺失的 key 会抛错并保留当前面板。`beginNavigation()` 为异步 UI 导航返回 abort signal。后续调用、有效面板选择（包括重复选择）或布局释放会中止该 signal，但不取消底层会话创建。消费方在提交导航或搬移草稿前检查 signal。

一次注册声明框架的子 slot，并绑定 `ctx.layout` 的 `selectPanel`、`selectActivity`、`toggleSidebar`、`openRightbar(track, fullscreen)` 与 `closeRightbar`。另两次注册占据框架自己的 chrome 座：活动栏声明 `shell.activitybar.items`，状态栏声明 `shell.statusbar.left` 与 `shell.statusbar.right`。三者共用同一个 root 存储，把 `panelInfo` 选中态、`activityInfo` 选中态与 `layoutInfo` 测量、宽度偏好、呈现报告分开。可见的活动栏列表由 `shell.activitybar.items` 账本投影成快照存储（id、order、解析后的标签），在注册与语言变化时刷新；被选中项离开账本时回落到 `workspace`。`ctx.layout.panelInfo` 与标准 `usePanelInfo` hook 共用同一个选中态来源；AppFrame 订阅引用稳定的布局对象。`rightbar` owner 提供实际 `width`、`viewportWidth`，以及表示能否以普通模式呈现的 `canShow`；占用方在空间不足时执行确定性的收起，变宽不自行重新展开。全屏隐藏宽度手柄，但不自行释放占用方要求保留的轨道。AppFrame 保持各列容器挂载。右栏的 root 控制器仅在选中会话界面时，经 `SessionProvider` 渲染 `rightbar.session`；内容卸载时的报告释放轨道。独立的标题组件仅在会话界面可见时使用所选会话标题，以构建配置的产品标题或本地化 `common.brand.localBuild` 为回退值；语言变化会更新该回退值。主题呈现器是第二个 effect：从解析后的快照做纯 DOM 写入——初始状态经 getter 读取一次，此后仅事件驱动，不经过 React。它先应用调色板、字号、字体列表与 token 变量，再把渲染出的背景测量为唯一的颜色依据。全屏呈现禁用网格和手柄过渡；占用方完全覆盖框架后才报告新的列布局。退出全屏时，框架先保持无过渡并安装目标布局：关闭移除右轨道，恢复保留右轨道。后续普通几何操作恢复正常过渡。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当布局面不够用时阅读以下页面。它们从框架进入它所渲染的栏与它所呈现的主题。

- [ui-sidebar](../ui-sidebar/README.zh.md)——占据 `sidebar` 栏及其座位。
- [ui-conversation](../ui-conversation/README.zh.md)——占据 `main` 中的 `conversation` key。
- [ui-sidebar-right](../ui-sidebar-right/README.zh.md)——以每会话一个停靠面占据 `rightbar` 栏。
- [ui-theme](../ui-theme/README.zh.md)——呈现器消费其解析快照的主题 seam。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册槽位。

-----

<a id="model-experience"></a>
## 模型体验

无。布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了当前布局行为。它们是当前包约束，不是通用窗口管理器对比或任务积压。

- **面板几何是瞬时状态**——重新加载会恢复侧栏默认值并隐藏右侧面板；拖动设置的宽度是整个框架共用的一份偏好，而非每个会话各自的属性。
- **选中活动同样是瞬时状态**——重新加载回到内置的 `workspace` 活动；状态栏条目自身不持有值，只渲染其注册观测源发布的内容。
- **极窄窗口**——右侧面板关闭后，中栏仍可能小于 400px；左侧 56px 控制栏仍会保留，48px 活动栏则从不退让。
- **活动栏是固定 48px 轨道**——即使没有任何注册条目也预留该宽度，插件无法加宽或隐藏它。
- **窗口 chrome 几何不随活动栏移动**——活动栏只占用工作台行，因此 macOS 的 `shell.leading` 座与 Windows 标题栏保持原有内缩，活动栏自顶部区带之下开始。
- **轨道与面板仅在动画期间沿同一条曲线运动**——离散开合时框架设置 `data-animating`，其轨道过渡和占用方的滑入读取同一组时长与缓动变量；占用方若自用一套，挤压时面板边缘就会与会话界面的边缘脱开。拖拽和即时呈现切换不带过渡，因此该曲线不覆盖它们。
- **挤压重排期间无滚动锚定**——布局变化可能移动读者的视口。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
