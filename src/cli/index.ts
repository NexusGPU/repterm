#!/usr/bin/env bun
/**
 * CLI entrypoint and command parsing
 * Handles command-line arguments and orchestrates test execution
 */

import { parseArgs } from 'util';
import { loadConfig } from '../runner/config.js';
import { createArtifactManager } from '../runner/artifacts.js';
import { discoverTests, loadTestFiles } from '../runner/loader.js';
import { runAllSuites } from '../runner/runner.js';
import { createScheduler } from '../runner/scheduler.js';
import { createReporter } from './reporter.js';
import { getTests } from '../api/test.js';
import { checkDependencies, printDependencyCheck } from '../utils/dependencies.js';
import type { RunResult } from '../runner/models.js';

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  try {
    const args = parseArgs({
      args: process.argv.slice(2),
      options: {
        record: {
          type: 'boolean',
          short: 'r',
          default: false,
        },
        workers: {
          type: 'string',
          short: 'w',
        },
        timeout: {
          type: 'string',
          short: 't',
        },
        verbose: {
          type: 'boolean',
          short: 'v',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
      allowPositionals: true,
    });

    // Show help
    if (args.values.help) {
      showHelp();
      process.exit(0);
    }

    // Get test paths
    const testPaths = args.positionals;
    if (testPaths.length === 0) {
      console.error('Error: No test paths provided');
      showHelp();
      process.exit(1);
    }

    // Load configuration
    const config = loadConfig({
      record: {
        enabled: args.values.record,
      },
      parallel: {
        workers: args.values.workers ? parseInt(args.values.workers, 10) : 1,
      },
      timeouts: {
        testMs: args.values.timeout ? parseInt(args.values.timeout, 10) : 30000,
        suiteMs: 300000,
      },
    });

    // Create artifact manager
    const artifactManager = createArtifactManager();

    // Discover test files
    const testFiles = await discoverTests(testPaths);

    if (testFiles.length === 0) {
      console.error('Error: No test files found');
      process.exit(1);
    }

    // Initialize artifact manager
    artifactManager.init();

    // Check dependencies if recording is enabled
    if (config.record.enabled) {
      console.log('Checking dependencies for recording mode...');
      const depCheck = await checkDependencies(true);
      printDependencyCheck(depCheck);

      if (!depCheck.allPresent) {
        console.error('\nRecording mode requires asciinema and tmux to be installed.');
        process.exit(1);
      }
    }

    // Show discovery info
    console.log(`Found ${testFiles.length} test file(s)`);

    // Load test files
    console.log('Loading tests...');
    await loadTestFiles(testFiles);

    // Get registered tests
    const suites = getTests();
    const totalTests = suites.reduce((sum, suite) => sum + suite.tests.length, 0);
    console.log(`Running ${totalTests} test(s)...`);
    console.log('');

    // Create reporter for streaming output
    const reporter = createReporter({ verbose: args.values.verbose });

    // Run tests (parallel or sequential based on worker count)
    let results;
    const onResult = (result: RunResult) => reporter.onTestResult(result);

    if (config.parallel.workers > 1) {
      // Use scheduler for parallel execution
      const scheduler = createScheduler({
        config,
        artifactBaseDir: artifactManager.getBaseDir(),
        onResult,
      });
      results = await scheduler.run(suites);
    } else {
      // Single worker - run sequentially
      results = await runAllSuites(suites, { config, artifactManager, onResult });
    }

    // Report final summary
    reporter.onRunComplete(results);

    // Show recording location if recording was enabled
    if (config.record.enabled) {
      const runDir = artifactManager.getRunDir();
      console.log('');
      console.log(`Recording saved to: ${runDir}`);
    }

    // Exit with appropriate code
    const failed = results.filter((r) => r.status === 'fail').length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    if ((error as Error).stack) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

/**
 * Show help text
 */
function showHelp(): void {
  console.log(`
Repterm - CLI/TUI Test Framework

Usage:
  repterm [options] <test-paths...>

Options:
  -r, --record         Enable recording mode (asciinema)
  -w, --workers <n>    Number of parallel workers (default: 1)
  -t, --timeout <ms>   Test timeout in milliseconds (default: 30000)
  -v, --verbose        Verbose output with stack traces
  -h, --help           Show this help message

Examples:
  repterm tests/example.test.ts
  repterm --record tests/
  repterm --workers 4 tests/
  `);
}

// Run CLI
main();
