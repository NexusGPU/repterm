/**
 * Regression test for cross-package plugin type inference.
 */

import { describe, test, expect } from 'bun:test';
import path from 'path';

const rootDir = path.resolve(import.meta.dir, '../../../../');
const fixturePath = path.join(
  rootDir,
  'packages/repterm/tests/unit/fixtures/plugin-typing-cross-package.ts'
);
const typeRoots = path.join(rootDir, 'node_modules/@types');

describe('plugin typing', () => {
  test('infers plugin methods for external plugin packages', async () => {
    const tsconfigPath = path.join(
      process.env.TMPDIR ?? '/tmp',
      'repterm-cross-package-typecheck.tsconfig.json'
    );

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
          '@nexusgpu/repterm-plugin-kubectl': [
            'packages/plugin-kubectl/src/index.ts',
          ],
        },
        noEmit: true,
      },
      include: [fixturePath],
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
