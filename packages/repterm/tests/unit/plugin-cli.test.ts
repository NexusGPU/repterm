/**
 * Unit tests for src/cli/plugin.ts - Plugin command and discovery helpers
 */

import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import {
    extractPluginSearchResults,
    isReptermPluginPackage,
    listInstalledReptermPlugins,
    parseNpmrc,
    parsePackageSpec,
    resolveRegistryConfig,
    runPluginCommand,
} from '../../src/cli/plugin.js';

type FetchCall = {
    url: string;
    headers: Record<string, string>;
};

type BunCall = {
    args: string[];
    options: {
        cwd: string;
        captureOutput?: boolean;
    };
};

function createMockDeps(options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    files?: Record<string, string>;
    fetchJson?: (url: string, headers?: Record<string, string>) => Promise<unknown>;
    runBun?: (
        args: string[],
        options: {
            cwd: string;
            captureOutput?: boolean;
        }
    ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}) {
    const stdoutLogs: string[] = [];
    const stderrLogs: string[] = [];
    const fetchCalls: FetchCall[] = [];
    const bunCalls: BunCall[] = [];
    const files = new Map(Object.entries(options?.files ?? {}));

    const deps = {
        cwd: options?.cwd ?? '/repo/project',
        env: options?.env ?? {},
        stdout: (message: string) => {
            stdoutLogs.push(message);
        },
        stderr: (message: string) => {
            stderrLogs.push(message);
        },
        fileExists: async (filePath: string) => files.has(filePath),
        readFileText: async (filePath: string) => {
            const value = files.get(filePath);
            if (value === undefined) {
                throw new Error(`Missing mock file: ${filePath}`);
            }
            return value;
        },
        fetchJson: async (url: string, headers: Record<string, string> = {}) => {
            fetchCalls.push({ url, headers });
            if (options?.fetchJson) {
                return options.fetchJson(url, headers);
            }
            return {};
        },
        runBun: async (
            args: string[],
            runOptions: {
                cwd: string;
                captureOutput?: boolean;
            }
        ) => {
            bunCalls.push({ args, options: runOptions });
            if (options?.runBun) {
                return options.runBun(args, runOptions);
            }
            return { exitCode: 0, stdout: '', stderr: '' };
        },
    };

    return {
        deps,
        stdoutLogs,
        stderrLogs,
        fetchCalls,
        bunCalls,
    };
}

describe('parseNpmrc', () => {
    test('parses registry and token with env variable expansion', () => {
        const parsed = parseNpmrc(
            [
                'registry=https://registry.example.internal',
                '//registry.example.internal/:_authToken=${NPM_TOKEN}',
            ].join('\n'),
            { NPM_TOKEN: 'abc123' }
        );

        expect(parsed.registry).toBe('https://registry.example.internal/');
        expect(parsed.authTokens['//registry.example.internal/']).toBe('abc123');
    });
});

describe('package parsing and plugin identification', () => {
    test('parsePackageSpec handles scoped and versioned packages', () => {
        expect(parsePackageSpec('@scope/repterm-plugin-foo@1.2.3')).toEqual({
            name: '@scope/repterm-plugin-foo',
            version: '1.2.3',
        });

        expect(parsePackageSpec('repterm-plugin-bar')).toEqual({
            name: 'repterm-plugin-bar',
        });
    });

    test('isReptermPluginPackage accepts expected markers', () => {
        expect(isReptermPluginPackage('@scope/repterm-plugin-k8s', [], undefined)).toBe(true);
        expect(
            isReptermPluginPackage(
                'custom-plugin',
                ['repterm', 'plugin'],
                undefined,
                { repterm: '>=0.1.0' }
            )
        ).toBe(true);
        expect(isReptermPluginPackage('custom-plugin', [], { apiVersion: 1 })).toBe(true);
        expect(isReptermPluginPackage('repterm-api', ['repterm', 'plugin'], undefined)).toBe(false);
        expect(isReptermPluginPackage('left-pad', ['utility'], undefined)).toBe(false);
    });
});

describe('extractPluginSearchResults', () => {
    test('filters non-plugin packages from search payload', () => {
        const results = extractPluginSearchResults({
            objects: [
                {
                    package: {
                        name: '@nexusgpu/repterm-plugin-kubectl',
                        version: '0.1.0',
                        description: 'Kubernetes plugin',
                        keywords: ['repterm', 'plugin', 'kubernetes'],
                        links: {
                            npm: 'https://www.npmjs.com/package/@nexusgpu/repterm-plugin-kubectl',
                        },
                    },
                },
                {
                    package: {
                        name: 'left-pad',
                        version: '1.0.0',
                        description: 'not a plugin',
                        keywords: ['string'],
                    },
                },
            ],
        });

        expect(results).toHaveLength(1);
        expect(results[0]?.name).toBe('@nexusgpu/repterm-plugin-kubectl');
        expect(results[0]?.keywords).toEqual(['repterm', 'plugin', 'kubernetes']);
    });
});

describe('resolveRegistryConfig', () => {
    test('prioritizes project .npmrc registry and token', async () => {
        const cwd = '/repo/project';
        const mock = createMockDeps({
            cwd,
            files: {
                '/repo/project/package.json': '{}',
                '/repo/project/.npmrc': [
                    'registry=https://registry.project.internal',
                    '//registry.project.internal/:_authToken=project-token',
                ].join('\n'),
                [join(homedir(), '.npmrc')]: [
                    'registry=https://registry.user.internal',
                    '//registry.user.internal/:_authToken=user-token',
                ].join('\n'),
            },
        });

        const config = await resolveRegistryConfig(cwd, mock.deps);

        expect(config.registry).toBe('https://registry.project.internal/');
        expect(config.token).toBe('project-token');
    });
});

describe('listInstalledReptermPlugins', () => {
    test('returns only installed plugin packages from package.json', async () => {
        const projectRoot = '/repo/project';
        const mock = createMockDeps({
            files: {
                '/repo/project/package.json': JSON.stringify({
                    devDependencies: {
                        '@nexusgpu/repterm-plugin-kubectl': '^0.1.0',
                        typescript: '^5.0.0',
                    },
                }),
                '/repo/project/node_modules/@nexusgpu/repterm-plugin-kubectl/package.json': JSON.stringify({
                    name: '@nexusgpu/repterm-plugin-kubectl',
                    version: '0.1.2',
                    keywords: ['repterm', 'plugin', 'kubectl'],
                }),
                '/repo/project/node_modules/typescript/package.json': JSON.stringify({
                    name: 'typescript',
                    version: '5.4.0',
                    keywords: ['typescript'],
                }),
            },
        });

        const plugins = await listInstalledReptermPlugins(projectRoot, mock.deps);

        expect(plugins).toEqual([
            {
                name: '@nexusgpu/repterm-plugin-kubectl',
                requestedVersion: '^0.1.0',
                section: 'devDependencies',
                installedVersion: '0.1.2',
            },
        ]);
    });
});

describe('runPluginCommand', () => {
    test('search uses resolved registry and prints plugin results', async () => {
        const mock = createMockDeps({
            files: {
                '/repo/project/package.json': '{}',
                '/repo/project/.npmrc': [
                    'registry=https://registry.project.internal',
                    '//registry.project.internal/:_authToken=project-token',
                ].join('\n'),
            },
            fetchJson: async () => ({
                objects: [
                    {
                        package: {
                            name: '@nexusgpu/repterm-plugin-kubectl',
                            version: '0.1.3',
                            description: 'Kubernetes plugin',
                            keywords: ['repterm', 'plugin', 'kubernetes'],
                        },
                    },
                ],
            }),
        });

        const exitCode = await runPluginCommand(['search', 'kubernetes', '--limit', '5'], mock.deps);

        expect(exitCode).toBe(0);
        expect(mock.fetchCalls).toHaveLength(1);
        expect(mock.fetchCalls[0]?.url).toContain('https://registry.project.internal/');
        expect(mock.fetchCalls[0]?.url).toContain('/-/v1/search');
        expect(mock.fetchCalls[0]?.url).toContain('size=5');
        expect(mock.fetchCalls[0]?.headers.authorization).toBe('Bearer project-token');
        expect(mock.stdoutLogs.join('\n')).toContain('@nexusgpu/repterm-plugin-kubectl@0.1.3');
    });

    test('install validates plugin package, installs with bun, and verifies import', async () => {
        const bunCalls: string[][] = [];
        const mock = createMockDeps({
            files: {
                '/repo/project/package.json': '{}',
            },
            fetchJson: async () => ({
                name: '@nexusgpu/repterm-plugin-kubectl',
                version: '0.1.4',
                keywords: ['repterm', 'plugin', 'kubernetes'],
            }),
            runBun: async (args, options) => {
                bunCalls.push(args);

                if (args[0] === '-e') {
                    expect(options.captureOutput).toBe(true);
                    return { exitCode: 0, stdout: '', stderr: '' };
                }

                return { exitCode: 0, stdout: '', stderr: '' };
            },
        });

        const exitCode = await runPluginCommand(
            ['install', '@nexusgpu/repterm-plugin-kubectl'],
            mock.deps
        );

        expect(exitCode).toBe(0);
        expect(bunCalls[0]).toEqual(['add', '-d', '@nexusgpu/repterm-plugin-kubectl']);
        expect(bunCalls[1]?.[0]).toBe('-e');
        expect(mock.stdoutLogs.join('\n')).toContain('import verification passed');
    });

    test('install rejects non-plugin packages by default', async () => {
        const mock = createMockDeps({
            files: {
                '/repo/project/package.json': '{}',
            },
            fetchJson: async () => ({
                name: 'left-pad',
                version: '1.3.0',
                keywords: ['string'],
            }),
        });

        await expect(runPluginCommand(['install', 'left-pad'], mock.deps)).rejects.toThrow(
            'Refusing non-repterm plugin package(s): left-pad'
        );
    });

    test('list prints installed plugins as JSON', async () => {
        const mock = createMockDeps({
            files: {
                '/repo/project/package.json': JSON.stringify({
                    devDependencies: {
                        '@nexusgpu/repterm-plugin-kubectl': '^0.1.0',
                    },
                }),
                '/repo/project/node_modules/@nexusgpu/repterm-plugin-kubectl/package.json': JSON.stringify({
                    name: '@nexusgpu/repterm-plugin-kubectl',
                    version: '0.1.0',
                    keywords: ['repterm', 'plugin', 'kubectl'],
                }),
            },
        });

        const exitCode = await runPluginCommand(['list', '--json'], mock.deps);

        expect(exitCode).toBe(0);
        expect(mock.stdoutLogs).toHaveLength(1);
        const parsed = JSON.parse(mock.stdoutLogs[0] ?? '[]') as Array<{ name: string }>;
        expect(parsed[0]?.name).toBe('@nexusgpu/repterm-plugin-kubectl');
    });

    test('update without explicit package updates all installed plugins', async () => {
        const bunCalls: string[][] = [];
        const mock = createMockDeps({
            files: {
                '/repo/project/package.json': JSON.stringify({
                    devDependencies: {
                        '@nexusgpu/repterm-plugin-kubectl': '^0.1.0',
                    },
                }),
                '/repo/project/node_modules/@nexusgpu/repterm-plugin-kubectl/package.json': JSON.stringify({
                    name: '@nexusgpu/repterm-plugin-kubectl',
                    version: '0.1.0',
                    keywords: ['repterm', 'plugin', 'kubectl'],
                }),
            },
            runBun: async (args) => {
                bunCalls.push(args);
                return { exitCode: 0, stdout: '', stderr: '' };
            },
        });

        const exitCode = await runPluginCommand(['update'], mock.deps);

        expect(exitCode).toBe(0);
        expect(bunCalls[0]).toEqual(['update', '@nexusgpu/repterm-plugin-kubectl']);
        expect(bunCalls[1]?.[0]).toBe('-e');
    });
});
