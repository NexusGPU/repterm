/**
 * Integration tests for Worker module
 * Tests worker process creation and management
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { Worker, createWorker } from '../../src/runner/worker.js';
import { loadConfig } from '../../src/runner/config.js';
import type { TestSuite } from '../../src/runner/models.js';

describe('Worker Integration', () => {
    let worker: Worker | null = null;

    afterEach(() => {
        if (worker) {
            worker.stop();
            worker = null;
        }
    });

    describe('Worker class', () => {
        test('creates worker with config', () => {
            const config = loadConfig({ parallel: { workers: 2 } });
            worker = new Worker({
                workerId: 0,
                config,
                artifactBaseDir: '/tmp/artifacts',
            });

            expect(worker).toBeInstanceOf(Worker);
            expect(worker.getWorkerId()).toBe(0);
        });

        test('isBusy() returns false initially', () => {
            const config = loadConfig();
            worker = new Worker({
                workerId: 1,
                config,
                artifactBaseDir: '/tmp/artifacts',
            });

            expect(worker.isBusy()).toBe(false);
        });

        test('stop() handles no started worker', () => {
            const config = loadConfig();
            worker = new Worker({
                workerId: 2,
                config,
                artifactBaseDir: '/tmp/artifacts',
            });

            // Should not throw
            expect(() => worker!.stop()).not.toThrow();
        });

        test('runSuite() throws when worker not started', () => {
            const config = loadConfig();
            worker = new Worker({
                workerId: 3,
                config,
                artifactBaseDir: '/tmp/artifacts',
            });

            const suite: TestSuite = {
                id: 'test-suite',
                name: 'Test Suite',
                tests: [],
                config: {},
            };

            expect(() => worker!.runSuite(suite)).toThrow('Worker not started');
        });
    });

    describe('createWorker()', () => {
        test('creates a Worker instance', () => {
            const config = loadConfig();
            worker = createWorker({
                workerId: 0,
                config,
                artifactBaseDir: '/tmp/artifacts',
            });

            expect(worker).toBeInstanceOf(Worker);
        });
    });
});
