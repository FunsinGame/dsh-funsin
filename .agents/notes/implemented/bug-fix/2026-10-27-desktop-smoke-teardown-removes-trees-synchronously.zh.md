# Agent Note: 桌面冒烟测试同步删除临时目录树

Status: implemented

[English](2026-10-27-desktop-smoke-teardown-removes-trees-synchronously.md) | 中文

## Problem

`package:win:x64:unsigned` 在运行时冒烟之后停住：`prepare:dsh` 报告每个阶段都成功，但进程始终不退出，因此打包步骤一直没有进展，放多久都一样。`electron-builder` 之后的「打包后冒烟」也是同样的结局。

冒烟用的主目录里放着 Host 通过内置 pnpm 安装的插件，pnpm 会在 profile 的 `node_modules` 下建一个目录链接。在 Windows 11 上用独立 Node 24 进程对该目录树执行删除可以稳定复现停滞：异步 `fs.rm` 删掉了其余所有条目，随后就停在这个链接上，既不完成也不报错，超过 60 秒仍然如此。同一棵树上 `readdir` 依然正常，说明不是线程池被占满；而同步 `rmSync` 用约 60 毫秒就删掉了剩下的部分。

## Decision

构建期的删除改为通过 `apps/desktop/scripts/remove-tree.ts` 里的 `removeTree` 同步完成，运行时冒烟与 prepared-runtime 冒烟都改用它。`prepare-dsh.ts` 原本就用 `rmSync` 删自己的构建根目录，这正是只有两个冒烟步骤会卡住的原因。

同步调用会在删除这一棵临时目录期间阻塞脚本的事件循环；它不会跟随目录链接，因此删除某个 home 不会连带删掉链接指向的 store。

## Alternatives considered

**给异步删除加超时后放行。** 挂起的 Promise 仍然活着，进程照样不退出：2026-10-25 与 2026-10-27 的构建之所以能结束，靠的是入口脚本在收尾后强制 `process.exit(0)`。

**重试异步删除。** 该 Promise 既不完成也不拒绝，重试路径根本不会被执行。

**只先删链接，其余继续异步删除。** 这是在猜触发条目，同类目录树依旧依赖删除顺序。

## Consequences

冒烟停滞不再能把打包流水线挂死，构建步骤也不再需要强制退出进程。删除是同步的，对构建脚本可以接受，也与 `prepare-dsh.ts` 现有的清理方式一致。

该异步行为没有对照上游报告确认；这里观测到的触发条件是待删目录树内部由包管理器创建的目录链接。如果将来某个 Node 版本不再出现这种停滞，可以改回异步删除，届时的冒烟收尾测试会判定该改动是否保持行为不变。

## Testing

`apps/desktop/tests/remove-tree.spec.ts` 覆盖含包目录链接的目录树删除、链接指向的 store 仍然存在，以及路径已不存在时可接受；`apps/desktop/tests/prepared-runtime-smoke.spec.ts` 断言 prepared-runtime 冒烟后 native 缓存目录已被删除。在 Windows 上，`pnpm run prepare:dsh` 未强制退出即以退出码 0 完成，且没有留下 `dsh-desktop-smoke-*` 或 `desktop-native-smoke-*` 目录。
