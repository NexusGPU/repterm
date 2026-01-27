/**
 * Integration tests for runner module
 * Tests the full test execution pipeline
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { runSuite, runTest, runAllSuites } from '../../src/runner/runner.js';
import { createArtifactManager } from '../../src/runner/artifacts.js';
import { loadConfig } from '../../src/runner/config.js';
import { sleep } from '../../src/utils/timing.js';
import type { TestSuite, TestCase, TestContext } from '../../src/runner/models.js';

describe('Runner Integration', () => {
    let artifactManager: ReturnType<typeof createArtifactManager>;

    beforeEach(() => {
        artifactManager = createArtifactManager('/tmp/repterm-test-artifacts');
        artifactManager.init();
    });

    afterEach(async () => {
        // Cleanup is handled by temp directory
    });

    describe('runTest()', () => {
        test('executes a passing test and returns pass result', async () => {
            const testCase: TestCase = {
                id: 'test-pass-1',
                name: 'should pass',
                steps: [],
                fn: async (ctx: TestContext) => {
                    // Simple test that passes
                    expect(ctx.terminal).toBeDefined();
                },
            };

            const suite: TestSuite = {
                id: 'suite-1',
                name: 'Test Suite',
                tests: [testCase],
                config: {},
            };

            const config = loadConfig({ record: { enabled: false } });
            const result = await runTest(testCase, suite, { config, artifactManager });

            expect(result.status).toBe('pass');
            expect(result.suiteId).toBe('suite-1');
            expect(result.caseId).toBe('test-pass-1');
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
        }, 10000);

        test('executes a failing test and returns fail result', async () => {
            const testCase: TestCase = {
                id: 'test-fail-1',
                name: 'should fail',
                steps: [],
                fn: async () => {
                    throw new Error('Test intentionally failed');
                },
            };

            const suite: TestSuite = {
                id: 'suite-2',
                name: 'Failing Suite',
                tests: [testCase],
                config: {},
            };

            const config = loadConfig({ record: { enabled: false } });
            const result = await runTest(testCase, suite, { config, artifactManager });

            expect(result.status).toBe('fail');
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('Test intentionally failed');
        }, 10000);

        test('respects test timeout', async () => {
            const testCase: TestCase = {
                id: 'test-timeout-1',
                name: 'should timeout',
                steps: [],
                timeout: 500, // 500ms timeout
                fn: async () => {
                    // Wait longer than timeout
                    await sleep(2000);
                },
            };

            const suite: TestSuite = {
                id: 'suite-3',
                name: 'Timeout Suite',
                tests: [testCase],
                config: {},
            };

            const config = loadConfig({ record: { enabled: false } });
            const result = await runTest(testCase, suite, { config, artifactManager });

            expect(result.status).toBe('fail');
            expect(result.error?.message).toContain('timeout');
        }, 10000);
    });

    describe('runSuite()', () => {
        test('executes all tests in a suite', async () => {
            const testCase1: TestCase = {
                id: 'test-1',
                name: 'first test',
                steps: [],
                fn: async () => {
                    // passes
                },
            };

            const testCase2: TestCase = {
                id: 'test-2',
                name: 'second test',
                steps: [],
                fn: async () => {
                    // passes
                },
            };

            const suite: TestSuite = {
                id: 'suite-multi',
                name: 'Multi Test Suite',
                tests: [testCase1, testCase2],
                config: {},
            };

            const config = loadConfig({ record: { enabled: false } });
            const results = await runSuite(suite, { config, artifactManager });

            expect(results).toHaveLength(2);
            expect(results[0].status).toBe('pass');
            expect(results[1].status).toBe('pass');
        }, 15000);

        test('continues after a failing test', async () => {
            const failTest: TestCase = {
                id: 'test-fail',
                name: 'fails',
                steps: [],
                fn: async () => {
                    throw new Error('Fail');
                },
            };

            const passTest: TestCase = {
                id: 'test-pass',
                name: 'passes',
                steps: [],
                fn: async () => {
                    // passes
                },
            };

            const suite: TestSuite = {
                id: 'suite-mixed',
                name: 'Mixed Suite',
                tests: [failTest, passTest],
                config: {},
            };

            const config = loadConfig({ record: { enabled: false } });
            const results = await runSuite(suite, { config, artifactManager });

            expect(results).toHaveLength(2);
            expect(results[0].status).toBe('fail');
            expect(results[1].status).toBe('pass');
        }, 15000);
    });

    describe('runAllSuites()', () => {
        test('executes multiple suites', async () => {
            const suite1: TestSuite = {
                id: 'suite-a',
                name: 'Suite A',
                config: {},
                tests: [
                    {
                        id: 'test-a1',
                        name: 'test a1',
                        steps: [],
                        fn: async () => { },
                    },
                ],
            };

            const suite2: TestSuite = {
                id: 'suite-b',
                name: 'Suite B',
                config: {},
                tests: [
                    {
                        id: 'test-b1',
                        name: 'test b1',
                        steps: [],
                        fn: async () => { },
                    },
                ],
            };

            const config = loadConfig({ record: { enabled: false } });
            const results = await runAllSuites([suite1, suite2], { config, artifactManager });

            expect(results).toHaveLength(2);
            expect(results.every((r) => r.status === 'pass')).toBe(true);
        }, 15000);
    });
});
