/**
 * Unit tests for src/recording/recorder.ts - Asciinema recording
 */

import { describe, test, expect } from 'bun:test';
import { Recorder, createRecorder, checkAsciinemaAvailable } from '../../src/recording/recorder.js';

describe('Recorder', () => {
    describe('constructor', () => {
        test('creates a Recorder with config', () => {
            const recorder = new Recorder({
                castFile: '/tmp/test.cast',
                cols: 120,
                rows: 40,
            });
            expect(recorder).toBeInstanceOf(Recorder);
        });
    });

    describe('isRecording()', () => {
        test('returns false initially', () => {
            const recorder = new Recorder({ castFile: '/tmp/test.cast' });
            expect(recorder.isRecording()).toBe(false);
        });
    });

    describe('getCastFile()', () => {
        test('returns the cast file path', () => {
            const recorder = new Recorder({ castFile: '/path/to/file.cast' });
            expect(recorder.getCastFile()).toBe('/path/to/file.cast');
        });
    });

    describe('stop()', () => {
        test('does not throw when not recording', () => {
            const recorder = new Recorder({ castFile: '/tmp/test.cast' });
            expect(() => recorder.stop()).not.toThrow();
        });
    });

    describe('start()', () => {
        test('throws if already recording', async () => {
            // This test only makes sense if asciinema is available
            // We'll just test the error condition by calling start twice when it would fail
            const recorder = new Recorder({ castFile: '/tmp/nonexistent-path.cast' });

            // First start will either succeed or fail depending on asciinema availability
            // What we're testing is start() when already recording
            const available = await checkAsciinemaAvailable();
            if (!available) {
                // If asciinema is not available, skip this test
                return;
            }

            // If available, we test that calling start twice throws
            try {
                recorder.start();
                expect(() => recorder.start()).toThrow('Recording already started');
            } finally {
                recorder.stop();
            }
        });
    });
});

describe('createRecorder', () => {
    test('creates a Recorder instance', () => {
        const recorder = createRecorder({ castFile: '/tmp/test.cast' });
        expect(recorder).toBeInstanceOf(Recorder);
    });

    test('passes config options', () => {
        const recorder = createRecorder({
            castFile: '/tmp/test.cast',
            cols: 80,
            rows: 24,
            command: '/bin/bash',
        });
        expect(recorder.getCastFile()).toBe('/tmp/test.cast');
    });
});

describe('checkAsciinemaAvailable', () => {
    test('returns boolean indicating availability', async () => {
        const available = await checkAsciinemaAvailable();
        expect(typeof available).toBe('boolean');
    });
});
