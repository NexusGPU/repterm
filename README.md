# Repterm - CLI/TUI Test Framework

A TypeScript-based test framework for terminal and CLI applications, featuring a Playwright-style API, terminal recording capabilities, and parallel test execution.

## Features

- **Playwright-style API**: Familiar `test()`, `expect()`, and `describe()` syntax
- **TypeScript Support**: Write tests in `.ts` files without manual compilation
- **Terminal Recording**: Capture test sessions as asciinema recordings with full 256 colors
- **Multi-terminal Tests**: Test applications with multiple terminal windows
- **Parallel Execution**: Run tests concurrently with worker processes
- **Test Organization**: Suite grouping, steps, and hooks for maintainable tests
- **Rich Reporting**: Clear pass/fail output with failure diagnostics

## Prerequisites

- Node.js 20.11.0
- `asciinema` (for recording mode)
- `tmux` (for multi-terminal recording)

### Installing Dependencies

**macOS:**
```bash
brew install asciinema tmux
```

**Ubuntu/Debian:**
```bash
apt-get install asciinema tmux
```

## Installation

```bash
npm install
npm run build
```

## Quick Start

### Basic Test

```typescript
import { test, expect } from 'repterm';

test('echo command', async ({ terminal }) => {
  await terminal.start('echo "Hello, world!"');
  await terminal.waitForText('Hello, world!', { timeout: 5000 });
  await expect(terminal).toContainText('Hello, world!');
});
```

### Running Tests

```bash
# Run JavaScript or TypeScript tests (auto-detected)
repterm tests/example.test.js
repterm tests/example.test.ts

# Run with recording (supports both .js and .ts)
repterm --record tests/example.test.ts

# Run in parallel
repterm --workers 4 tests/

# Run with custom timeout
repterm --timeout 60000 tests/
```

**Note**: TypeScript files (`.ts`) are automatically detected and compiled on-the-fly using `tsx`. No manual compilation needed!

## Documentation

- [Quickstart Guide](specs/001-tui-test-framework/quickstart.md) - Comprehensive examples and API documentation
- [TypeScript Support](TYPESCRIPT-SUPPORT.md) - Using TypeScript for test authoring
- [Recording Implementation](RECORDING-IMPLEMENTATION.md) - How terminal recording works
- [Recording Status](RECORDING-STATUS.md) - Current recording feature status

## Architecture

```
src/
├── api/          # Public API (test, expect, describe, hooks)
├── cli/          # CLI entrypoint and server
├── runner/       # Test execution engine
├── terminal/     # Terminal session management
├── recording/    # Asciinema integration
└── utils/        # Shared utilities
```

## User Stories

### 1. Write and Run TUI Tests (MVP) ✅
- Playwright-style test authoring
- CLI execution with pass/fail output
- Recording mode support
- Multi-terminal tests

### 2. Parallel Test Execution ✅
- Concurrent test execution with workers
- Isolated terminal state per worker
- Aggregated reporting

### 3. Maintainable Test Organization ✅
- Suite grouping with `describe()`
- Named steps with `test.step()`
- Hooks: `beforeEach()`, `afterEach()`
- Shared fixtures

## API Overview

### Test Registration
```typescript
test(name, fn)              // Register a test
describe(name, fn)          // Group tests into suites
test.step(name, fn)         // Named step within a test
```

### Assertions
```typescript
expect(terminal).toContainText(text)
expect(terminal).toMatchPattern(regex)
```

### Hooks & Fixtures
```typescript
beforeEach(fn)              // Run before each test
afterEach(fn)               // Run after each test
fixture(name, factory)      // Register a shared fixture
```

### Terminal API
```typescript
terminal.start(command)     // Start a command
terminal.send(text)         // Send input
terminal.waitForText(text)  // Wait for output
terminal.snapshot()         // Get current output
```

### Multi-terminal
```typescript
const term2 = await terminalFactory.create()
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

- `/specs/001-tui-test-framework/` - Feature specification and planning documents
- `/src/` - Source code
- `/tests/` - Framework tests
- `/playwright/` - Reference implementation (not part of runtime)

## License

MIT
