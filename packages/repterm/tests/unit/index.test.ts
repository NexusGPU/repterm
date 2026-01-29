/**
 * Unit tests for src/index.ts - Public API exports
 */

import { describe, test, expect } from 'bun:test';
import * as repterm from '../../src/index.js';

describe('repterm public API', () => {
    describe('core exports', () => {
        test('exports test function', () => {
            expect(repterm.test).toBeTypeOf('function');
        });

        test('exports expect function', () => {
            expect(repterm.expect).toBeTypeOf('function');
        });

        test('exports describe function', () => {
            expect(repterm.describe).toBeTypeOf('function');
        });

        test('exports step function', () => {
            expect(repterm.step).toBeTypeOf('function');
        });

        test('exports getTests function', () => {
            expect(repterm.getTests).toBeTypeOf('function');
        });

        test('exports clearTests function', () => {
            expect(repterm.clearTests).toBeTypeOf('function');
        });
    });

    describe('hooks exports', () => {
        test('exports beforeEach function', () => {
            expect(repterm.beforeEach).toBeTypeOf('function');
        });

        test('exports afterEach function', () => {
            expect(repterm.afterEach).toBeTypeOf('function');
        });

        test('exports fixture function', () => {
            expect(repterm.fixture).toBeTypeOf('function');
        });
    });

    describe('test.step syntax', () => {
        test('test has step method attached', () => {
            expect((repterm.test as unknown as Record<string, unknown>).step).toBeTypeOf('function');
        });

        test('test has describe method attached', () => {
            expect((repterm.test as unknown as Record<string, unknown>).describe).toBeTypeOf('function');
        });
    });
});
