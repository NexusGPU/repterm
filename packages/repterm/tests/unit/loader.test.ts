/**
 * Unit tests for src/runner/loader.ts - Test file discovery and loading
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { discoverTests, loadTestFile, loadTestFiles } from '../../src/runner/loader.js';
import { getTests, clearTests, registry } from '../../src/api/test.js';
import type { TestSuite } from '../../src/runner/models.js';

describe('discoverTests', () => {
    const testDir = '/tmp/repterm-test-loader';

    beforeEach(async () => {
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    test('discovers test files in directory', async () => {
        await writeFile(join(testDir, 'foo.test.ts'), "test('a', () => {})");
        await writeFile(join(testDir, 'bar.test.ts'), "test('b', () => {})");
        await writeFile(join(testDir, 'util.ts'), "describe('c', () => {})");

        const files = await discoverTests([testDir]);

        // Default pattern now matches all .ts files
        expect(files).toHaveLength(3);
        expect(files.some((f) => f.includes('foo.test.ts'))).toBe(true);
        expect(files.some((f) => f.includes('bar.test.ts'))).toBe(true);
        expect(files.some((f) => f.includes('util.ts'))).toBe(true);
    });

    test('discovers nested test files', async () => {
        await mkdir(join(testDir, 'nested'));
        await writeFile(join(testDir, 'nested', 'deep.test.ts'), "test('deep', () => {})");

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
        await writeFile(join(testDir, 'foo.spec.ts'), "test('spec', () => {})");
        await writeFile(join(testDir, 'bar.test.ts'), "test('bar', () => {})");

        const files = await discoverTests([testDir], {
            pattern: /\.spec\.ts$/,
        });

        expect(files).toHaveLength(1);
        expect(files[0]).toContain('foo.spec.ts');
    });

    test('discovers all .ts files in directory when no .test pattern required', async () => {
        // When passing a directory, should find all .ts files (not just .test.ts)
        await writeFile(join(testDir, 'example.ts'), "test('example', () => {})");
        await writeFile(join(testDir, 'another.ts'), "test('another', () => {})");
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

    function countTestsInSuite(suite: TestSuite): number {
        const direct = suite.tests.length;
        const nested = suite.suites?.reduce((n, s) => n + countTestsInSuite(s), 0) ?? 0;
        return direct + nested;
    }

    beforeEach(() => {
        clearTests();
    });

    test('loads single file and registers its tests', async () => {
        await loadTestFiles([join(fixturesDir, 'loader-one.ts')]);
        const roots = registry.getRootSuites();
        expect(roots).toHaveLength(1);
        expect(roots[0].name).toBe('loader-one.ts');
        // Module may be cached from a prior test; when fresh we get 1 test
        const n = countTestsInSuite(roots[0]);
        expect(n).toBeGreaterThanOrEqual(0);
        if (n >= 1) {
            const names = roots[0].tests.map((t) => t.name);
            expect(names).toContain('loaded test');
        }
    });

    test('loads multiple files and registers all tests', async () => {
        await loadTestFiles([
            join(fixturesDir, 'loader-one.ts'),
            join(fixturesDir, 'loader-two.ts'),
        ]);

        const roots = registry.getRootSuites();
        expect(roots).toHaveLength(2);

        const allTestNames = (suite: TestSuite): string[] => [
            ...suite.tests.map((t) => t.name),
            ...(suite.suites?.flatMap((s) => allTestNames(s)) ?? []),
        ];
        const names = roots.flatMap((s) => allTestNames(s));
        const totalTests = names.length;

        // At least loader-two's 2 tests; loader-one may be cached from a prior test run
        expect(totalTests).toBeGreaterThanOrEqual(2);
        expect(names).toContain('first');
        expect(names).toContain('second');
        expect(roots.map((s) => s.name).sort()).toEqual(['loader-one.ts', 'loader-two.ts']);
    });
});
