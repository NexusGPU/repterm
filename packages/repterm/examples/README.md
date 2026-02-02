# Repterm Examples / Repterm 示例

This directory contains examples demonstrating how to use the Repterm framework efficiently.
本目录包含展示如何高效使用 Repterm 框架的示例。

## Usage / 使用方法

```bash
# Run a specific example / 运行特定示例
npx repterm examples/01-basic-commands.ts

# Run with recording enabled / 启用录制模式运行
npx repterm --record examples/01-basic-commands.ts
```

## Learning Path / 学习路径

We recommend following this path to master Repterm:
我们推荐按照以下路径掌握 Repterm：

### 1. Basics / 入门

Start here to understand the core concepts.
从这里开始理解核心概念。

- **`01-basic-commands.ts`**
  - **Goal**: Learn how to execute simple commands and inspect results.
  - **目标**: 学习如何执行简单命令并检查结果。
  - **Key API**: `terminal.run()`, `CommandResult`

- **`02-command-assertions.ts`**
  - **Goal**: Master the assertion library for verify command outputs.
  - **目标**: 掌握用于验证命令输出的断言库。
  - **Key API**: `expect(result).toSucceed()`, `toHaveStdout()`

### 2. Intermediate / 进阶

Handle more complex scenarios and organize your tests.
处理更复杂的场景并组织你的测试。

- **`03-interactive-commands.ts`**
  - **Goal**: Interact with TUI programs (like editors or prompts) using the PTY controller.
  - **目标**: 使用 PTY 控制器与 TUI 程序（如编辑器或提示符）进行交互。
  - **Key API**: `terminal.run()` (interactive), `proc.expect()`, `proc.send()`

- **`04-fixtures-with-hooks.ts`**
  - **Goal**: Use `beforeEach`/`afterEach` hooks to manage test environments (e.g., temp files).
  - **目标**: 使用 `beforeEach`/`afterEach` 钩子管理测试环境（例如临时文件）。
  - **Key API**: `beforeEach()`, `afterEach()`

- **`06-terminal-assertions.ts`**
  - **Goal**: Verify the visual state of the terminal screen, not just the text stream.
  - **目标**: 验证终端屏幕的视觉状态，而不仅仅是文本流。
  - **Key API**: `expect(terminal).toContainText()`, `terminal.snapshot()`

### 3. Advanced / 高级

Professional grade testing patterns.
专业级的测试模式。

- **`05-multi-terminal.ts`**
  - **Goal**: Test client-server or multi-user scenarios with multiple terminal windows.
  - **目标**: 使用多个终端窗口测试客户端-服务器或多用户场景。
  - **Key API**: `terminal.create()`, `process.env`

- **`07-test-organization.ts`**
  - **Goal**: Structure large test suites with steps and nested descriptions.
  - **目标**: 使用步骤和嵌套描述构建大型测试套件。
  - **Key API**: `describe()`, `test.step()`

- **`08-recording-demos.ts`**
  - **Goal**: Create specialized recordings for documentation or verification.
  - **目标**: 创建用于文档及验证的专用录制。

## Key Concepts / 关键概念

### Assertions / 断言

Repterm provides fluent assertions for both command results and terminal state.
Repterm 为命令结果和终端状态提供了流畅的断言接口。

```typescript
// Command Result Assertion / 命令结果断言
expect(result)
  .toSucceed()
  .toHaveStdout('success');

// Terminal State Assertion / 终端状态断言
await expect(terminal).toContainText('Loading...');
```

### Interactive Usage / 交互式用法

For interactive commands (like `nano`, `vim`, or prompts), use the process controller:
对于交互式命令（如 `nano`, `vim` 或提示符），请使用进程控制器：

```typescript
const proc = terminal.run('nano file.txt');
await proc.expect('New Buffer'); // Wait for UI / 等待界面
await proc.send('Hello World');  // Type text / 输入文本
await proc.send('^X');           // Send Ctrl+X / 发送 Ctrl+X
```
