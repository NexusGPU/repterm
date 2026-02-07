/**
 * Test filtering logic
 * Filters tests based on --record flag and record configuration
 */

import type { TestCase, TestSuite } from './models.js';

/**
 * Determine whether test should run in current mode
 *
 * Execution strategy:
 * - recordMode = false (normal mode): run all tests (including record: true tests)
 * - recordMode = true (recording mode): run only tests marked with record: true
 *
 * @param testCase Test case
 * @param suite Test suite
 * @param recordMode Whether in recording mode (--record)
 */
export function shouldRunTest(
  testCase: TestCase,
  suite: TestSuite,
  recordMode: boolean
): boolean {
  // Determine test record configuration: test > suite > undefined
  const testRecordConfig = testCase.options?.record ?? getInheritedRecordConfig(suite);

  // In normal mode run all tests
  if (!recordMode) {
    return true;
  }

  // In recording mode run only tests marked with record: true
  return testRecordConfig === true;
}

/**
 * Get inherited record configuration from suite
 * Recursively searches parent suites for configuration
 */
function getInheritedRecordConfig(suite: TestSuite): boolean | undefined {
  // Check current suite configuration first
  if (suite.options?.record !== undefined) {
    return suite.options.record;
  }

  // Search parent suite
  if (suite.parent) {
    return getInheritedRecordConfig(suite.parent);
  }

  return undefined;
}

/**
 * Filter test suites, removing tests that should not run
 */
export function filterSuites(
  suites: TestSuite[],
  recordMode: boolean
): TestSuite[] {
  return suites
    .map(suite => filterSuite(suite, recordMode))
    .filter(suite => hasTests(suite));
}

/**
 * Filter individual test suite
 */
function filterSuite(suite: TestSuite, recordMode: boolean): TestSuite {
  const filteredTests = suite.tests.filter(test => shouldRunTest(test, suite, recordMode));
  const filteredSubSuites = suite.suites
    ?.map(s => filterSuite(s, recordMode))
    .filter(s => hasTests(s));

  return {
    ...suite,
    tests: filteredTests,
    suites: filteredSubSuites,
  };
}

/**
 * Check if suite has tests (including nested suites)
 */
function hasTests(suite: TestSuite): boolean {
  if (suite.tests.length > 0) {
    return true;
  }

  if (suite.suites && suite.suites.length > 0) {
    return suite.suites.some(s => hasTests(s));
  }

  return false;
}

/**
 * Count tests (including nested suites)
 */
export function countTests(suites: TestSuite[]): number {
  let count = 0;
  
  for (const suite of suites) {
    count += suite.tests.length;
    if (suite.suites) {
      count += countTests(suite.suites);
    }
  }
  
  return count;
}
