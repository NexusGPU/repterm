
import { describe, test, expect, vi } from 'bun:test';
import { runSuite } from '../../src/runner/runner.js';
import type { TestSuite, TestCase, RunResult } from '../../src/runner/models.js';
import type { RunnerOptions } from '../../src/runner/runner.js';
import { ArtifactManager } from '../../src/runner/artifacts.js';

describe('Runner Streaming', () => {
    test('calls onResult callback immediately after test finishes', async () => {
        // Mock data
        const testCase: TestCase = {
            id: 'test-1',
            name: 'test 1',
            fn: async () => { },
            timeout: 1000,
            fixtures: {},
            steps: [],
        };

        const suite: TestSuite = {
            id: 'suite-1',
            name: 'Suite 1',
            tests: [testCase],
            parent: undefined,
            config: {},
        };

        const config: any = {
            record: { enabled: false },
            timeouts: { testMs: 1000 },
        };

        const artifactManager = new ArtifactManager({
            baseDir: 'tmp/artifacts',
            runId: 'test-run'
        });
        vi.spyOn(artifactManager, 'getCastPath').mockReturnValue('path/to/cast');

        // Mock onResult
        const onResultObj = {
            fn: (result: RunResult) => { }
        };
        const onResultSpy = vi.spyOn(onResultObj, 'fn');

        const options: RunnerOptions = {
            config,
            artifactManager,
            onResult: onResultObj.fn,
        };

        // Run suite
        await runSuite(suite, options);

        // Verify callback
        expect(onResultSpy).toHaveBeenCalledTimes(1);
        const result = onResultSpy.mock.calls[0][0];
        expect(result.caseId).toBe('test-1');
        expect(result.status).toBe('pass');
    });
});
