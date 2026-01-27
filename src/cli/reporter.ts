/**
 * Reporter with failure diagnostics
 * Formats and displays test results in Vitest-style output
 */

import type { RunResult } from '../runner/models.js';

export interface ReporterOptions {
  verbose?: boolean;
  colors?: boolean;
}

interface SuiteNode {
  name: string;
  results: RunResult[];
  children: Map<string, SuiteNode>;
  durationMs: number;
  status: 'pass' | 'fail' | 'skip';
}

/**
 * Reporter for test results with Vitest-style formatting
 */
export class Reporter {
  private options: ReporterOptions;
  private slowThreshold = 100; // Show duration for tests slower than this (ms)

  constructor(options: ReporterOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      colors: options.colors ?? true,
    };
  }

  /**
   * Report a single test result immediately
   */
  private lastSuitePath: string[] = [];

  /**
   * Report a single test result immediately
   */
  onTestResult(result: RunResult): void {
    const currentPath = result.suitePath;

    // Determine how many suite levels match the previous test
    let matchDepth = 0;
    const maxDepth = Math.min(this.lastSuitePath.length, currentPath.length);

    for (let i = 0; i < maxDepth; i++) {
      if (this.lastSuitePath[i] === currentPath[i]) {
        matchDepth++;
      } else {
        break;
      }
    }

    // Print headers for new suite levels
    for (let i = matchDepth; i < currentPath.length; i++) {
      const indent = '  '.repeat(i);
      console.log(indent + this.color(currentPath[i], 'cyan'));
    }

    // Update state
    this.lastSuitePath = currentPath;

    // Print test result
    const depth = currentPath.length;
    this.printTestResult(result, depth);
  }

  /**
   * Report final summary and failures
   */
  onRunComplete(results: RunResult[]): void {
    // Print summary
    this.printSummary(results);

    // Print failure details
    const failures = results.filter((r) => r.status === 'fail');
    if (failures.length > 0) {
      this.printFailures(failures);
    }
  }

  /**
   * Report all test results at once (Legacy/Batch mode)
   */
  report(results: RunResult[]): void {
    // Group results by top-level suite (first element of suitePath)
    const suiteTree = this.buildSuiteTree(results);

    // Print results recursively
    for (const [suiteName, node] of suiteTree) {
      this.printSuiteNode(suiteName, node, 0);
    }

    this.onRunComplete(results);
  }

  /**
   * Build a tree of suites and tests
   */
  private buildSuiteTree(results: RunResult[]): Map<string, SuiteNode> {
    const tree = new Map<string, SuiteNode>();

    for (const result of results) {
      let currentMap = tree;
      const path = result.suitePath;

      // Navigate/build hierarchy
      for (let i = 0; i < path.length; i++) {
        const part = path[i];
        if (!currentMap.has(part)) {
          currentMap.set(part, {
            name: part,
            results: [],
            children: new Map(),
            durationMs: 0,
            status: 'pass',
          });
        }

        const node = currentMap.get(part)!;
        node.durationMs += result.durationMs;
        if (result.status === 'fail') node.status = 'fail';
        else if (result.status === 'skip' && node.status === 'pass') node.status = 'skip';

        // If this is the last part of the path, add the result here
        if (i === path.length - 1) {
          node.results.push(result);
        }

        currentMap = node.children;
      }
    }

    return tree;
  }

  /**
   * Print a suite node and its children recursively
   */
  private printSuiteNode(name: string, node: SuiteNode, depth: number): void {
    const indent = '  '.repeat(depth);

    // Calculate stats for this node (including children)
    // Note: node.results only contains tests directly in this suite, but node.status/duration includes children

    const symbol = this.getStatusSymbol(node.status);
    const color = this.getStatusColor(node.status);
    const count = this.countTests(node);

    // Print suite header
    console.log(
      indent +
      this.color(` ${symbol} `, color) +
      this.color(name, 'cyan') +
      this.color(` (${count})`, 'dim') + // Simple count for now
      this.color(` ${this.formatDuration(node.durationMs)}`, 'dim')
    );

    // Print direct tests
    for (const result of node.results) {
      this.printTestResult(result, depth + 1);
    }

    // Print nested suites
    for (const [childName, childNode] of node.children) {
      this.printSuiteNode(childName, childNode, depth + 1);
    }
  }

  /**
   * Helper to count total tests in a node
   */
  private countTests(node: SuiteNode): number {
    let count = node.results.length;
    for (const child of node.children.values()) {
      count += this.countTests(child);
    }
    return count;
  }

  /**
   * Print a single test result
   */
  private printTestResult(result: RunResult, depth: number): void {
    const indent = '  '.repeat(depth);
    const testName = result.caseName || result.caseId;
    const symbol = this.getStatusSymbol(result.status);
    const color = this.getStatusColor(result.status);

    // Only show duration for slower tests
    const durationStr =
      result.durationMs >= this.slowThreshold
        ? this.color(` ${result.durationMs}ms`, 'dim')
        : '';

    // Show recording path if available
    const recordingStr = result.recordingPath
      ? this.color(` → ${result.recordingPath}`, 'dim')
      : '';

    console.log(
      indent +
      this.color(` ${symbol} `, color) +
      this.color(testName, result.status === 'skip' ? 'dim' : 'white') +
      durationStr +
      recordingStr
    );
  }

  /**
   * Print test summary in Vitest style
   */
  private printSummary(results: RunResult[]): void {
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const skipped = results.filter((r) => r.status === 'skip').length;
    const total = results.length;
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

    // Count unique suites
    const suiteSet = new Set(results.map((r) => r.suiteName || r.suiteId));
    const suitesPassed = Array.from(suiteSet).filter((suiteName) => {
      const suiteResults = results.filter(
        (r) => (r.suiteName || r.suiteId) === suiteName
      );
      return suiteResults.every((r) => r.status !== 'fail');
    }).length;
    const suitesFailed = suiteSet.size - suitesPassed;

    console.log('');

    // Suites summary
    const suiteSummary = this.formatSuiteSummary(suitesPassed, suitesFailed, suiteSet.size);
    console.log(this.color(' Test Suites  ', 'bold') + suiteSummary);

    // Tests summary
    const testSummary = this.formatTestSummary(passed, failed, skipped, total);
    console.log(this.color('      Tests  ', 'bold') + testSummary);

    // Duration
    console.log(
      this.color('   Duration  ', 'bold') + this.formatDurationLong(totalDuration)
    );
  }

  /**
   * Print failure details
   */
  private printFailures(failures: RunResult[]): void {
    console.log('');
    console.log(this.color(' FAIL ', 'bgRed') + this.color(' Failures', 'red'));
    console.log('');

    for (const failure of failures) {
      const testName = failure.caseName || failure.caseId;
      const suiteName = failure.suiteName || failure.suiteId;

      console.log(this.color(`❯ ${suiteName} > ${testName}`, 'red'));

      if (failure.error) {
        console.log('');
        console.log(this.color(`  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`, 'dim'));
        console.log(`  ${failure.error.message}`);

        if (failure.error.expected !== undefined && failure.error.actual !== undefined) {
          console.log('');
          console.log(this.color('  Expected: ', 'green') + this.formatValue(failure.error.expected));
          console.log(this.color('  Received: ', 'red') + this.formatValue(failure.error.actual));
        }

        if (failure.error.stack && this.options.verbose) {
          console.log('');
          console.log(this.color('  Stack:', 'dim'));
          console.log(
            failure.error.stack
              .split('\n')
              .map((line) => `    ${line}`)
              .join('\n')
          );
        }
        console.log(this.color(`  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`, 'dim'));
      }
      console.log('');
    }
  }


  /**
   * Format suite summary line
   */
  private formatSuiteSummary(passed: number, failed: number, total: number): string {
    const parts: string[] = [];
    if (failed > 0) {
      parts.push(this.color(`${failed} failed`, 'red'));
    }
    if (passed > 0) {
      parts.push(this.color(`${passed} passed`, 'green'));
    }
    parts.push(`(${total})`);
    return parts.join(' | ');
  }

  /**
   * Format test summary line
   */
  private formatTestSummary(passed: number, failed: number, skipped: number, total: number): string {
    const parts: string[] = [];
    if (failed > 0) {
      parts.push(this.color(`${failed} failed`, 'red'));
    }
    if (skipped > 0) {
      parts.push(this.color(`${skipped} skipped`, 'yellow'));
    }
    if (passed > 0) {
      parts.push(this.color(`${passed} passed`, 'green'));
    }
    parts.push(`(${total})`);
    return parts.join(' | ');
  }

  /**
   * Get status symbol
   */
  private getStatusSymbol(status: 'pass' | 'fail' | 'skip'): string {
    switch (status) {
      case 'pass':
        return '✓';
      case 'fail':
        return '✗';
      case 'skip':
        return '○';
    }
  }

  /**
   * Get status color
   */
  private getStatusColor(status: 'pass' | 'fail' | 'skip'): 'green' | 'red' | 'yellow' {
    switch (status) {
      case 'pass':
        return 'green';
      case 'fail':
        return 'red';
      case 'skip':
        return 'yellow';
    }
  }

  /**
   * Format duration (short)
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Format duration (long, for summary)
   */
  private formatDurationLong(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  }

  /**
   * Format value for diff display
   */
  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    return JSON.stringify(value);
  }

  /**
   * Apply color to text
   */
  private color(
    text: string,
    color: 'green' | 'red' | 'yellow' | 'cyan' | 'dim' | 'bold' | 'white' | 'bgRed'
  ): string {
    if (!this.options.colors) {
      return text;
    }

    const codes: Record<string, string> = {
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
      dim: '\x1b[2m',
      bold: '\x1b[1m',
      white: '\x1b[37m',
      bgRed: '\x1b[41m\x1b[37m',
    };

    const reset = '\x1b[0m';
    return `${codes[color]}${text}${reset}`;
  }
}

/**
 * Create a reporter
 */
export function createReporter(options?: ReporterOptions): Reporter {
  return new Reporter(options);
}
