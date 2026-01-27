/**
 * Unit tests for src/api/hooks.ts - HooksRegistry
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { hooksRegistry, beforeEach as registerBeforeEach, afterEach as registerAfterEach, fixture } from '../../src/api/hooks.js';
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
    });

    describe('registerFixture', () => {
        test('registers and builds a fixture', () => {
            fixture('myFixture', () => 'fixture value');

            const mockContext = {} as unknown as TestContext;
            const fixtures = hooksRegistry.buildFixtures(mockContext);

            expect(fixtures.myFixture).toBe('fixture value');
        });

        test('builds multiple fixtures', () => {
            fixture('stringFixture', () => 'string');
            fixture('numberFixture', () => 42);
            fixture('objectFixture', () => ({ key: 'value' }));

            const mockContext = {} as unknown as TestContext;
            const fixtures = hooksRegistry.buildFixtures(mockContext);

            expect(fixtures.stringFixture).toBe('string');
            expect(fixtures.numberFixture).toBe(42);
            expect(fixtures.objectFixture).toEqual({ key: 'value' });
        });

        test('passes context to fixture factory', () => {
            const mockContext = { testName: 'my test' } as unknown as TestContext;

            fixture('contextFixture', (ctx) => ctx);

            const fixtures = hooksRegistry.buildFixtures(mockContext);
            expect(fixtures.contextFixture).toBe(mockContext);
        });
    });

    describe('clear', () => {
        test('clears all hooks and fixtures', async () => {
            let hookCalled = false;
            registerBeforeEach(async () => {
                hookCalled = true;
            });
            fixture('testFixture', () => 'value');

            hooksRegistry.clear();

            const mockContext = {} as unknown as TestContext;
            await hooksRegistry.runBeforeEach(mockContext);
            const fixtures = hooksRegistry.buildFixtures(mockContext);

            expect(hookCalled).toBe(false);
            expect(Object.keys(fixtures)).toHaveLength(0);
        });
    });
});
