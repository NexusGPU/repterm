/**
 * Unit tests for runner lifecycle hooks (beforeAll/afterAll)
 * Tests the onion execution model
 */

import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { runSuite, runAllSuites } from '../../src/runner/runner.js';
import type { TestSuite, TestCase } from '../../src/runner/models.js';
import type { RunnerOptions } from '../../src/runner/runner.js';
import { ArtifactManager } from '../../src/runner/artifacts.js';
import { hooksRegistry } from '../../src/api/hooks.js';
import { describe as describeBlock } from '../../src/api/describe.js';
import { beforeAll as registerBeforeAll, afterAll as registerAfterAll } from '../../src/api/hooks.js';
import { clearTests, getTests, test as registerTest } from '../../src/api/test.js';

describe('Runner Lifecycle Hooks', () => {
    let artifactManager: ArtifactManager;
    let defaultOptions: RunnerOptions;

    beforeEach(() => {
        clearTests();
        hooksRegistry.clear();

        artifactManager = new ArtifactManager({
            baseDir: 'tmp/artifacts',
            runId: 'test-run'
        });
        vi.spyOn(artifactManager, 'getCastPath').mockReturnValue('path/to/cast');

        defaultOptions = {
            config: {
                record: { enabled: false },
                timeouts: { testMs: 5000 },
            } as any,
            artifactManager,
        };
    });

    test('runs beforeAll hooks before tests in suite', async () => {
        const executionOrder: string[] = [];

        describeBlock('Test Suite', () => {
            registerBeforeAll(async () => {
                executionOrder.push('beforeAll');
                return { setupDone: true };
            });

            registerTest('test 1', async ({ setupDone }) => {
                executionOrder.push('test1');
                // setupDone 应该从 beforeAll 传递过来
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Test Suite')!;

        await runSuite(suite, defaultOptions);

        expect(executionOrder).toEqual(['beforeAll', 'test1']);
    });

    test('runs afterAll hooks after all tests in suite', async () => {
        const executionOrder: string[] = [];

        describeBlock('Test Suite', () => {
            registerBeforeAll(async () => {
                executionOrder.push('beforeAll');
                return {};
            });

            registerAfterAll(async () => {
                executionOrder.push('afterAll');
            });

            registerTest('test 1', async () => {
                executionOrder.push('test1');
            });

            registerTest('test 2', async () => {
                executionOrder.push('test2');
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Test Suite')!;

        await runSuite(suite, defaultOptions);

        expect(executionOrder).toEqual(['beforeAll', 'test1', 'test2', 'afterAll']);
    });

    test('passes context from beforeAll to tests', async () => {
        let receivedContext: any = null;

        describeBlock('Context Suite', () => {
            registerBeforeAll(async () => {
                return {
                    dbConnection: { host: 'localhost', port: 5432 },
                    apiKey: 'test-key',
                };
            });

            registerTest('test with context', async (ctx) => {
                receivedContext = {
                    dbConnection: ctx.dbConnection,
                    apiKey: ctx.apiKey,
                };
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Context Suite')!;

        await runSuite(suite, defaultOptions);

        expect(receivedContext).not.toBeNull();
        expect(receivedContext.dbConnection).toEqual({ host: 'localhost', port: 5432 });
        expect(receivedContext.apiKey).toBe('test-key');
    });

    test('nested suites execute in onion order', async () => {
        const executionOrder: string[] = [];

        describeBlock('Parent Suite', () => {
            registerBeforeAll(async () => {
                executionOrder.push('parent-beforeAll');
                return { parentValue: 'parent' };
            });

            registerAfterAll(async () => {
                executionOrder.push('parent-afterAll');
            });

            registerTest('parent test', async () => {
                executionOrder.push('parent-test');
            });

            describeBlock('Child Suite', () => {
                registerBeforeAll(async () => {
                    executionOrder.push('child-beforeAll');
                    return { childValue: 'child' };
                });

                registerAfterAll(async () => {
                    executionOrder.push('child-afterAll');
                });

                registerTest('child test', async () => {
                    executionOrder.push('child-test');
                });
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Parent Suite')!;

        await runSuite(suite, defaultOptions);

        // 洋葱执行顺序：
        // parent-beforeAll -> parent-test -> child-beforeAll -> child-test -> child-afterAll -> parent-afterAll
        expect(executionOrder).toEqual([
            'parent-beforeAll',
            'parent-test',
            'child-beforeAll',
            'child-test',
            'child-afterAll',
            'parent-afterAll',
        ]);
    });

    test('child suite inherits parent context', async () => {
        let childReceivedContext: any = null;

        describeBlock('Parent Suite', () => {
            registerBeforeAll(async () => {
                return { parentValue: 'from-parent' };
            });

            describeBlock('Child Suite', () => {
                registerBeforeAll(async (ctx) => {
                    return { childValue: `child-got-${ctx.parentValue}` };
                });

                registerTest('child test', async (ctx) => {
                    childReceivedContext = {
                        parentValue: ctx.parentValue,
                        childValue: ctx.childValue,
                    };
                });
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Parent Suite')!;

        await runSuite(suite, defaultOptions);

        expect(childReceivedContext).not.toBeNull();
        expect(childReceivedContext.parentValue).toBe('from-parent');
        expect(childReceivedContext.childValue).toBe('child-got-from-parent');
    });

    test('afterAll runs even if tests fail', async () => {
        let afterAllCalled = false;

        describeBlock('Failing Suite', () => {
            registerBeforeAll(async () => {
                return {};
            });

            registerAfterAll(async () => {
                afterAllCalled = true;
            });

            registerTest('failing test', async () => {
                throw new Error('Test failed intentionally');
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Failing Suite')!;

        const results = await runSuite(suite, defaultOptions);

        expect(results[0].status).toBe('fail');
        expect(afterAllCalled).toBe(true);
    });

    test('multiple independent suites run correctly', async () => {
        const executionOrder: string[] = [];

        describeBlock('Suite A', () => {
            registerBeforeAll(async () => {
                executionOrder.push('A-beforeAll');
                return {};
            });

            registerAfterAll(async () => {
                executionOrder.push('A-afterAll');
            });

            registerTest('test A', async () => {
                executionOrder.push('A-test');
            });
        });

        describeBlock('Suite B', () => {
            registerBeforeAll(async () => {
                executionOrder.push('B-beforeAll');
                return {};
            });

            registerAfterAll(async () => {
                executionOrder.push('B-afterAll');
            });

            registerTest('test B', async () => {
                executionOrder.push('B-test');
            });
        });

        const suites = getTests();
        // 只获取我们创建的 Suite A 和 Suite B
        const suiteA = suites.find((s) => s.name === 'Suite A')!;
        const suiteB = suites.find((s) => s.name === 'Suite B')!;

        await runSuite(suiteA, defaultOptions);
        await runSuite(suiteB, defaultOptions);

        expect(executionOrder).toEqual([
            'A-beforeAll',
            'A-test',
            'A-afterAll',
            'B-beforeAll',
            'B-test',
            'B-afterAll',
        ]);
    });

    test('deeply nested suites maintain correct context chain', async () => {
        let level3Context: any = null;

        describeBlock('Level 1', () => {
            registerBeforeAll(async () => {
                return { level1: 'L1' };
            });

            describeBlock('Level 2', () => {
                registerBeforeAll(async (ctx) => {
                    return { level2: `L2-${ctx.level1}` };
                });

                describeBlock('Level 3', () => {
                    registerBeforeAll(async (ctx) => {
                        return { level3: `L3-${ctx.level2}` };
                    });

                    registerTest('deep test', async (ctx) => {
                        level3Context = {
                            level1: ctx.level1,
                            level2: ctx.level2,
                            level3: ctx.level3,
                        };
                    });
                });
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Level 1')!;

        await runSuite(suite, defaultOptions);

        expect(level3Context).not.toBeNull();
        expect(level3Context.level1).toBe('L1');
        expect(level3Context.level2).toBe('L2-L1');
        expect(level3Context.level3).toBe('L3-L2-L1');
    });

    test('suite without beforeAll/afterAll works normally', async () => {
        let testRan = false;

        describeBlock('Plain Suite', () => {
            registerTest('plain test', async () => {
                testRan = true;
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Plain Suite')!;

        const results = await runSuite(suite, defaultOptions);

        expect(testRan).toBe(true);
        expect(results[0].status).toBe('pass');
    });
});

describe('Terminal mode selection', () => {
    let artifactManager: ArtifactManager;
    let defaultOptions: RunnerOptions;

    beforeEach(() => {
        clearTests();
        hooksRegistry.clear();

        artifactManager = new ArtifactManager({
            baseDir: 'tmp/artifacts',
            runId: 'test-run'
        });
        vi.spyOn(artifactManager, 'getCastPath').mockReturnValue('path/to/cast');

        defaultOptions = {
            config: {
                record: { enabled: false },
                timeouts: { testMs: 5000 },
            } as any,
            artifactManager,
        };
    });

    test('uses Bun.spawn for plain test without record flag', async () => {
        let terminalPtyMode: boolean | undefined;

        describeBlock('Plain Suite', () => {
            registerTest('plain test', async ({ terminal }) => {
                // 普通模式不使用 PTY
                terminalPtyMode = terminal.isPtyMode?.();
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Plain Suite')!;
        await runSuite(suite, defaultOptions);

        expect(terminalPtyMode).toBe(false);
    });

    test('uses PTY-only for test with record:true but without CLI --record', async () => {
        let terminalPtyMode: boolean | undefined;
        let terminalRecording: boolean | undefined;

        describeBlock('Recordable Suite', { record: true }, () => {
            registerTest('pty test', async ({ terminal }) => {
                terminalPtyMode = terminal.isPtyMode?.();
                terminalRecording = terminal.isRecording?.();
            });
        });

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Recordable Suite')!;
        // config.record.enabled = false（默认）
        await runSuite(suite, defaultOptions);

        expect(terminalPtyMode).toBe(true);
        expect(terminalRecording).toBe(false);
    });

    test('uses Recording mode for test with record:true and CLI --record', async () => {
        let terminalRecording: boolean | undefined;
        let terminalPtyMode: boolean | undefined;

        describeBlock('Recording Suite', { record: true }, () => {
            registerTest('recording test', async ({ terminal }) => {
                terminalRecording = terminal.isRecording?.();
                terminalPtyMode = terminal.isPtyMode?.();
            });
        });

        const recordingOptions: RunnerOptions = {
            config: {
                record: { enabled: true },
                timeouts: { testMs: 5000 },
            } as any,
            artifactManager,
        };

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Recording Suite')!;
        await runSuite(suite, recordingOptions);

        expect(terminalRecording).toBe(true);
        expect(terminalPtyMode).toBe(true);
    });

    test('uses Bun.spawn for test without record flag even with CLI --record', async () => {
        let terminalPtyMode: boolean | undefined;
        let terminalRecording: boolean | undefined;

        describeBlock('Non-recordable Suite', () => {
            registerTest('non-recordable test', async ({ terminal }) => {
                terminalPtyMode = terminal.isPtyMode?.();
                terminalRecording = terminal.isRecording?.();
            });
        });

        const recordingOptions: RunnerOptions = {
            config: {
                record: { enabled: true },
                timeouts: { testMs: 5000 },
            } as any,
            artifactManager,
        };

        const suites = getTests();
        const suite = suites.find((s) => s.name === 'Non-recordable Suite')!;
        await runSuite(suite, recordingOptions);

        // 测试没有 record: true，即使 CLI 有 --record 也不启用 PTY
        expect(terminalPtyMode).toBe(false);
        expect(terminalRecording).toBe(false);
    });
});
