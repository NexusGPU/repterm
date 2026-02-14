# Repterm Examples

This directory contains examples demonstrating how to use the Repterm framework efficiently.

Plugin contributors: see [Plugin Contributor Guide](../../../CONTRIBUTING-PLUGINS.md).

## Usage

```bash
# Run a specific example
bunx repterm examples/01-basic-commands.ts

# Run with recording enabled
bunx repterm --record examples/01-basic-commands.ts
```

## Learning Path

We recommend following this path to master Repterm:

### 1. Basics

Start here to understand the core concepts.

- **`01-basic-commands.ts`**
  - **Goal**: Learn how to execute simple commands and inspect results.
  - **Key API**: `$\`cmd\``, `CommandResult` (also `terminal.run()` for backward compatibility)

- **`02-command-assertions.ts`**
  - **Goal**: Master the assertion library for verify command outputs.
  - **Key API**: `expect(result).toSucceed()`, `toHaveStdout()`

### 2. Intermediate

Handle more complex scenarios and organize your tests.

- **`03-interactive-commands.ts`**
  - **Goal**: Interact with TUI programs (like editors or prompts) using the PTY controller.
  - **Key API**: `$({ interactive: true })\`cmd\``, `proc.expect()`, `proc.send()`

- **`04-fixtures-with-hooks.ts`**
  - **Goal**: Use `beforeEach`/`afterEach` hooks to manage test environments (e.g., temp files).
  - **Key API**: `beforeEach()`, `afterEach()`

- **`06-terminal-assertions.ts`**
  - **Goal**: Verify the visual state of the terminal screen, not just the text stream.
  - **Key API**: `expect(terminal).toContainText()`, `terminal.snapshot()`

### 3. Advanced

Professional grade testing patterns.

- **`05-multi-terminal.ts`**
  - **Goal**: Test client-server or multi-user scenarios with multiple terminal windows.
  - **Key API**: `terminal.create()`, `process.env`

- **`07-test-organization.ts`**
  - **Goal**: Structure large test suites with steps and nested descriptions.
  - **Key API**: `describe()`, `test.step()`

- **`08-recording-demos.ts`**
  - **Goal**: Create specialized recordings for documentation or verification.

### 4. Expert

Deep dives into specialized features.

- **`17-custom-plugins.ts`**
  - **Goal**: Build custom plugins with `definePlugin()` to extend test contexts.
  - **Key API**: `definePlugin()`, `defineConfig()`, `describeWithPlugins()`, plugin hooks

- **`18-recording-options.ts`**
  - **Goal**: Control recording appearance with typing speed, pauses, and silent mode.
  - **Key API**: `typingSpeed`, `pauseBefore`, `pauseAfter`, `silent`, `showStepTitle`

- **`19-dollar-advanced.ts`**
  - **Goal**: Master `$` tagged template escaping, `raw()`, and multi-terminal patterns.
  - **Key API**: `raw()`, `shellEscape()`, type-based escaping, `terminal2.$`

- **`20-timeouts-and-errors.ts`**
  - **Goal**: Configure timeouts and handle errors gracefully.
  - **Key API**: `{ timeout }`, `proc.expect(text, { timeout })`, `.catch()`, `result.successful`

## Key Concepts

### Assertions

Repterm provides fluent assertions for both command results and terminal state.

```typescript
// Command Result Assertion
expect(result)
  .toSucceed()
  .toHaveStdout('success');

// Terminal State Assertion
await expect(terminal).toContainText('Loading...');
```

### Command Execution

Repterm provides a `$` tagged template literal for running commands with automatic shell escaping:

```typescript
// Basic command (recommended)
const result = await $`echo hello`;

// With interpolation (auto-escaped)
const name = "user input";
await $`echo ${name}`;  // runs: echo 'user input'

// With options
await $({ timeout: 5000 })`long-command`;

// Legacy syntax (still works)
const result = await terminal.run('echo hello');
```

### Interactive Usage

For interactive commands (like `nano`, `vim` or prompts), use the process controller:

```typescript
const proc = $({ interactive: true })`nano file.txt`;
await proc.expect('New Buffer'); // Wait for UI
await proc.send('Hello World');  // Type text
await proc.send('^X');           // Send Ctrl+X
```
