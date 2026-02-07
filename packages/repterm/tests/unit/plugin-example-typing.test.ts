/**
 * Regression test for plugin usage in kubectl examples (package imports).
 */

import { describe, expect, test } from 'bun:test';
import path from 'path';

const rootDir = path.resolve(import.meta.dir, '../../../../');
const examplePath = path.join(rootDir, 'packages/plugin-kubectl/examples/02-debugging.ts');
const typeRoots = path.join(rootDir, 'node_modules/@types');

describe('plugin example typing', () => {
  test('infers ctx.plugins.kubectl in 02-debugging example', async () => {
    const tsconfigPath = path.join(process.env.TMPDIR ?? '/tmp', 'repterm-example-typecheck.tsconfig.json');

    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        types: ['bun'],
        typeRoots: [typeRoots],
        baseUrl: rootDir,
        paths: {
          repterm: ['packages/repterm/src/index.ts'],
          'repterm-api': ['packages/plugin-api/src/index.ts'],
          '@nexusgpu/repterm-plugin-kubectl': ['packages/plugin-kubectl/src/index.ts'],
        },
        noEmit: true,
      },
      include: [examplePath],
    };

    await Bun.write(tsconfigPath, JSON.stringify(tsconfig, null, 2));

    const proc = Bun.spawn(['bunx', 'tsc', '-p', tsconfigPath], {
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
    expect(stderr).not.toContain("Property 'kubectl' does not exist on type '{}'.");
  });
});
