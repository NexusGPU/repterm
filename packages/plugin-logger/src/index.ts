/**
 * Logger Plugin for Repterm
 *
 * Provides logging utilities and extends context for downstream plugins.
 *
 * @packageDocumentation
 */

import { definePlugin, type BasePluginContext, type PluginHooks } from 'repterm';

/** Log levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Logger interface for context extension */
export interface Logger {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
    setLevel: (level: LogLevel) => void;
}

/** Logger context extension */
export interface LoggerContext {
    logger: Logger;
}

/** Logger plugin methods */
export interface LoggerMethods {
    log: (level: LogLevel, message: string, ...args: unknown[]) => void;
    setLevel: (level: LogLevel) => void;
}

/** Plugin options */
export interface LoggerPluginOptions {
    /** Minimum log level to display */
    level?: LogLevel;
    /** Custom log prefix */
    prefix?: string;
    /** Whether to include timestamps */
    timestamps?: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Create the logger plugin
 *
 * @example
 * ```ts
 * import { defineConfig, createTestWithPlugins } from 'repterm';
 * import { loggerPlugin } from '@repterm/plugin-logger';
 *
 * const config = defineConfig({
 *   plugins: [loggerPlugin({ level: 'debug' })] as const,
 * });
 *
 * const test = createTestWithPlugins(config);
 *
 * test('my test', async (ctx) => {
 *   ctx.logger.info('Hello!');
 * });
 * ```
 */
export function loggerPlugin(options: LoggerPluginOptions = {}) {
    let currentLevel: LogLevel = options.level || 'info';
    const prefix = options.prefix || '[repterm]';
    const timestamps = options.timestamps ?? false;

    return definePlugin<'logger', BasePluginContext, LoggerContext, LoggerMethods>(
        'logger',
        (ctx) => {
            const shouldLog = (level: LogLevel): boolean => {
                if (!ctx.debug && level === 'debug') return false;
                return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
            };

            const formatMessage = (level: LogLevel, message: string): string => {
                let formatted = '';
                if (timestamps) {
                    formatted += `[${new Date().toISOString()}] `;
                }
                formatted += `${prefix} [${level.toUpperCase()}] ${message}`;
                return formatted;
            };

            const logFn = (level: LogLevel, message: string, ...args: unknown[]): void => {
                if (!shouldLog(level)) return;

                const formatted = formatMessage(level, message);
                switch (level) {
                    case 'debug':
                    case 'info':
                        console.log(formatted, ...args);
                        break;
                    case 'warn':
                        console.warn(formatted, ...args);
                        break;
                    case 'error':
                        console.error(formatted, ...args);
                        break;
                }
            };

            const logger: Logger = {
                debug: (message, ...args) => logFn('debug', message, ...args),
                info: (message, ...args) => logFn('info', message, ...args),
                warn: (message, ...args) => logFn('warn', message, ...args),
                error: (message, ...args) => logFn('error', message, ...args),
                setLevel: (level) => {
                    currentLevel = level;
                },
            };

            const methods: LoggerMethods = {
                log: logFn,
                setLevel: (level) => {
                    currentLevel = level;
                },
            };

            const hooks: PluginHooks = {
                beforeTest: async (testCtx) => {
                    logger.debug(`Starting test with terminal: ${!!testCtx.terminal}`);
                },
                afterTest: async (_, error) => {
                    if (error) {
                        logger.error(`Test failed: ${error.message}`);
                    } else {
                        logger.debug('Test completed successfully');
                    }
                },
            };

            return {
                methods,
                hooks,
                context: { logger },
            };
        }
    );
}

export const defaultLoggerPlugin = loggerPlugin();
