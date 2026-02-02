/**
 * Unit tests for src/api/hooks.ts - HooksRegistry with named fixtures
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { hooksRegistry, beforeEach as registerBeforeEach, afterEach as registerAfterEach } from '../../src/api/hooks.js';
import type { TestContext } from '../../src/runner/models.js';

describe('HooksRegistry', () => {
    beforeEach(() => {
        hooksRegistry.clear();
    });

    describe('registerBeforeEach with name', () => {
        test('registers a named beforeEach hook', async () => {
            let called = false;
            registerBeforeEach('testFixture', async () => {
                called = true;
                return { testFixture: 'value' };
            });

            const mockContext = {} as unknown as TestContext;
            const requiredFixtures = new Set(['testFixture']);
            await hooksRegistry.runBeforeEachFor(mockContext, undefined, requiredFixtures);

            expect(called).toBe(true);
        });

        test('only runs beforeEach hooks that match requested fixtures', async () => {
            let tmpDirHookCalled = false;
            let otherHookCalled = false;

            registerBeforeEach('tmpDir', async () => {
                tmpDirHookCalled = true;
                return { tmpDir: '/tmp/test' };
            });

            registerBeforeEach('other', async () => {
                otherHookCalled = true;
                return { other: 'value' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const requiredFixtures = new Set(['tmpDir']);
            await hooksRegistry.runBeforeEachFor(mockContext, undefined, requiredFixtures);

            expect(tmpDirHookCalled).toBe(true);
            expect(otherHookCalled).toBe(false);
        });

        test('returns augmented context with fixture values', async () => {
            registerBeforeEach('tmpDir', async () => {
                return { tmpDir: '/tmp/test' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const requiredFixtures = new Set(['tmpDir']);
            const { context } = await hooksRegistry.runBeforeEachFor(mockContext, undefined, requiredFixtures);

            expect(context.tmpDir).toBe('/tmp/test');
            expect(context.terminal).toBeDefined();
        });

        test('merges return values from multiple requested fixtures', async () => {
            registerBeforeEach('value1', async () => {
                return { value1: 'first' };
            });
            registerBeforeEach('value2', async () => {
                return { value2: 'second' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const requiredFixtures = new Set(['value1', 'value2']);
            const { context } = await hooksRegistry.runBeforeEachFor(mockContext, undefined, requiredFixtures);

            expect(context.value1).toBe('first');
            expect(context.value2).toBe('second');
        });

        test('tracks executed fixtures correctly', async () => {
            registerBeforeEach('fixture1', async () => {
                return { fixture1: 'value1' };
            });
            registerBeforeEach('fixture2', async () => {
                return { fixture2: 'value2' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const requiredFixtures = new Set(['fixture1']);
            const { executedFixtures } = await hooksRegistry.runBeforeEachFor(mockContext, undefined, requiredFixtures);

            expect(executedFixtures.has('fixture1')).toBe(true);
            expect(executedFixtures.has('fixture2')).toBe(false);
        });
    });

    describe('registerAfterEach with name', () => {
        test('registers a named afterEach hook', async () => {
            let called = false;
            registerAfterEach('testFixture', async () => {
                called = true;
            });

            const mockContext = {} as unknown as TestContext;
            const executedFixtures = new Set(['testFixture']);
            await hooksRegistry.runAfterEachFor(mockContext, undefined, executedFixtures);

            expect(called).toBe(true);
        });

        test('only runs afterEach hooks that match executed fixtures', async () => {
            let tmpDirCleanupCalled = false;
            let otherCleanupCalled = false;

            registerAfterEach('tmpDir', async () => {
                tmpDirCleanupCalled = true;
            });

            registerAfterEach('other', async () => {
                otherCleanupCalled = true;
            });

            const mockContext = { tmpDir: '/tmp/test' } as unknown as TestContext;
            const executedFixtures = new Set(['tmpDir']);
            await hooksRegistry.runAfterEachFor(mockContext, undefined, executedFixtures);

            expect(tmpDirCleanupCalled).toBe(true);
            expect(otherCleanupCalled).toBe(false);
        });

        test('afterEach hooks receive context with fixture values', async () => {
            let receivedTmpDir: string | undefined;

            registerAfterEach('tmpDir', async (ctx) => {
                receivedTmpDir = ctx.tmpDir as string;
            });

            const mockContext = { terminal: {}, tmpDir: '/tmp/test' } as unknown as TestContext;
            const executedFixtures = new Set(['tmpDir']);
            await hooksRegistry.runAfterEachFor(mockContext, undefined, executedFixtures);

            expect(receivedTmpDir).toBe('/tmp/test');
        });
    });

    describe('clear', () => {
        test('clears all hooks', async () => {
            let hookCalled = false;
            registerBeforeEach('test', async () => {
                hookCalled = true;
            });

            hooksRegistry.clear();

            const mockContext = {} as unknown as TestContext;
            const requiredFixtures = new Set(['test']);
            await hooksRegistry.runBeforeEachFor(mockContext, undefined, requiredFixtures);

            expect(hookCalled).toBe(false);
        });
    });
});
