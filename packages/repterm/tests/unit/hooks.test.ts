/**
 * Unit tests for src/api/hooks.ts - HooksRegistry
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { hooksRegistry, beforeEach as registerBeforeEach, afterEach as registerAfterEach } from '../../src/api/hooks.js';
import type { TestContext } from '../../src/runner/models.js';

describe('HooksRegistry', () => {
    beforeEach(() => {
        hooksRegistry.clear();
    });

    describe('registerBeforeEach', () => {
        test('registers a beforeEach hook', async () => {
            let called = false;
            registerBeforeEach(async () => {
                called = true;
            });

            const mockContext = {} as unknown as TestContext;
            await hooksRegistry.runBeforeEach(mockContext);

            expect(called).toBe(true);
        });

        test('runs multiple beforeEach hooks in order', async () => {
            const order: number[] = [];

            registerBeforeEach(async () => {
                order.push(1);
            });
            registerBeforeEach(async () => {
                order.push(2);
            });
            registerBeforeEach(async () => {
                order.push(3);
            });

            const mockContext = {} as unknown as TestContext;
            await hooksRegistry.runBeforeEach(mockContext);

            expect(order).toEqual([1, 2, 3]);
        });

        test('returns augmented context with hook return values', async () => {
            registerBeforeEach(async () => {
                return { tmpDir: '/tmp/test' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const augmentedContext = await hooksRegistry.runBeforeEach(mockContext);

            expect(augmentedContext.tmpDir).toBe('/tmp/test');
            expect(augmentedContext.terminal).toBeDefined();
        });

        test('merges return values from multiple hooks', async () => {
            registerBeforeEach(async () => {
                return { value1: 'first' };
            });
            registerBeforeEach(async () => {
                return { value2: 'second' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const augmentedContext = await hooksRegistry.runBeforeEach(mockContext);

            expect(augmentedContext.value1).toBe('first');
            expect(augmentedContext.value2).toBe('second');
        });

        test('later hooks can access earlier hook return values', async () => {
            registerBeforeEach(async () => {
                return { tmpDir: '/tmp/test' };
            });
            registerBeforeEach(async (ctx) => {
                // Should have access to tmpDir from previous hook
                return { fullPath: `${ctx.tmpDir}/file.txt` };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const augmentedContext = await hooksRegistry.runBeforeEach(mockContext);

            expect(augmentedContext.tmpDir).toBe('/tmp/test');
            expect(augmentedContext.fullPath).toBe('/tmp/test/file.txt');
        });

        test('handles hooks that return void', async () => {
            registerBeforeEach(async () => {
                // No return value
            });
            registerBeforeEach(async () => {
                return { value: 'test' };
            });

            const mockContext = { terminal: {} } as unknown as TestContext;
            const augmentedContext = await hooksRegistry.runBeforeEach(mockContext);

            expect(augmentedContext.value).toBe('test');
        });
    });

    describe('registerAfterEach', () => {
        test('registers an afterEach hook', async () => {
            let called = false;
            registerAfterEach(async () => {
                called = true;
            });

            const mockContext = {} as unknown as TestContext;
            await hooksRegistry.runAfterEach(mockContext);

            expect(called).toBe(true);
        });

        test('runs multiple afterEach hooks in order', async () => {
            const order: number[] = [];

            registerAfterEach(async () => {
                order.push(1);
            });
            registerAfterEach(async () => {
                order.push(2);
            });

            const mockContext = {} as unknown as TestContext;
            await hooksRegistry.runAfterEach(mockContext);

            expect(order).toEqual([1, 2]);
        });

        test('afterEach hooks receive augmented context', async () => {
            let receivedTmpDir: string | undefined;

            registerAfterEach(async (ctx) => {
                receivedTmpDir = ctx.tmpDir as string;
            });

            const mockContext = { terminal: {}, tmpDir: '/tmp/test' } as unknown as TestContext;
            await hooksRegistry.runAfterEach(mockContext);

            expect(receivedTmpDir).toBe('/tmp/test');
        });
    });

    describe('clear', () => {
        test('clears all hooks', async () => {
            let hookCalled = false;
            registerBeforeEach(async () => {
                hookCalled = true;
            });

            hooksRegistry.clear();

            const mockContext = {} as unknown as TestContext;
            await hooksRegistry.runBeforeEach(mockContext);

            expect(hookCalled).toBe(false);
        });
    });
});
