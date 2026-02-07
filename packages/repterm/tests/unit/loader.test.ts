/**
 * Unit tests for src/runner/loader.ts - Test file discovery and loading
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { discoverTests, loadTestFile, loadTestFiles } from '../../src/runner/loader.js';
import { getTests, clearTests } from '../../src/api/test.js';

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

describe('loadTestFile', () => {
    const fixturesDir = join(import.meta.dir, 'fixtures');

    beforeEach(() => {
        clearTests();
    });

    test('sets file suite and registers tests from file', async () => {
        const fixturePath = join(fixturesDir, 'loader-one.ts');
        await loadTestFile(fixturePath);

        const suites = getTests();
        const fileSuite = suites.find((s) => s.name === 'loader-one.ts');
        expect(fileSuite).toBeDefined();
        expect(fileSuite!.tests).toHaveLength(1);
        expect(fileSuite!.tests[0].name).toBe('loaded test');
    });

    test('throws when file fails to load', async () => {
        await expect(loadTestFile('/non/existent/file.ts')).rejects.toThrow(
            /Failed to load test file/
        );
    });
});

describe('loadTestFiles', () => {
    const fixturesDir = join(import.meta.dir, 'fixtures');

    beforeEach(() => {
        clearTests();
    });

    test('loads multiple files and registers all tests', async () => {
        await loadTestFiles([
            join(fixturesDir, 'loader-one.ts'),
            join(fixturesDir, 'loader-two.ts'),
        ]);

        const suites = getTests();
        const one = suites.find((s) => s.name === 'loader-one.ts');
        const two = suites.find((s) => s.name === 'loader-two.ts');
        expect(one).toBeDefined();
        expect(one!.tests).toHaveLength(1);
        expect(two).toBeDefined();
        expect(two!.tests).toHaveLength(2);
        expect(two!.tests.map((t) => t.name)).toEqual(['first', 'second']);
    });
});
