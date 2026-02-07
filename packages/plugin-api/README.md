# repterm-api

Public plugin and matcher API for Repterm ecosystem packages.

Use this package when building Repterm plugins so your package can depend on stable API types without importing the full `repterm` runtime.

## Install

```bash
bun add repterm-api
```

## Typical Use

```ts
import { definePlugin, type Plugin } from 'repterm-api';
```

Then implement plugin methods/hooks in your package and consume the plugin from `repterm` test contexts.

Plugin contributors: see [Plugin Contributor Guide](../../CONTRIBUTING-PLUGINS.md).

For end-to-end examples, see `packages/plugin-kubectl` in the repository.
