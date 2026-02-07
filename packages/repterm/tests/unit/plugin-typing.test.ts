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

describe('plugin typing', () => {
  test('infers plugin methods for external plugin packages', async () => {
    const proc = Bun.spawn(
      [
        'bunx',
        'tsc',
        '--noEmit',
        '--moduleResolution',
        'bundler',
        '--module',
        'ESNext',
        '--target',
        'ESNext',
        '--types',
        'bun',
        '--strict',
        fixturePath,
      ],
      {
        cwd: rootDir,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

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
