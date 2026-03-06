<p align="center">
  <strong>Repterm</strong>
</p>

<p align="center">
  Terminal-first test framework for CLI/TUI apps — run tests in a real PTY, not just stdout.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/repterm"><img alt="npm" src="https://img.shields.io/npm/v/repterm?style=flat-square&color=CB3837"></a>
  <a href="https://github.com/NexusGPU/repterm/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/NexusGPU/repterm/ci.yml?style=flat-square&label=CI"></a>
  <a href="https://github.com/NexusGPU/repterm/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/NexusGPU/repterm?style=flat-square"></a>
  <a href="https://repterm.ai"><img alt="Docs" src="https://img.shields.io/badge/docs-repterm.ai-blue?style=flat-square"></a>
</p>

---

```typescript
import { test, expect } from 'repterm';

test('greet the world', async ({ $ }) => {
  const result = await $`echo "Hello, Repterm!"`;
  expect(result).toSucceed();
  expect(result).toHaveStdout('Hello, Repterm!');
});
```

```bash
$ bunx repterm tests/
 PASS  greet the world (120ms)
```

## Why Repterm?

**Write tests the way your users use your CLI.** Simple commands run via `Bun.spawn` for precise stdout/stderr/exitCode. When you need interactive testing — prompts, TUI redraws, progress bars — flip on `{ interactive: true }` and Repterm spawns a real PTY with full send/expect control.

**Familiar, structured API.** If you've used Playwright or Vitest, you already know how to use Repterm. `test()`, `describe()`, `expect()` — plus a `$` tagged template for running commands with automatic shell escaping.

**Tests become documentation.** Run with `--record` and every test produces an [asciinema](https://asciinema.org/) recording. Your test suite generates always-up-to-date terminal demos — no manual recording sessions.

**Parallel and fast.** Scale with `--workers N`. Each test gets its own isolated session.

**Extensible by design.** Build plugins to add domain-specific commands and matchers. The official [kubectl plugin](https://repterm.ai/docs/kubectl/overview) adds Kubernetes-aware testing with assertions like `toBeRunning()` and `toHaveReplicas()`.

## Features

- **Dual execution modes** — precise `Bun.spawn` by default; opt into a real PTY with `{ interactive: true }` for colors, cursor control, and TUI testing
- **Playwright-style API** — familiar `expect()` assertions, `proc.send()` / `proc.expect()` for interactive flows
- **`$` tagged templates** — run commands with automatic shell escaping: `` await $`echo ${userInput}` ``
- **Parallel test runner** — execute tests concurrently with `--workers N`
- **Terminal recording** — generate [asciinema](https://asciinema.org/) recordings with `--record`
- **Plugin system** — extend test contexts with custom helpers, matchers, and lifecycle hooks
- **Multi-terminal** — spin up multiple PTY sessions in a single test for client-server scenarios

## Quick Start

### Install

```bash
bun add -d repterm
```

Or install the standalone binary:

```bash
curl -fsSL https://cdn.tensor-fusion.ai/archive/repterm/install.sh | sh
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
iwr https://cdn.tensor-fusion.ai/archive/repterm/install.ps1 -UseBasicParsing | iex
```

</details>

### Write a Test

Create `tests/demo.ts`:

```typescript
import { test, expect, describe } from 'repterm';

describe('my CLI', () => {
  test('exits with code 0', async ({ $ }) => {
    const result = await $`echo "it works"`;
    expect(result).toSucceed();
    expect(result).toHaveStdout('it works');
  });

  test('handles stderr', async ({ $ }) => {
    const result = await $`echo "oops" >&2`;
    expect(result).toHaveStderr('oops');
  });
});
```

### Run

```bash
bunx repterm tests/
```

## Interactive Testing

Test interactive programs like prompts, editors, or TUI apps:

```typescript
test('interactive prompt', async ({ $ }) => {
  const proc = $({ interactive: true })`bash -c 'read -p "Name: " n; echo "Hi $n"'`;

  await proc.expect('Name:');
  await proc.send('Alice');
  await proc.expect('Hi Alice');
});
```

## Parallel Execution

Run tests across multiple workers:

```bash
bunx repterm --workers 4 tests/
```

## Recording

Generate terminal recordings for docs or CI artifacts:

```bash
bunx repterm --record tests/
```

Produces [asciinema](https://asciinema.org/)-compatible `.cast` files you can embed or replay.

## Plugins

Repterm has a plugin system for domain-specific testing. The first official plugin adds Kubernetes support:

```typescript
import { defineConfig, createTestWithPlugins, expect } from 'repterm';
import { kubectlPlugin, pod } from '@nexusgpu/repterm-plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

test('pod is running', async (ctx) => {
  const { kubectl } = ctx.plugins;
  await kubectl.apply('manifests/nginx.yaml');
  await kubectl.waitForPod('nginx', 'Running');
  await expect(pod('nginx')).toBeRunning();
});
```

Build your own plugins with [`repterm-api`](https://www.npmjs.com/package/repterm-api) — see the [Plugin Guide](https://repterm.ai/docs/plugins/overview).

## Packages

| Package | Description |
|---------|-------------|
| [`repterm`](https://www.npmjs.com/package/repterm) | Core framework + CLI runner |
| [`repterm-api`](https://www.npmjs.com/package/repterm-api) | Plugin/matcher API for extension authors |
| [`@nexusgpu/repterm-plugin-kubectl`](https://www.npmjs.com/package/@nexusgpu/repterm-plugin-kubectl) | Kubernetes testing plugin |

## Documentation

Full documentation is available at **[repterm.ai](https://repterm.ai)**.

- [Getting Started](https://repterm.ai/docs/getting-started)
- [Writing Tests](https://repterm.ai/docs/guides/writing-tests)
- [Interactive Commands](https://repterm.ai/docs/guides/interactive-commands)
- [Recording](https://repterm.ai/docs/guides/recording)
- [Plugin API](https://repterm.ai/docs/plugins/overview)
- [Kubectl Plugin](https://repterm.ai/docs/kubectl/overview)
- [API Reference](https://repterm.ai/docs/api/assertions)

## Contributing

See the [Plugin Development Guide](https://repterm.ai/docs/plugins/creating-plugins) to build your own plugins.

## License

[Apache-2.0](LICENSE)
