# Agent Note：活动栏与状态栏

Status: implemented

[English](2026-10-19-activity-bar-and-status-bar.md) | 中文

## 问题

框架此前只有一个导航面——侧边栏的全局面板图标列表——既没有顶层功能切换器，也没有让插件把长期可见的数值留在屏幕上的位置。产品正在转向的工作台形态（以 VSCode 为参照）需要在侧边栏左侧提供一条功能入口栏，并在窗口底边提供一条状态带，而且两者都必须可叠加：插件新增一个入口或一个数值，而不是替换外壳。

## 决策

**框架为五行四列。** `ui-layout` 的 `AppFrame` 网格变为行 `品牌区带 | 工作区页签带 | workbench | shell.bottom | statusbar`、列 `activityrail(48px) | sidebar | center | rightbar`，每个区域都显式定位，不再依赖隐式流式布局。品牌区带横跨整个宽度、位于所有活动之外；工作区页签带占据活动栏右侧的条带，且仅在工作区活动被选中时存在；活动栏同时跨越页签带与 workbench 两行，因此从品牌区带之下一直延伸到三列底部。活动栏与状态栏是框架自己的占用方，按插件的方式注册：`shell.activitybar`（single）承载 `ActivityBar`，后者声明 `shell.activitybar.items`（list）与底部的 `shell.activitybar.settings` 座；`shell.statusbar`（single）承载 `StatusBar`，后者声明 `shell.statusbar.left` 与 `shell.statusbar.right`（list）。两者都是 `ui-layout` 的注册，共用框架唯一那个 store 实例。

**一个活动 = 一个字形 + 一个视图，共用一个 id。** 列表项只绘制字形，接收 `{ size, active }`；按钮、工具提示、可访问名（`aria-current="page"`）与选中标记由外壳持有，标签来自注册项的 `label`。其内容是同一 id 下的 `shell.activity` keyed 单元，当被选中的活动不是内置 `workspace` 时，它渲染在横跨三列的单一区域内。`workspace` 为保留值：框架为它渲染自己的三列组合，因此默认活动在任何组合中都存在，且没有入口能覆盖它。选中没有 `shell.activity` 视图的入口会抛错并保留当前选中（与 `selectPanel` 同一策略）；被选中的入口注销后，经投影活动栏元数据的同一条订阅回落到 `workspace`。`ctx.layout.selectActivity(id)` 与 `ctx.layout.activityInfo` 是该选中的编程接口：出厂的插件页面是第一个活动，因此 `pluginNavigation.openBundle` 可从任意位置选中它，页面在发布的 id 离开自己时重置视图。

**状态值是插件自有的观测源。** 状态栏不持有条目状态：每个条目自行绘制内容，并通过注册的 `hooks` 隔间获得实时数据，插件向自己的源发布即完成更新。前导组占用剩余宽度并先截断；尾部组永不收缩。

**活动栏顺序归用户所有并持久保留。** 每个活动栏入口（包括内置的 `workspace` 入口）都可拖拽；放下后它会移到另一个入口之前或之后。外壳把结果的完整 id 顺序存入 `localStorage` 的 `dsh.layout.activitybar.v1`，并在投影活动栏时与实时条目表合并：已保存的 id 保持相对顺序，新注册的条目按注册顺序追加，已离开条目表的 id 被忽略。布局 store 的其余字段仍是瞬时状态。

**`viewportWidth` 度量内容而非窗口。** 框架测量自身盒子并存入 `width - 48`，因此列求解、侧边栏断点、右栏占用方共享值与拖拽手柄偏移都度量活动栏右侧的空间。Windows 全屏面板变量随同一偏移改变（`rail + sidebar`）。

## 备选方案

- **把状态栏塞进 `shell.bottom`。** 该 slot 已被可选的 inspector 面板占用，且文档规定空内容不预留空间；共用会让两个占用方在同一 `single` 优先级上互相遮蔽，并改变 inspector 的生命周期约定。独立一行让两者各自为真。
- **在框架内嵌套工作台网格。** 把三列抽成内层网格，会为一个新列重写拖拽手柄、标题栏圆角与全屏几何规则。把活动内容区放在现有网格的 `grid-column: 2 / -1`，通过把列轨道归零达到同样结果。
- **共享可变的状态注册表（`ctx.layout.setStatusItem(...)`）。** 它会在插件自身状态旁制造第二个事实源，并迫使状态栏去 diff 写入。条目自有的观测源本来就只重渲染发生变化的那个条目。
- **把内置工作区做成普通活动栏条目。** 框架需要该条目的 id 才能派发自己的组合，于是 id 变成隐式的跨包约定；在框架内渲染内置条目让 `workspace` 在结构上保持保留。
- **持久化整个布局 store。** 该 store 还承载面板几何与选中活动，它们的瞬时约定早于本特性；持久化整个值会把每次测量都变成持久偏好。这里只保存活动栏顺序。

## 后果

- 框架有四段；任何断言框架几何的地方（`layout-bottom` 浏览器场景、框架 spec 的轨道解析）都跟随新的行与活动栏前缀。
- 活动栏是永不退让的固定 48px 轨道；被选中的活动与布局 store 的其余字段一样是瞬时的：重新加载回到 `workspace`。活动栏顺序是唯一持久保留的布局偏好。
- macOS `shell.leading` 与 Windows 标题栏保持原有内缩，因为活动栏只占用工作台行；活动栏自顶部区带之下开始。
- `ui-layout` 现在为活动栏字形与工具提示依赖 `ui-primitives`；该包仍是叶子（不导入其他特性包的值）。
- 验证：活动栏与状态栏 spec 驱动真实 store 与桩字形，apply spec 覆盖选中校验、重启后的顺序持久化与回落，`layout-bottom.e2e.ts` 记录两条新带的几何。
