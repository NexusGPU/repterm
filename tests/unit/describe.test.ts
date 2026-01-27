/**
 * Unit tests for src/api/describe.ts - Test suite grouping
 */

import { describe as describeVitest, test, expect, beforeEach } from 'bun:test';
import { describe } from '../../src/api/describe.js';
import { registry, clearTests, test as registerTest, getTests } from '../../src/api/test.js';

describeVitest('describe()', () => {
    beforeEach(() => {
        clearTests();
    });

    test('creates a named test suite', () => {
        describe('My Suite', () => {
            registerTest('test in suite', async () => { });
        });

        const suites = getTests();
        const mySuite = suites.find((s) => s.name === 'My Suite');

        expect(mySuite).toBeDefined();
        expect(mySuite?.tests).toHaveLength(1);
        expect(mySuite?.tests[0].name).toBe('test in suite');
    });

    test('registers tests to the suite while inside describe block', () => {
        describe('Suite A', () => {
            registerTest('test 1', async () => { });
            registerTest('test 2', async () => { });
        });

        const suites = getTests();
        const suiteA = suites.find((s) => s.name === 'Suite A');

        expect(suiteA?.tests).toHaveLength(2);
    });

    test('resets to default suite after describe block', () => {
        describe('Suite A', () => {
            registerTest('test in A', async () => { });
        });

        registerTest('test in default', async () => { });

        const suites = getTests();
        const defaultSuite = suites.find((s) => s.name === 'default');

        expect(defaultSuite?.tests).toHaveLength(1);
        expect(defaultSuite?.tests[0].name).toBe('test in default');
    });

    test('supports multiple describe blocks', () => {
        describe('Suite 1', () => {
            registerTest('test 1', async () => { });
        });

        describe('Suite 2', () => {
            registerTest('test 2', async () => { });
        });

        const suites = getTests();
        expect(suites.find((s) => s.name === 'Suite 1')).toBeDefined();
        expect(suites.find((s) => s.name === 'Suite 2')).toBeDefined();
    });

    test('generates unique IDs for each suite', () => {
        describe('Suite 1', () => { });
        describe('Suite 2', () => { });

        const suites = getTests();
        const suite1 = suites.find((s) => s.name === 'Suite 1');
        const suite2 = suites.find((s) => s.name === 'Suite 2');

        expect(suite1?.id).not.toBe(suite2?.id);
    });

    test('supports nested describe blocks', () => {
        describe('Parent Suite', () => {
            registerTest('parent test', async () => { });

            describe('Child Suite', () => {
                registerTest('child test', async () => { });
            });
        });

        const suites = getTests();
        const parentSuite = suites.find((s) => s.name === 'Parent Suite');

        expect(parentSuite).toBeDefined();
        expect(parentSuite?.tests).toHaveLength(1);
        expect(parentSuite?.tests[0].name).toBe('parent test');
        expect(parentSuite?.suites).toHaveLength(1);
        expect(parentSuite?.suites?.[0].name).toBe('Child Suite');
        expect(parentSuite?.suites?.[0].tests).toHaveLength(1);
        expect(parentSuite?.suites?.[0].tests[0].name).toBe('child test');
    });

    test('supports deeply nested describe blocks', () => {
        describe('Level 1', () => {
            registerTest('L1 test', async () => { });

            describe('Level 2', () => {
                registerTest('L2 test', async () => { });

                describe('Level 3', () => {
                    registerTest('L3 test', async () => { });
                });
            });
        });

        const suites = getTests();
        const level1 = suites.find((s) => s.name === 'Level 1');

        expect(level1).toBeDefined();
        expect(level1?.suites).toHaveLength(1);

        const level2 = level1?.suites?.[0];
        expect(level2?.name).toBe('Level 2');
        expect(level2?.tests).toHaveLength(1);
        expect(level2?.suites).toHaveLength(1);

        const level3 = level2?.suites?.[0];
        expect(level3?.name).toBe('Level 3');
        expect(level3?.tests).toHaveLength(1);
        expect(level3?.tests[0].name).toBe('L3 test');
    });

    test('returns to correct parent after nested describe', () => {
        describe('Parent', () => {
            describe('Child 1', () => {
                registerTest('child 1 test', async () => { });
            });

            registerTest('parent test after child', async () => { });

            describe('Child 2', () => {
                registerTest('child 2 test', async () => { });
            });
        });

        const suites = getTests();
        const parent = suites.find((s) => s.name === 'Parent');

        expect(parent?.tests).toHaveLength(1);
        expect(parent?.tests[0].name).toBe('parent test after child');
        expect(parent?.suites).toHaveLength(2);
        expect(parent?.suites?.[0].name).toBe('Child 1');
        expect(parent?.suites?.[1].name).toBe('Child 2');
    });
});
