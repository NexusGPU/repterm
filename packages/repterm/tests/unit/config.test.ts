/**
 * Unit tests for src/runner/config.ts - Configuration loading
 */

import { describe, test, expect } from 'bun:test';
import { loadConfig, getDefaultConfig } from '../../src/runner/config.js';

describe('loadConfig', () => {
    test('returns default config when no options provided', () => {
        const config = loadConfig();

        expect(config.timeouts.suiteMs).toBe(300000);
        expect(config.timeouts.testMs).toBe(30000);
        expect(config.record.enabled).toBe(false);
        expect(config.parallel.workers).toBe(1);
    });

    test('merges user options with defaults', () => {
        const config = loadConfig({
            timeouts: { testMs: 5000 },
            record: { enabled: true },
        });

        expect(config.timeouts.suiteMs).toBe(300000); // default
        expect(config.timeouts.testMs).toBe(5000); // overridden
        expect(config.record.enabled).toBe(true); // overridden
        expect(config.parallel.workers).toBe(1); // default
    });

    test('allows setting all options', () => {
        const config = loadConfig({
            timeouts: {
                suiteMs: 600000,
                testMs: 60000,
            },
            record: {
                enabled: true,
                castFile: 'recording.cast',
            },
            parallel: {
                workers: 4,
            },
        });

        expect(config.timeouts.suiteMs).toBe(600000);
        expect(config.timeouts.testMs).toBe(60000);
        expect(config.record.enabled).toBe(true);
        expect(config.record.castFile).toBe('recording.cast');
        expect(config.parallel.workers).toBe(4);
    });

    describe('validation', () => {
        test('throws if suite timeout is not positive', () => {
            expect(() => loadConfig({
                timeouts: { suiteMs: 0 },
            })).toThrow('Suite timeout must be a positive integer');

            expect(() => loadConfig({
                timeouts: { suiteMs: -1 },
            })).toThrow('Suite timeout must be a positive integer');
        });

        test('throws if test timeout is not positive', () => {
            expect(() => loadConfig({
                timeouts: { testMs: 0 },
            })).toThrow('Test timeout must be a positive integer');

            expect(() => loadConfig({
                timeouts: { testMs: -1 },
            })).toThrow('Test timeout must be a positive integer');
        });

        test('throws if workers is less than 1', () => {
            expect(() => loadConfig({
                parallel: { workers: 0 },
            })).toThrow('Worker count must be at least 1');

            expect(() => loadConfig({
                parallel: { workers: -1 },
            })).toThrow('Worker count must be at least 1');
        });

        test('throws if test timeout exceeds suite timeout', () => {
            expect(() => loadConfig({
                timeouts: {
                    suiteMs: 1000,
                    testMs: 2000,
                },
            })).toThrow('Test timeout cannot exceed suite timeout');
        });
    });
});

describe('getDefaultConfig', () => {
    test('returns a copy of default configuration', () => {
        const config1 = getDefaultConfig();
        const config2 = getDefaultConfig();

        expect(config1).toEqual(config2);
        expect(config1).not.toBe(config2); // Should be a copy
    });

    test('default config has expected values', () => {
        const config = getDefaultConfig();

        expect(config.timeouts.suiteMs).toBe(300000);
        expect(config.timeouts.testMs).toBe(30000);
        expect(config.record.enabled).toBe(false);
        expect(config.parallel.workers).toBe(1);
    });
});
