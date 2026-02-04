/**
 * Run configuration loader
 * Handles timeouts, recording mode, and parallel execution settings
 */

export interface RunConfig {
  timeouts: {
    suiteMs: number;
    testMs: number;
  };
  record: {
    enabled: boolean;
    castFile?: string;
  };
  parallel: {
    workers: number;
  };
  terminal: {
    promptLineCount?: number;  // undefined = 自动检测
  };
}

export interface ConfigOptions {
  timeouts?: {
    suiteMs?: number;
    testMs?: number;
  };
  record?: {
    enabled?: boolean;
    castFile?: string;
  };
  parallel?: {
    workers?: number;
  };
  terminal?: {
    promptLineCount?: number;
  };
}

const DEFAULT_CONFIG: RunConfig = {
  timeouts: {
    suiteMs: 1500000, // 15 minutes
    testMs: 300000, // 5 minutes
  },
  record: {
    enabled: false,
  },
  parallel: {
    workers: 1,
  },
  terminal: {
    promptLineCount: undefined,  // 自动检测
  },
};

/**
 * Load and validate run configuration
 * Merges user options with defaults
 */
export function loadConfig(options: ConfigOptions = {}): RunConfig {
  const config: RunConfig = {
    timeouts: {
      suiteMs: options.timeouts?.suiteMs ?? DEFAULT_CONFIG.timeouts.suiteMs,
      testMs: options.timeouts?.testMs ?? DEFAULT_CONFIG.timeouts.testMs,
    },
    record: {
      enabled: options.record?.enabled ?? DEFAULT_CONFIG.record.enabled,
      castFile: options.record?.castFile,
    },
    parallel: {
      workers: options.parallel?.workers ?? DEFAULT_CONFIG.parallel.workers,
    },
    terminal: {
      promptLineCount: options.terminal?.promptLineCount,
    },
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

function validateConfig(config: RunConfig): void {
  if (config.timeouts.suiteMs <= 0) {
    throw new Error('Suite timeout must be a positive integer');
  }

  if (config.timeouts.testMs <= 0) {
    throw new Error('Test timeout must be a positive integer');
  }

  if (config.parallel.workers < 1) {
    throw new Error('Worker count must be at least 1');
  }

  if (config.timeouts.testMs > config.timeouts.suiteMs) {
    throw new Error('Test timeout cannot exceed suite timeout');
  }
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): RunConfig {
  return { ...DEFAULT_CONFIG };
}
