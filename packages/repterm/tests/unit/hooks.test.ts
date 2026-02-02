/**
 * Unit tests for src/api/hooks.ts - HooksRegistry with named fixtures
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { hooksRegistry, beforeEach as registerBeforeEach, afterEach as registerAfterEach, beforeAll as registerBeforeAll, afterAll as registerAfterAll } from '../../src/api/hooks.js';
import { describe as describeBlock } from '../../src/api/describe.js';
import { clearTests } from '../../src/api/test.js';
import type { TestContext, TestSuite } from '../../src/runner/models.js';

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

        test('clears beforeAll and afterAll hooks', async () => {
            clearTests();

            let beforeAllCalled = false;
            let afterAllCalled = false;

            describeBlock('Test Suite', () => {
                registerBeforeAll(async () => {
                    beforeAllCalled = true;
                    return {};
                });
                registerAfterAll(async () => {
                    afterAllCalled = true;
                });
            });

            hooksRegistry.clear();

            // 创建一个 mock suite
            const mockSuite: TestSuite = {
                id: 'test-suite-id',
                name: 'Test Suite',
                tests: [],
                config: {},
            };

            await hooksRegistry.runBeforeAllFor(mockSuite, {});
            await hooksRegistry.runAfterAllFor(mockSuite, {});

            expect(beforeAllCalled).toBe(false);
            expect(afterAllCalled).toBe(false);
        });
    });

    describe('registerBeforeAll', () => {
        beforeEach(() => {
            clearTests();
            hooksRegistry.clear();
        });

        test('registers a beforeAll hook for current suite', async () => {
            let called = false;
            let suiteId: string | undefined;

            describeBlock('My Suite', () => {
                registerBeforeAll(async () => {
                    called = true;
                    return { setupValue: 'test' };
                });
            });

            // 获取注册的 suite ID
            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const mySuite = suites.find((s) => s.name === 'My Suite');
            suiteId = mySuite?.id;

            // 创建 mock suite 用于测试
            const mockSuite: TestSuite = {
                id: suiteId!,
                name: 'My Suite',
                tests: [],
                config: {},
            };

            const result = await hooksRegistry.runBeforeAllFor(mockSuite, {});

            expect(called).toBe(true);
            expect(result.setupValue).toBe('test');
        });

        test('throws error when called outside describe block', () => {
            expect(() => {
                registerBeforeAll(async () => {});
            }).toThrow('beforeAll must be called inside a describe() block');
        });

        test('supports named beforeAll hooks', async () => {
            let called = false;

            describeBlock('Named Suite', () => {
                registerBeforeAll('setupDb', async () => {
                    called = true;
                    return { db: 'connected' };
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Named Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Named Suite',
                tests: [],
                config: {},
            };

            const result = await hooksRegistry.runBeforeAllFor(mockSuite, {});

            expect(called).toBe(true);
            expect(result.db).toBe('connected');
        });

        test('merges return values from multiple beforeAll hooks', async () => {
            describeBlock('Multi Hook Suite', () => {
                registerBeforeAll(async () => {
                    return { value1: 'first' };
                });
                registerBeforeAll(async () => {
                    return { value2: 'second' };
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Multi Hook Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Multi Hook Suite',
                tests: [],
                config: {},
            };

            const result = await hooksRegistry.runBeforeAllFor(mockSuite, {});

            expect(result.value1).toBe('first');
            expect(result.value2).toBe('second');
        });

        test('inherits context from parent suite', async () => {
            describeBlock('Child Suite', () => {
                registerBeforeAll(async (ctx) => {
                    return { childValue: `inherited-${ctx.parentValue}` };
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Child Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Child Suite',
                tests: [],
                config: {},
            };

            const inheritedContext = { parentValue: 'fromParent' };
            const result = await hooksRegistry.runBeforeAllFor(mockSuite, inheritedContext);

            expect(result.childValue).toBe('inherited-fromParent');
            expect(result.parentValue).toBe('fromParent');
        });
    });

    describe('registerAfterAll', () => {
        beforeEach(() => {
            clearTests();
            hooksRegistry.clear();
        });

        test('registers an afterAll hook for current suite', async () => {
            let called = false;

            describeBlock('Cleanup Suite', () => {
                registerAfterAll(async () => {
                    called = true;
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Cleanup Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Cleanup Suite',
                tests: [],
                config: {},
            };

            await hooksRegistry.runAfterAllFor(mockSuite, {});

            expect(called).toBe(true);
        });

        test('throws error when called outside describe block', () => {
            expect(() => {
                registerAfterAll(async () => {});
            }).toThrow('afterAll must be called inside a describe() block');
        });

        test('supports named afterAll hooks', async () => {
            let called = false;

            describeBlock('Named Cleanup Suite', () => {
                registerAfterAll('cleanupDb', async () => {
                    called = true;
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Named Cleanup Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Named Cleanup Suite',
                tests: [],
                config: {},
            };

            await hooksRegistry.runAfterAllFor(mockSuite, {});

            expect(called).toBe(true);
        });

        test('receives context from beforeAll hooks', async () => {
            let receivedValue: string | undefined;

            describeBlock('Context Suite', () => {
                registerBeforeAll(async () => {
                    return { setupValue: 'testValue' };
                });
                registerAfterAll(async (ctx) => {
                    receivedValue = ctx.setupValue as string;
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Context Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Context Suite',
                tests: [],
                config: {},
            };

            const context = await hooksRegistry.runBeforeAllFor(mockSuite, {});
            await hooksRegistry.runAfterAllFor(mockSuite, context);

            expect(receivedValue).toBe('testValue');
        });

        test('runs afterAll hooks in reverse order', async () => {
            const executionOrder: string[] = [];

            describeBlock('Order Suite', () => {
                registerAfterAll(async () => {
                    executionOrder.push('first');
                });
                registerAfterAll(async () => {
                    executionOrder.push('second');
                });
                registerAfterAll(async () => {
                    executionOrder.push('third');
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Order Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Order Suite',
                tests: [],
                config: {},
            };

            await hooksRegistry.runAfterAllFor(mockSuite, {});

            // afterAll 应该逆序执行
            expect(executionOrder).toEqual(['third', 'second', 'first']);
        });
    });

    describe('beforeAll/afterAll lifecycle', () => {
        beforeEach(() => {
            clearTests();
            hooksRegistry.clear();
        });

        test('complete lifecycle: beforeAll -> tests -> afterAll', async () => {
            const executionOrder: string[] = [];

            describeBlock('Lifecycle Suite', () => {
                registerBeforeAll(async () => {
                    executionOrder.push('beforeAll');
                    return { resource: 'allocated' };
                });
                registerAfterAll(async () => {
                    executionOrder.push('afterAll');
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const suite = suites.find((s) => s.name === 'Lifecycle Suite');

            const mockSuite: TestSuite = {
                id: suite!.id,
                name: 'Lifecycle Suite',
                tests: [],
                config: {},
            };

            // 模拟完整的测试执行流程
            const context = await hooksRegistry.runBeforeAllFor(mockSuite, {});
            executionOrder.push('test');
            await hooksRegistry.runAfterAllFor(mockSuite, context);

            expect(executionOrder).toEqual(['beforeAll', 'test', 'afterAll']);
            expect(context.resource).toBe('allocated');
        });

        test('nested suites have isolated hooks', async () => {
            let parentBeforeAllCalled = false;
            let childBeforeAllCalled = false;

            describeBlock('Parent', () => {
                registerBeforeAll(async () => {
                    parentBeforeAllCalled = true;
                    return {};
                });

                describeBlock('Child', () => {
                    registerBeforeAll(async () => {
                        childBeforeAllCalled = true;
                        return {};
                    });
                });
            });

            const { getTests } = await import('../../src/api/test.js');
            const suites = getTests();
            const parentSuite = suites.find((s) => s.name === 'Parent');
            const childSuite = parentSuite?.suites?.find((s) => s.name === 'Child');

            // 只运行 child suite 的 beforeAll
            const mockChildSuite: TestSuite = {
                id: childSuite!.id,
                name: 'Child',
                tests: [],
                config: {},
            };

            await hooksRegistry.runBeforeAllFor(mockChildSuite, {});

            expect(parentBeforeAllCalled).toBe(false);
            expect(childBeforeAllCalled).toBe(true);
        });
    });
});
