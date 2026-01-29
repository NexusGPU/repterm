/**
 * Unit tests for src/runner/scheduler.ts - Parallel test scheduler
 */

import { describe, test, expect } from 'bun:test';
import { Scheduler, createScheduler, runWithScheduler } from '../../src/runner/scheduler.js';
import { loadConfig } from '../../src/runner/config.js';

describe('Scheduler', () => {
    const defaultConfig = loadConfig({ parallel: { workers: 2 } });

    describe('constructor', () => {
        test('creates a scheduler with options', () => {
            const scheduler = new Scheduler({
                config: defaultConfig,
                artifactBaseDir: '/tmp/artifacts',
            });
            expect(scheduler).toBeInstanceOf(Scheduler);
        });
    });

    describe('run()', () => {
        test('throws error for single worker mode', async () => {
            const singleWorkerConfig = loadConfig({ parallel: { workers: 1 } });
            const scheduler = new Scheduler({
                config: singleWorkerConfig,
                artifactBaseDir: '/tmp/artifacts',
            });

            await expect(scheduler.run([])).rejects.toThrow('Scheduler should not be used for single worker');
        });
    });
});

describe('createScheduler', () => {
    test('creates a Scheduler instance', () => {
        const config = loadConfig({ parallel: { workers: 2 } });
        const scheduler = createScheduler({
            config,
            artifactBaseDir: '/tmp/artifacts',
        });
        expect(scheduler).toBeInstanceOf(Scheduler);
    });
});

describe('runWithScheduler', () => {
    test('throws error for single worker mode', async () => {
        const singleWorkerConfig = loadConfig({ parallel: { workers: 1 } });

        await expect(
            runWithScheduler([], {
                config: singleWorkerConfig,
                artifactBaseDir: '/tmp/artifacts',
            })
        ).rejects.toThrow('Use runAllSuites for single worker mode');
    });
});
