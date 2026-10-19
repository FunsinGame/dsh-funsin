# Agent Note: Workspace tabs and the current-Workspace session list

Status: implemented

[English](2026-10-16-workspace-tabs-and-current-workspace-list.md) | 中文

## Problem

侧栏的 `sidebar.workspaces` 区域承载了整个 Workspace 清单：每个已注册 Workspace 都表现为一个可折叠分组（或一个树节点、或一条混合平铺列表），各自带 Session 行、拖拽域、重命名与删除对话框，以及每分组五行的水位线。三种分组模式、路径嵌套、未分组桶和 Workspace 拖拽面，都是为了安排一份一旦安装环境有十几个 Workspace 就无法扫读的列表。Workspace 管理控件（添加、重命名、删除、重排）也分散在区头和每行菜单之间。

## Decision

Workspace 清单移到横跨窗口顶部的页签条，侧栏只列出一个 Workspace 的 Session。

**页签条是新的窗口行。** `ui-layout` 的 `AppFrame` 在三列之上新增 `shell.header` 单一 root 作用域席位（`grid-template-rows: auto minmax(0, 1fr) auto`；调整大小的把手改为跨越第 2 行）。与 `shell.bottom` 一样，空置席位不占高度，占用方自己控制高度与横向滚动。`ui-workspace` 在那里注册页签条，因此该包现在填充三个槽位（`shell.header`、`sidebar.workspaces`、`conversation.hero.workspace`），并把目录流子槽位从侧栏移到页签条之下：`shell.header.directoryFlow` 取代 `sidebar.workspaces.directoryFlow`，两个组合的选择器包也把各自的流程注册进去。

**页签条拥有注册表。** 每个已注册 Workspace 一个页签，按 Host 持久化顺序排列：左键点击把该 Workspace 设为当前，右键打开页签菜单（仅关闭），拖拽通过既有的 `insertBefore` Host 变更重排，最右侧的添加控件拉起与空状态相同的目录流程。关闭只删除注册记录——目录与全部会话日志保留，同一目录可以再次添加。

**当前 Workspace 是一条发布来源。** `UiWorkspaceService` 写入一个 `WorkspaceId | undefined` 快照存储：每次主视图选择时（记账该 Session 的 Workspace）、`selectWorkspace` 运行时，以及注册表丢失当前 Workspace 时（回退到第一个已注册项）。页签条与侧栏通过各自注入的 `currentWorkspace` hook 读取它，因此无论从搜索、会话行还是页签打开 Session，两个界面都停留在同一个 Workspace，无需各自派生。`selectWorkspace` 显示该 Workspace 最近一个未归档 Session，没有可打开的会话时连接一个空白 Session。

**侧栏是那个 Workspace 的平铺列表。** 分组模式、路径嵌套、展开状态、未分组桶、`ProjectRowItem`、Workspace 拖拽面和 Workspace 删除对话框都已删除；`SessionTree`／`deriveGroups`／`owningGroupKey`／`owningParentFolder`／`sessionMemberIds` 连同其测试一并删除。剩下的是一个列表：当前 Workspace 的 `sessionIds` 按最近更新或已保存的手动记账排序，置顶行在前，选中的空白行钉在最前，水位线及其注意力抬升与展开／收起保留，同一记账内的拖拽重排保留，行槽位与 action 列表原样保留。视图 store 去掉 `groupBy`／`groupExpansion`，持久化名称升级为 `dsh.workspace.view.v6`；`pinOrderSource` 现在只对账 Workspace 记账。重命名移到侧栏区头自己的菜单，以免随分组行一起消失。搜索有意保持覆盖整个注册表：它是触达「页签已关闭的 Workspace」中 Session 的唯一入口，且每条结果都标注所属 Workspace。

## Alternatives considered

- **保留侧栏清单，把页签做成它的第二个视图。** 两个界面列同一批 Workspace，就需要同一套选择、排序与关闭语义，而这些控件已经在侧栏分组头上。最终用页签条取代清单，让每条 Workspace 事实只有一个归宿。
- **把页签做成「已打开的 Workspace」集合，像编辑器标签页。** 那样关闭页签只会隐藏仍处于注册状态的 Workspace，需要客户端持久化打开集合、需要一个没人渲染的清单用于重新打开，还需要区分「已注册」与「已打开」——而 Host 没有任何界面表达后者。这里的页签就是注册表，所以关闭即删除注册记录，也就是 Host 已经拥有的操作。
- **在每个界面里各自从主 Session 派生当前 Workspace。** 页签条与侧栏将各自重复实现「尚无 Session」与「注册表丢失它」的兜底，且乐观的页签点击还需要第二份真值。由导航服务持有一条发布存储，可以让两者不产生分歧。
- **为单个 Workspace 保留分组模式**（分组、树、平铺），只过滤 Workspace 列表。那样每种模式都只渲染一个分组，路径嵌套与未分组桶无法触达，store 还会持久化无从切换的展开状态。
- **把搜索也收窄到当前 Workspace。** 这会令已关闭页签的 Session 彻底不可达，因为侧栏不再列出可用于重新打开的 Workspace。

## Consequences

- 不属于任何 Workspace 的 Session 没有列表界面。这是「仅显示当前 Workspace」的代价：关闭页签会把它的 Session 从侧栏隐藏，只能通过搜索触达。包 README 已把这一点记为已知限制。
- 窗口现在有三个区带（页头、三列、底部）。任何假设三列是网格首行的实现——调整大小的把手、Windows 标题栏的圆角——都随更新后的网格一起调整。
- 三种分组模式及其持久化展开状态没有后继；保存的 v5 数据因新的 store 名称而不会被读取。
- 每个注册独立的目录流占用判断随迁移保留；添加命令的可用性现在读取页签条的槽位。
