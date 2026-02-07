# Plugin Contributor Guide

This guide is for developers building plugins on top of `repterm`.

## Who should read this

- You are creating a reusable plugin package for terminal testing workflows.
- You want stable public types from `repterm-api` without coupling to the full runner internals.
- You only use Bun-based tooling (`bun`, `bunx`, `bun test`, `bun publish`).

## Plugin developer workflow (Bun only)

1. Install dependencies:

```bash
bun install
```

2. Build plugin and API package during development:

```bash
bun run build:plugin-api
bun run build:plugin-kubectl
```

3. Run tests (full workspace):

```bash
bun run test
```

4. Lint core framework code before publishing changes:

```bash
bun run lint
```

## Package model

- `repterm`: runtime and CLI test runner.
- `repterm-api`: shared plugin interfaces, matcher types, and plugin helpers.
- Plugin packages (for example `@nexusgpu/repterm-plugin-kubectl`): depend on `repterm-api` and expose domain-specific methods and hooks.

## Authoring rules for high-quality plugins

- Keep plugin APIs small and task-focused.
- Prefer deterministic commands and assertions over timing-based heuristics.
- Expose strongly typed methods and avoid leaking internal runner objects.
- Design for CI reliability first: idempotent setup, clear cleanup, stable diagnostics.

## Simple plugin example (context + terminal)

`definePlugin` takes `(name, setup)` and `setup` receives plugin context.
Use `ctx.testContext.terminal` to execute commands from plugin methods.

```ts
import { definePlugin, type PluginContext } from 'repterm-api';

export const shellHelpers = definePlugin('shellHelpers', (ctx: PluginContext) => ({
  methods: {
    pwd: async () => {
      const result = await ctx.testContext.terminal.run('pwd');
      if (result.code !== 0) {
        throw new Error(`pwd failed: ${result.stderr}`);
      }
      return result.stdout.trim();
    },
    snapshot: async () => ctx.testContext.terminal.snapshot(),
  },
  context: {
    shellProfile: 'bash',
  },
}));
```

## SSH plugin example (stateful + hooks)

This example keeps lightweight session state in closure, runs remote commands through the test terminal,
and cleans up in `afterTest` hook.

```ts
import { definePlugin, type PluginContext } from 'repterm-api';

type SshTarget = {
  host: string;
  user: string;
  port?: number;
};

export const ssh = definePlugin('ssh', (ctx: PluginContext) => {
  const state: {
    target?: SshTarget;
    connected: boolean;
  } = {
    connected: false,
  };

  return {
    methods: {
      connect: async (target: SshTarget) => {
        state.target = target;
        state.connected = true;
      },
      runRemote: async (command: string) => {
        if (!state.connected || !state.target) {
          throw new Error('SSH not connected. Call connect() first.');
        }

        const port = state.target.port ?? 22;
        const escaped = command.replace(/"/g, '\\"');
        const sshCommand = `ssh -p ${port} ${state.target.user}@${state.target.host} "${escaped}"`;

        const result = await ctx.testContext.terminal.run(sshCommand, { timeout: 30_000 });
        if (result.code !== 0) {
          throw new Error(`SSH command failed: ${result.stderr}`);
        }

        return result.stdout;
      },
      disconnect: async () => {
        state.connected = false;
        state.target = undefined;
      },
    },
    hooks: {
      afterTest: async () => {
        // Ensure state does not leak between tests.
        state.connected = false;
        state.target = undefined;
      },
    },
    context: {
      sshConnected: () => state.connected,
    },
  };
});
```

## Publishing checklist

- Ensure package-level `README.md` exists and is up to date.
- Confirm imports use `repterm-api` public exports.
- Run `bun run test` and `bun run build` successfully.
- Publish via workspace scripts (Bun):

```bash
bun run publish:plugin-api
bun run publish:plugin-kubectl
```

If you add a new plugin package, also add docs and usage examples under that package directory.
