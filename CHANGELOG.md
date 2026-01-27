# Changelog

## v0.1.0 (2026-01-26)

### ✨ Features

- **Core Framework**: Playwright-style API for terminal testing
  - `test()`, `expect()`, `describe()` functions
  - Terminal API: `start()`, `send()`, `waitForText()`, `snapshot()`
  
- **Test Organization**: 
  - Suite grouping with `describe()`
  - Named steps with `test.step()`
  - Hooks: `beforeEach()`, `afterEach()`
  - Shared fixtures support

- **Parallel Execution**:
  - Multi-worker support with `--workers` flag
  - Isolated terminal state per worker
  - Aggregated result reporting

- **Terminal Features**:
  - Multi-terminal support via `terminalFactory`
  - Recording mode with asciinema (optional)
  - Tmux integration for multi-pane tests

- **CLI**:
  - Simple command-line interface
  - Configurable timeouts
  - Verbose output mode
  - Rich failure diagnostics

### 🔧 Improvements

- Removed unnecessary API server functionality
- Simplified to pure CLI-based execution
- Fixed file discovery to support direct file paths

### 📝 Documentation

- Comprehensive README with examples
- Detailed quickstart guide
- API reference documentation

### ✅ Testing

- All core features validated
- Example tests provided
- Framework builds successfully

