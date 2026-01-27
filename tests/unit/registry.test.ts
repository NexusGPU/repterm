/**
 * Unit tests for src/api/test.ts - TestRegistry
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { registry, test as registerTest, getTests, clearTests } from '../../src/api/test.js';

describe('TestRegistry', () => {
    beforeEach(() => {
        clearTests();
    });

    describe('registerTest', () => {
        test('registers a test case to the default suite', () => {
            const fn = async () => { };
            registerTest('my test', fn);

            const suites = getTests();
            expect(suites).toHaveLength(1);
            expect(suites[0].name).toBe('default');
            expect(suites[0].tests).toHaveLength(1);
            expect(suites[0].tests[0].name).toBe('my test');
            expect(suites[0].tests[0].fn).toBe(fn);
        });

        test('registers multiple tests to the same suite', () => {
            registerTest('test 1', async () => { });
            registerTest('test 2', async () => { });
            registerTest('test 3', async () => { });

            const suites = getTests();
            expect(suites[0].tests).toHaveLength(3);
        });

        test('generates unique IDs for each test', () => {
            registerTest('test 1', async () => { });
            registerTest('test 2', async () => { });

            const suites = getTests();
            const id1 = suites[0].tests[0].id;
            const id2 = suites[0].tests[1].id;
            expect(id1).not.toBe(id2);
        });
    });

    describe('getSuites', () => {
        test('returns array of suites', () => {
            const suites = getTests();
            expect(Array.isArray(suites)).toBe(true);
        });

        test('default suite exists after init', () => {
            const suites = getTests();
            expect(suites.length).toBeGreaterThanOrEqual(1);
            expect(suites.some(s => s.name === 'default')).toBe(true);
        });
    });

    describe('getSuite', () => {
        test('returns suite by ID', () => {
            const suite = registry.getSuite('default');
            expect(suite).toBeDefined();
            expect(suite?.name).toBe('default');
        });

        test('returns undefined for non-existent suite', () => {
            const suite = registry.getSuite('non-existent');
            expect(suite).toBeUndefined();
        });
    });

    describe('setCurrentSuite / resetCurrentSuite', () => {
        test('sets and resets current suite', () => {
            const customSuite = {
                id: 'custom-suite',
                name: 'Custom Suite',
                tests: [],
                config: {},
            };

            registry.setCurrentSuite(customSuite);
            registerTest('test in custom suite', async () => { });

            const suite = registry.getSuite('custom-suite');
            expect(suite?.tests).toHaveLength(1);

            registry.resetCurrentSuite();
            registerTest('test in default suite', async () => { });

            const defaultSuite = registry.getSuite('default');
            expect(defaultSuite?.tests).toHaveLength(1);
        });
    });

    describe('clear', () => {
        test('clears all tests and suites', () => {
            registerTest('test 1', async () => { });
            registerTest('test 2', async () => { });

            clearTests();

            const suites = getTests();
            expect(suites).toHaveLength(1);
            expect(suites[0].tests).toHaveLength(0);
        });
    });

    describe('setCurrentFile', () => {
        test('creates a suite named after the file', () => {
            registry.setCurrentFile('/path/to/example.ts');
            registerTest('test in file suite', async () => { });

            const suites = getTests();
            const fileSuite = suites.find(s => s.name === 'example.ts');
            expect(fileSuite).toBeDefined();
            expect(fileSuite?.tests).toHaveLength(1);
            expect(fileSuite?.tests[0].name).toBe('test in file suite');
        });

        test('creates separate suites for different files', () => {
            registry.setCurrentFile('/path/to/file1.ts');
            registerTest('test 1', async () => { });

            registry.setCurrentFile('/path/to/file2.ts');
            registerTest('test 2', async () => { });

            const suites = getTests();
            const file1Suite = suites.find(s => s.name === 'file1.ts');
            const file2Suite = suites.find(s => s.name === 'file2.ts');

            expect(file1Suite).toBeDefined();
            expect(file2Suite).toBeDefined();
            expect(file1Suite?.tests).toHaveLength(1);
            expect(file2Suite?.tests).toHaveLength(1);
        });

        test('reuses existing file suite when setting same file', () => {
            registry.setCurrentFile('/path/to/example.ts');
            registerTest('test 1', async () => { });

            registry.setCurrentFile('/path/to/example.ts');
            registerTest('test 2', async () => { });

            const suites = getTests();
            const fileSuites = suites.filter(s => s.name === 'example.ts');
            expect(fileSuites).toHaveLength(1);
            expect(fileSuites[0].tests).toHaveLength(2);
        });
    });

    describe('describe within file', () => {
        test('creates nested suite within file suite', async () => {
            // Import describe function
            const { describe: describeBlock } = await import('../../src/api/describe.js');

            registry.setCurrentFile('/path/to/example.ts');

            describeBlock('My Feature', () => {
                registerTest('test in describe', async () => { });
            });

            const suites = getTests();
            // Should have file suite AND describe suite
            const describeSuite = suites.find(s => s.name === 'My Feature');
            expect(describeSuite).toBeDefined();
            expect(describeSuite?.tests).toHaveLength(1);
        });
    });
});
