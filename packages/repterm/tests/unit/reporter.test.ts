/**
 * Unit tests for src/cli/reporter.ts - Test result reporting
 */

import { describe, test, expect, vi } from 'bun:test';
import { Reporter, createReporter } from '../../src/cli/reporter.js';
import type { RunResult } from '../../src/runner/models.js';

describe('Reporter', () => {
    describe('constructor', () => {
        test('creates reporter with default options', () => {
            const reporter = new Reporter();
            expect(reporter).toBeInstanceOf(Reporter);
        });

        test('creates reporter with custom options', () => {
            const reporter = new Reporter({ verbose: true, colors: false });
            expect(reporter).toBeInstanceOf(Reporter);
        });
    });

    describe('report()', () => {
        let consoleSpy: ReturnType<typeof vi.spyOn>;

        test('reports passing tests', () => {
            consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                {
                    id: 'result-1',
                    suiteId: 'suite-1',
                    caseId: 'test-1',
                    suiteName: 'My Suite',
                    caseName: 'my passing test',
                    status: 'pass',
                    durationMs: 100,
                    artifacts: [],
                    suitePath: ['My Suite'],
                },
            ];

            reporter.report(results);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('reports failing tests with error details', () => {
            consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                {
                    id: 'result-1',
                    suiteId: 'suite-1',
                    caseId: 'test-1',
                    suiteName: 'My Suite',
                    caseName: 'my failing test',
                    status: 'fail',
                    durationMs: 100,
                    error: {
                        message: 'Test failed',
                        expected: 'foo',
                        actual: 'bar',
                    },
                    artifacts: [],
                    suitePath: ['My Suite'],
                },
            ];

            reporter.report(results);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('prints terminal command logs in verbose mode', () => {
            const logs: string[] = [];
            consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
                if (msg) logs.push(String(msg));
            });

            const reporter = new Reporter({ verbose: true, colors: false });
            const results: RunResult[] = [
                {
                    id: 'result-1',
                    suiteId: 'suite-1',
                    caseId: 'test-1',
                    suiteName: 'My Suite',
                    caseName: 'my failing test',
                    status: 'fail',
                    durationMs: 100,
                    error: {
                        message: 'Test failed',
                        commandLogs: [
                            {
                                command: 'echo "hello from command"',
                                code: 0,
                                stdout: 'hello from command\n',
                                stderr: '',
                                output: 'hello from command\n',
                                duration: 8,
                            },
                        ],
                    },
                    artifacts: [],
                    suitePath: ['My Suite'],
                },
            ];

            reporter.report(results);

            expect(logs.some((l) => l.includes('Command logs'))).toBe(true);
            expect(logs.some((l) => l.includes('echo "hello from command"'))).toBe(true);

            consoleSpy.mockRestore();
        });

        test('reports skipped tests', () => {
            consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                {
                    id: 'result-1',
                    suiteId: 'suite-1',
                    caseId: 'test-1',
                    suiteName: 'My Suite',
                    caseName: 'my skipped test',
                    status: 'skip',
                    durationMs: 0,
                    artifacts: [],
                    suitePath: ['My Suite'],
                },
            ];

            reporter.report(results);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('prints summary with Tests info', () => {
            const logs: string[] = [];
            consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
                if (msg) logs.push(String(msg));
            });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                { id: 'r1', suiteId: 's1', caseId: 't1', suiteName: 'Suite', caseName: 'test1', status: 'pass', durationMs: 10, artifacts: [], suitePath: ['Suite'] },
                { id: 'r2', suiteId: 's1', caseId: 't2', suiteName: 'Suite', caseName: 'test2', status: 'pass', durationMs: 20, artifacts: [], suitePath: ['Suite'] },
                { id: 'r3', suiteId: 's1', caseId: 't3', suiteName: 'Suite', caseName: 'test3', status: 'fail', durationMs: 30, error: { message: 'err' }, artifacts: [], suitePath: ['Suite'] },
            ];

            reporter.report(results);

            // Should contain Tests and passed/failed info
            const testsLog = logs.find((l) => l.includes('Tests'));
            expect(testsLog).toBeDefined();

            consoleSpy.mockRestore();
        });

        test('groups tests by suite name', () => {
            const logs: string[] = [];
            consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
                if (msg) logs.push(String(msg));
            });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                { id: 'r1', suiteId: 's1', caseId: 't1', suiteName: 'Suite A', caseName: 'test1', status: 'pass', durationMs: 10, artifacts: [], suitePath: ['Suite A'] },
                { id: 'r2', suiteId: 's2', caseId: 't2', suiteName: 'Suite B', caseName: 'test2', status: 'pass', durationMs: 20, artifacts: [], suitePath: ['Suite B'] },
            ];

            reporter.report(results);

            // Should contain both suite names
            expect(logs.some((l) => l.includes('Suite A'))).toBe(true);
            expect(logs.some((l) => l.includes('Suite B'))).toBe(true);

            consoleSpy.mockRestore();
        });

        test('displays test names instead of IDs', () => {
            const logs: string[] = [];
            consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
                if (msg) logs.push(String(msg));
            });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                { id: 'r1', suiteId: 's1', caseId: 'abc123', suiteName: 'Suite', caseName: 'echo command test', status: 'pass', durationMs: 10, artifacts: [], suitePath: ['Suite'] },
            ];

            reporter.report(results);

            // Should show test name, not ID
            expect(logs.some((l) => l.includes('echo command test'))).toBe(true);
            expect(logs.some((l) => l.includes('abc123'))).toBe(false);

            consoleSpy.mockRestore();
        });

        test('displays recording path for each test when available', () => {
            const logs: string[] = [];
            consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
                if (msg) logs.push(String(msg));
            });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                {
                    id: 'r1',
                    suiteId: 's1',
                    caseId: 't1',
                    suiteName: 'Suite',
                    caseName: 'test with recording',
                    status: 'pass',
                    durationMs: 100,
                    artifacts: [],
                    recordingPath: 'artifacts/run-123/test1.cast',
                    suitePath: ['Suite'],
                },
            ];

            reporter.report(results);

            // Should display the recording path
            expect(logs.some((l) => l.includes('artifacts/run-123/test1.cast'))).toBe(true);

            consoleSpy.mockRestore();
        });

        test('does not display recording path when not available', () => {
            const logs: string[] = [];
            consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
                if (msg) logs.push(String(msg));
            });

            const reporter = new Reporter({ colors: false });
            const results: RunResult[] = [
                {
                    id: 'r1',
                    suiteId: 's1',
                    caseId: 't1',
                    suiteName: 'Suite',
                    caseName: 'test without recording',
                    status: 'pass',
                    durationMs: 100,
                    artifacts: [],
                    suitePath: ['Suite'],
                },
            ];

            reporter.report(results);

            // Should not display any recording path text
            expect(logs.some((l) => l.includes('.cast'))).toBe(false);

            consoleSpy.mockRestore();
        });
    });
});

describe('createReporter', () => {
    test('creates a Reporter instance', () => {
        const reporter = createReporter();
        expect(reporter).toBeInstanceOf(Reporter);
    });

    test('passes options to Reporter', () => {
        const reporter = createReporter({ verbose: true });
        expect(reporter).toBeInstanceOf(Reporter);
    });
});
