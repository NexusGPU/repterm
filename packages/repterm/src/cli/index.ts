#!/usr/bin/env bun
/**
 * CLI entrypoint and command parsing
 * Handles command-line arguments and orchestrates test execution
 */

import { parseArgs } from 'util';
import { loadConfig, getDefaultConfig } from '../runner/config.js';
import { createArtifactManager } from '../runner/artifacts.js';
import { discoverTests, loadTestFiles } from '../runner/loader.js';
import { runAllSuites } from '../runner/runner.js';
import { createScheduler } from '../runner/scheduler.js';
import { createReporter } from './reporter.js';
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
        'slow-threshold': {
          type: 'string', // parseArgs doesn't support number type directly for values
        },
        'recording-dir': {
          type: 'string',
        },
        'prompt-lines': {
          type: 'string',
          short: 'p',
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

    // Load configuration - use default config values, only override if user specified
    const defaultConfig = getDefaultConfig();
    const config = loadConfig({
      record: {
        enabled: args.values.record,
      },
      parallel: {
        workers: args.values.workers ? parseInt(args.values.workers, 10) : 1,
      },
      timeouts: args.values.timeout ? {
        testMs: parseInt(args.values.timeout, 10),
        suiteMs: defaultConfig.timeouts.suiteMs,
      } : undefined,  // undefined = use DEFAULT_CONFIG
      terminal: {
        promptLineCount: args.values['prompt-lines'] ? parseInt(args.values['prompt-lines'], 10) : undefined,
      },
    });

    // Create artifact manager
    const artifactManager = createArtifactManager(args.values['recording-dir']);

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

    // Get registered tests from the registry
    // Use relative import to ensure we use the same registry instance
    const { registry } = await import('../api/test.js');
    const allSuites = registry.getRootSuites();

    // Apply test filtering based on --record flag
    const { filterSuites, countTests } = await import('../runner/filter.js');
    const suites = filterSuites(allSuites, config.record.enabled);
    const totalTests = countTests(suites);

    if (totalTests === 0) {
      if (config.record.enabled) {
        console.error('No tests marked with { record: true } found.');
        console.error('Use describe/test with { record: true } to mark recording tests.');
      } else {
        console.error('No tests found.');
      }
      process.exit(1);
    }

    const modeLabel = config.record.enabled ? ' (recording mode)' : '';
    console.log(`Running ${totalTests} test(s)${modeLabel}...`);
    console.log('');

    // Create reporter for streaming output
    const reporter = createReporter({
      verbose: args.values.verbose,
      slowThreshold: args.values['slow-threshold']
        ? parseInt(args.values['slow-threshold'], 10)
        : undefined,
    });

    // Run tests (parallel or sequential based on worker count)
    let results;
    const onTestStart = (testInfo: { suitePath: string[]; testName: string }) => reporter.onTestStart(testInfo);
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
      results = await runAllSuites(suites, { config, artifactManager, onResult, onTestStart });
    }

    // Report final summary
    reporter.onRunComplete(results);

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
  -r, --record         Run recording tests (tests marked with { record: true })
  -w, --workers <n>    Number of parallel workers (default: 1)
  -t, --timeout <ms>   Test timeout in milliseconds (default: from config)
  -v, --verbose        Verbose output with stack traces
  -p, --prompt-lines <n>  Prompt line count for output capture (0=auto-detect)
  --slow-threshold <ms> Show duration for tests slower than this (default: 50)
  --recording-dir <path>   Directory for recording artifacts (default: /tmp/repterm)
  -h, --help           Show this help message

Test Modes:
  Without --record:    Runs tests NOT marked with { record: true }
  With --record:       Runs ONLY tests marked with { record: true }

Examples:
  repterm tests/                    # Run non-recording tests
  repterm --record tests/           # Run recording tests only
  repterm --workers 4 tests/
  `);
}

// Run CLI
main();
