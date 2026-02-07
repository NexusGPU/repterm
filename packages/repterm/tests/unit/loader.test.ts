/**
 * Unit tests for src/runner/loader.ts - Test file discovery and loading
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { discoverTests } from '../../src/runner/loader.js';

describe('discoverTests', () => {
    const testDir = '/tmp/repterm-test-loader';

    beforeEach(async () => {
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    test('discovers test files in directory', async () => {
        await writeFile(join(testDir, 'foo.test.ts'), '// test');
        await writeFile(join(testDir, 'bar.test.ts'), '// test');
        await writeFile(join(testDir, 'util.ts'), '// also a test file now');

        const files = await discoverTests([testDir]);

        // Default pattern now matches all .ts files
        expect(files).toHaveLength(3);
        expect(files.some((f) => f.includes('foo.test.ts'))).toBe(true);
        expect(files.some((f) => f.includes('bar.test.ts'))).toBe(true);
        expect(files.some((f) => f.includes('util.ts'))).toBe(true);
    });

    test('discovers nested test files', async () => {
        await mkdir(join(testDir, 'nested'));
        await writeFile(join(testDir, 'nested', 'deep.test.ts'), '// test');

        const files = await discoverTests([testDir]);

        expect(files.some((f) => f.includes('deep.test.ts'))).toBe(true);
    });

    test('returns direct file paths', async () => {
        const filePath = join(testDir, 'direct.test.ts');
        await writeFile(filePath, '// test');

        const files = await discoverTests([filePath]);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe(filePath);
    });

    test('skips non-existent paths', async () => {
        const files = await discoverTests(['/non/existent/path']);
        expect(files).toHaveLength(0);
    });

    test('respects custom pattern option', async () => {
        await writeFile(join(testDir, 'foo.spec.ts'), '// spec');
        await writeFile(join(testDir, 'bar.test.ts'), '// test');

        const files = await discoverTests([testDir], {
            pattern: /\.spec\.ts$/,
        });

        expect(files).toHaveLength(1);
        expect(files[0]).toContain('foo.spec.ts');
    });

    test('discovers all .ts files in directory when no .test pattern required', async () => {
        // When passing a directory, should find all .ts files (not just .test.ts)
        await writeFile(join(testDir, 'example.ts'), '// example test');
        await writeFile(join(testDir, 'another.ts'), '// another test');
        await writeFile(join(testDir, 'config.json'), '// not a test');

        // Using a pattern that matches all .ts files
        const files = await discoverTests([testDir], {
            pattern: /\.ts$/,
        });

        expect(files).toHaveLength(2);
        expect(files.some((f) => f.includes('example.ts'))).toBe(true);
        expect(files.some((f) => f.includes('another.ts'))).toBe(true);
    });

    test('accepts direct .ts file paths without .test pattern', async () => {
        // Direct file paths should be accepted even without .test in name
        const filePath = join(testDir, 'example.ts');
        await writeFile(filePath, '// example');

        const files = await discoverTests([filePath]);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe(filePath);
    });
});
