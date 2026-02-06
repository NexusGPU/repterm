---
name: repterm
description: >-
  Maintain and extend Repterm (packages/repterm) and @repterm/plugin-kubectl in this monorepo.
  Use when writing or debugging terminal tests, recording mode, parallel scheduler/worker behavior,
  hooks/fixtures/steps lifecycle, plugin APIs, kubectl helpers/matchers, or repository docs/examples/tests.
---

# 快速开始

## 常用命令

| 任务 | 命令 |
|------|------|
| 安装依赖 | `bun install` |
| 运行全部单测 | `bun test packages/repterm/tests/unit` |
| 运行核心 CLI | `bun run packages/repterm/src/cli/index.ts <tests-or-dirs>` |
| 录制模式 | `bun run repterm --record <tests-or-dirs>` |
| 并行执行 | `bun run repterm --workers 4 <tests-or-dirs>` |
| Kubectl 无集群示例 | `bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts` |

## 关键行为（先记住）

1. `--record` 过滤逻辑：
   - 不带 `--record`：运行所有测试（包括 `{ record: true }`）。
   - 带 `--record`：只运行 `{ record: true }` 测试。
2. `terminal.run()` 返回 `PTYProcess`（PromiseLike），可直接 `await` 得到 `CommandResult`。
3. `CommandResult` 字段为 `code/stdout/stderr/output/duration/command/successful`。
4. 录制或交互 PTY 模式下，退出码通常不可靠（`code === -1`），优先断言输出。

## 代码导航

- 核心实现：`packages/repterm/src`
- 单测：`packages/repterm/tests/unit`
- Core 示例：`packages/repterm/examples`
- Kubectl 插件：`packages/plugin-kubectl/src`
- Kubectl 示例：`packages/plugin-kubectl/examples`

## 参考文件路由

| 需求 | 文件 |
|------|------|
| 总体架构 | `references/architecture.md` |
| API 与签名速查 | `references/api-cheatsheet.md` |
| CLI/runner 执行流 | `references/runner-pipeline.md` |
| 终端模式与录制 | `references/terminal-modes.md` |
| 典型写法模板 | `references/common-patterns.md` |
| 示例目录索引 | `references/examples-catalog.md` |
| Kubectl 插件与 matcher | `references/plugin-kubectl.md` |
| 单测优先级 | `references/testing-matrix.md` |
| 常见故障定位 | `references/troubleshooting.md` |

## 工作约定

1. 改实现时同步改对应 `references/*.md`，避免 skill 再漂移。
2. 改 CLI/runner/terminal 后，至少补跑对应 `packages/repterm/tests/unit/*.test.ts`。
3. 改插件 API 或 matcher 后，同步更新：
   - `packages/plugin-kubectl/src/index.ts`
   - `packages/plugin-kubectl/src/matchers.ts`
   - `skills/repterm/references/plugin-kubectl.md`
   - `skills/repterm/references/api-cheatsheet.md`
