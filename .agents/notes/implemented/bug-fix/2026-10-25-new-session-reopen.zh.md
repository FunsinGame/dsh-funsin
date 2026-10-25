# Agent Note: 新建会话重新打开 Workspace 的空白会话

Status: implemented

[English](2026-10-25-new-session-reopen.md) | 中文

## Problem

过去每次点击新建会话都会创建一个新的 Host Session，而列表只显示当前选中的空白会话。打开其他对话后该空白会话会从列表消失，再次点击新建会话又创建另一个空白会话，于是尚未发送的草稿留在列表已不再显示的 Session 上。一个 Workspace 会积累隐藏的空白会话，而只要选中了其他 Session，它的新建会话行就会消失。

## Decision

每个 Workspace 只有一个新会话：选中空白会话时就是它，否则是最新的空白成员。Workspace 浏览器在选中其他 Session 时仍显示该行，把它排在置顶行和普通行之前，并隐藏历史遗留的重复空白会话。不带选项的 `uiWorkspace.startSession` 通过已有的复用路径打开该空白会话，而不是创建新的 Session；Workspace 没有空白会话时仍会创建。被复用的空白会话保留由客户端持久化的输入框草稿。它的首个 `turn/start` 之后，Host 将其标记为非空白，生成的标题替换“新会话”标签，下一次新建会话会创建下一个空白会话。

复用会在 `session.create` 中指明该空白会话，并使用当前默认 preset。当请求的 preset 定义代次与运行中的不同时，即使 id 相同，Host 也会重新组装；因此重新打开新会话界面不会保留已被替换的组成。这保留了[被复用的空白会话运行请求的 preset](2026-09-29-reused-blank-runs-requested-preset.zh.md) 不再解析过期草稿所记录 preset 的理由，只反转该注记中“普通新建会话创建新 Session”的规则。

## Alternatives considered

**继续创建新 Session 并转移草稿。** 每次点击都会留下两个持久空白会话，需要破坏性清理或隐藏孤儿策略，并改变用户正在编辑的 Session 标识。

**显示所有空白行。** 历史数据可能保留多个旧版本产生的空白会话；多行“新会话”会违反每个 Workspace 只有一个新会话的保证。

**保留空白会话暂存的 preset，而不是使用当前默认值。** 这样新建会话会在默认值变更后继续使用旧默认值，而之前的复用决策已经否定了这一点。

## Consequences

新建会话不再通过产生新的 Session id 来重置对话，而是在当前默认 preset 下重置同一个空白会话。期待 id 变化的用户或集成无法再据此判断该操作被按下。历史遗留的重复空白会话仍隐藏且不删除，因此其草稿不可达，但持久化数据仍然保留。Host 对每次活动空白会话复用都会调用 preset 注册表的 `select`；同一代次的选择不会产生改动，被替换的定义会在首轮对话前重新组装。

## Testing

`ui-workspace` 测试覆盖唯一行投影、选中空白会话优先、置顶位置与复用。实际 Web 组合测试输入草稿、切换到另一个 Session，并确认新会话行仍存在、创建响应指明同一 Session、草稿恢复。`session-presets` 覆盖同一 id 下定义变化后重新组装空白会话。
