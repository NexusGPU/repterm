/**
 * Unit tests for src/runner/artifacts.ts - Artifact management
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
    ArtifactManager,
    generateRunId,
    createArtifactManager,
} from '../../src/runner/artifacts.js';

describe('generateRunId', () => {
    test('generates a unique run ID', () => {
        const id1 = generateRunId();
        const id2 = generateRunId();

        expect(id1).not.toBe(id2);
    });

    test('run ID contains timestamp and random part', () => {
        const id = generateRunId();
        expect(id).toMatch(/^[a-z0-9]+-[a-f0-9]+$/);
    });
});

describe('ArtifactManager', () => {
    const testBaseDir = '/tmp/repterm-test-artifacts';
    const testRunId = 'test-run-123';
    let manager: ArtifactManager;

    beforeEach(() => {
        manager = new ArtifactManager({
            baseDir: testBaseDir,
            runId: testRunId,
        });
    });

    afterEach(() => {
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
    });

    describe('constructor', () => {
        test('creates manager with config', () => {
            expect(manager.getBaseDir()).toBe(testBaseDir);
            expect(manager.getRunId()).toBe(testRunId);
        });
    });

    describe('init()', () => {
        test('creates the run directory', () => {
            manager.init();
            expect(existsSync(join(testBaseDir, testRunId))).toBe(true);
        });

        test('does not throw if directory already exists', () => {
            manager.init();
            expect(() => manager.init()).not.toThrow();
        });
    });

    describe('getCastPath()', () => {
        test('returns path for cast file', () => {
            const path = manager.getCastPath('test-1');
            expect(path).toBe(join(testBaseDir, testRunId, 'test-1.cast'));
        });
    });

    describe('getLogPath()', () => {
        test('returns path for log file', () => {
            const path = manager.getLogPath('test-1');
            expect(path).toBe(join(testBaseDir, testRunId, 'test-1.log'));
        });
    });

    describe('getSnapshotPath()', () => {
        test('returns path for snapshot file', () => {
            const path = manager.getSnapshotPath('test-1', 0);
            expect(path).toBe(join(testBaseDir, testRunId, 'test-1-snapshot-0.txt'));
        });

        test('includes snapshot index in path', () => {
            const path = manager.getSnapshotPath('test-1', 5);
            expect(path).toBe(join(testBaseDir, testRunId, 'test-1-snapshot-5.txt'));
        });
    });

    describe('getRunDir()', () => {
        test('returns the run directory path', () => {
            const runDir = manager.getRunDir();
            expect(runDir).toBe(join(testBaseDir, testRunId));
        });
    });

    describe('ensureDir()', () => {
        test('creates directory for file path', () => {
            const filePath = join(testBaseDir, 'nested', 'dir', 'file.txt');
            ArtifactManager.ensureDir(filePath);
            expect(existsSync(join(testBaseDir, 'nested', 'dir'))).toBe(true);
        });
    });
});

describe('createArtifactManager', () => {
    const testBaseDir = '/tmp/repterm-test-artifacts-2';

    afterEach(() => {
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
    });

    test('creates manager with generated run ID', () => {
        const manager = createArtifactManager(testBaseDir);
        expect(manager.getBaseDir()).toBe(testBaseDir);
        expect(manager.getRunId()).toBeTruthy();
    });

    test('uses default base dir when not specified', () => {
        const manager = createArtifactManager();
        expect(manager.getBaseDir()).toBe('/tmp/repterm');
    });
});
