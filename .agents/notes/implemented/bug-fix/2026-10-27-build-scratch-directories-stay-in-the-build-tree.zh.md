# Agent Note: 构建期临时目录放在构建树内

Status: implemented

[English](2026-10-27-build-scratch-directories-stay-in-the-build-tree.md) | 中文

## Problem

在 Windows 上，把打包好的 Electron 可执行文件当作 Node 运行时，无法在构建机的临时目录下创建目录：`%TEMP%` 下任何位置的 `mkdir` 都会以 `EPERM` 失败，即便目录是构建机自己刚在那里建好的；而同一个进程在构建树内写入一切正常。构建机自己的 Node 进程写 `%TEMP%` 没有问题，因此限制来自这个内置可执行文件，而不是账号或目录权限。

`prepare:dsh` 用 `mkdtempSync(tmpdir(), …)` 创建运行时构建根目录，于是内置 pnpm 安装在其 store 的第一次 `mkdir`（`store/v11`）上就失败了；两个冒烟步骤同样把隔离用的主目录放在 `%TEMP%` 下。因此只有当调用方为整个构建重定向 `TMP` 与 `TEMP%` 时，打包才能跑通。

## Decision

需要运行内置运行时的构建步骤，从 `apps/desktop/scripts/build-temporary-root.ts` 的 `resolveBuildTemporaryRoot` 取得临时目录：它解析并创建构建树内共享的 `.desktop-build/tmp`。`prepare-dsh` 把运行时根目录建在那里，并通过 `buildTemporaryEnvironment` 给 pnpm 子进程传入 `TMP`、`TEMP`、`TMPDIR`；运行时冒烟与 prepared-runtime 冒烟用同一个根目录放隔离主目录与 native 缓存，并把这些变量传给 Host 子进程。

该目录与下载缓存一样按构建共享，每个使用者都在其中创建自己唯一命名的子目录，因此并行构建不同目标不会冲突。这些目录的收尾是同步删除，理由见 [桌面冒烟测试同步删除临时目录树](2026-10-27-desktop-smoke-teardown-removes-trees-synchronously.zh.md)。

## Alternatives considered

**要求调用方重定向 `TMP`/`TEMP`。** 这正是故障出现后打包说明给出的做法；从脚本里看不出来，而且 `package-desktop.ps1` 无法知道内置可执行文件在某一台机器上能写哪个目录。

**能写 `%TEMP%` 就用，不能写再回退。** 探测可写性等于把失败路径再走一遍，而且构建会出现两种临时目录，导致产物路径与清理方式因机器而异。

**把临时目录放到仓库之外以缩短路径。** 这会把依赖重新放回构建机的临时目录上，而失败恰恰出在那里；构建树本来就承载其他所有中间产物。

## Consequences

打包不再依赖构建机的临时目录对内置 Electron 可执行文件可写，`package-desktop.ps1` 也不需要任何环境准备。临时目录现在位于 `apps/desktop/.desktop-build/tmp`（`.gitignore` 已排除），且各自的所有者在构建结束后会删除自己的目录，因此工作区不会残留。

构建树路径比 `%TEMP%` 更长，嵌套很深的依赖会看到略长的路径。当前 Windows 机器上没有触发路径长度上限，且运行时构建根目录无论成功失败都会被删除。

## Testing

`apps/desktop/tests/build-temporary-root.spec.ts` 覆盖临时根目录的创建、重复请求，以及三个临时变量都指向子进程可写的目录；`apps/desktop/tests/desktop-build-paths.spec.ts` 覆盖该根目录按构建共享。在 Windows 上，未做任何 `TMP`/`TEMP` 重定向即跑通 `package-desktop.ps1`：`prepare:dsh` 在 `.desktop-build/tmp` 下完成运行时安装，两个冒烟都通过，安装包及其校验文件写入 `dist/desktop`。
