/**
 * Test filtering logic
 * Filters tests based on --record flag and record configuration
 */

import type { TestCase, TestSuite } from './models.js';

/**
 * 判断测试是否应该在当前模式下运行
 * 
 * 运行策略：
 * - recordMode = false（普通模式）：运行未标注 record: true 的测试
 * - recordMode = true（录制模式）：只运行标注了 record: true 的测试
 * 
 * @param testCase 测试用例
 * @param suite 测试套件
 * @param recordMode 是否为录制模式（--record）
 */
export function shouldRunTest(
  testCase: TestCase,
  suite: TestSuite,
  recordMode: boolean
): boolean {
  // 确定测试的 record 配置：test > suite > undefined
  const testRecordConfig = testCase.options?.record ?? getInheritedRecordConfig(suite);
  
  // 如果测试没有标注 record 配置（undefined 或 false）
  if (testRecordConfig === undefined || testRecordConfig === false) {
    // 未标注或标注为 false 的测试只在非录制模式下运行
    return !recordMode;
  }
  
  // 测试标注了 record: true
  // 只在录制模式下运行
  return recordMode;
}

/**
 * 获取从 suite 继承的 record 配置
 * 递归向上查找父 suite 的配置
 */
function getInheritedRecordConfig(suite: TestSuite): boolean | undefined {
  // 先检查当前 suite 的配置
  if (suite.options?.record !== undefined) {
    return suite.options.record;
  }
  
  // 向上查找父 suite
  if (suite.parent) {
    return getInheritedRecordConfig(suite.parent);
  }
  
  return undefined;
}

/**
 * 过滤测试套件，移除不应运行的测试
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
 * 过滤单个测试套件
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
 * 检查套件是否有测试（包括嵌套套件）
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
 * 统计测试数量（包括嵌套套件）
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
