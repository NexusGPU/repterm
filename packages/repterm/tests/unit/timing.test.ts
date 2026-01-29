/**
 * Unit tests for src/utils/timing.ts - Timer and utilities
 */

import { describe, test, expect } from 'bun:test';
import { Timer, createTimer, measure, measureAsync, formatDuration, sleep } from '../../src/utils/timing.js';

describe('Timer', () => {
    test('creates a timer that starts immediately', () => {
        const timer = new Timer();
        expect(timer.isRunning()).toBe(true);
    });

    test('elapsed() returns time since creation', async () => {
        const timer = new Timer();
        await sleep(50);
        const elapsed = timer.elapsed();
        expect(elapsed).toBeGreaterThanOrEqual(45);
    }, 5000);

    test('stop() stops the timer and returns duration', async () => {
        const timer = new Timer();
        await sleep(50);
        const duration = timer.stop();
        expect(duration).toBeGreaterThanOrEqual(45);
        expect(timer.isRunning()).toBe(false);
    }, 5000);

    test('duration() returns stopped time', async () => {
        const timer = new Timer();
        await sleep(50);
        timer.stop();
        const duration = timer.duration();
        expect(duration).toBeGreaterThanOrEqual(45);
    }, 5000);

    test('duration() throws if timer not stopped', () => {
        const timer = new Timer();
        expect(() => timer.duration()).toThrow('Timer not stopped');
    });

    test('isRunning() returns false after stop', () => {
        const timer = new Timer();
        expect(timer.isRunning()).toBe(true);
        timer.stop();
        expect(timer.isRunning()).toBe(false);
    });
});

describe('createTimer', () => {
    test('creates and returns a new Timer', () => {
        const timer = createTimer();
        expect(timer).toBeInstanceOf(Timer);
        expect(timer.isRunning()).toBe(true);
    });
});

describe('measure', () => {
    test('measures sync function execution time', () => {
        const { result, duration } = measure(() => {
            let sum = 0;
            for (let i = 0; i < 1000; i++) sum += i;
            return sum;
        });

        expect(result).toBe(499500);
        expect(duration).toBeGreaterThanOrEqual(0);
    });

    test('returns the function result', () => {
        const { result } = measure(() => 'hello');
        expect(result).toBe('hello');
    });
});

describe('measureAsync', () => {
    test('measures async function execution time', async () => {
        const { result, duration } = await measureAsync(async () => {
            await sleep(50);
            return 42;
        });

        expect(result).toBe(42);
        expect(duration).toBeGreaterThanOrEqual(45);
    }, 5000);
});

describe('formatDuration', () => {
    test('formats milliseconds', () => {
        expect(formatDuration(100)).toBe('100ms');
        expect(formatDuration(999)).toBe('999ms');
    });

    test('formats seconds', () => {
        expect(formatDuration(1000)).toBe('1.00s');
        expect(formatDuration(5500)).toBe('5.50s');
        expect(formatDuration(59999)).toBe('60.00s');
    });

    test('formats minutes', () => {
        expect(formatDuration(60000)).toBe('1m 0s');
        expect(formatDuration(90000)).toBe('1m 30s');
        expect(formatDuration(125000)).toBe('2m 5s');
    });
});

describe('sleep', () => {
    test('sleeps for the specified duration', async () => {
        const start = Date.now();
        await sleep(100);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(95);
    }, 5000);
});
