---
kind: upgrade-guide
description: "新建会话会重新打开 Workspace 已有的空白会话，而不是创建新的 Agent。"
---

# 重新打开已有的新会话

[English](guide.md) | 中文

## 变更

在 Web 和 Desktop 中，**新建会话**会打开 Workspace 已有的空白会话，保留其中尚未发送的输入草稿，以及它在会话列表顶部的位置。Workspace 没有空白会话时仍会创建一个。该操作不再在每次点击时创建新的 Agent，且打开其他会话时空白会话行仍保留在列表中。空白会话产生第一轮对话后成为普通的具名会话，下一次**新建会话**会创建新的空白会话。

Host 在重新打开空白会话时仍会应用当前的默认 Agent 预设定义。若运行中的 Agent 所用预设的定义代次已变化，Host 会重新组装该预设并记录 `agent-preset/selected`，因此切换 bundle 后新会话界面使用最新组合。不带选项的 `uiWorkspace.startSession(workspaceId)` 采用相同行为；带草稿准备选项的调用保持不变。Workspace 重连仍复用符合条件的空白会话。

## 迁移

1. 集成需要新的 Agent 时，请通过 Session Controller 在不带 `sessionId` 的情况下创建。只需要该 Workspace 的新会话时，请改用 `openWorkspace` 或 `connectWorkspace`，并向返回的 Session 发送第一条提示词使其成为普通会话。
2. 不要再用 Session id 是否变化来判断**新建会话**是否被按下；改为比较执行状态或提示词历史。
3. 确认重新打开空白会话会恢复其未发送草稿，每个 Workspace 只显示一行新会话，并在变更预设定义后通过下一次**新建会话**使用新定义。
