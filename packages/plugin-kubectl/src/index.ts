/**
 * Kubectl Plugin for Repterm
 *
 * Provides Kubernetes-specific testing utilities and commands.
 *
 * @packageDocumentation
 */

import { definePlugin, type BasePluginContext, type PluginHooks } from 'repterm';

/**
 * Kubectl context extension
 * This will be available to downstream plugins
 */
export interface KubectlContext {
    kubectl: {
        namespace: string;
        kubeconfig?: string;
    };
}

/**
 * Kubectl plugin methods
 */
export interface KubectlMethods {
    /** Run a kubectl command and return the output */
    run: (args: string) => Promise<string>;
    /** Get kubectl command prefix with namespace */
    command: (args: string) => string;
    /** Wait for a pod to be in a specific status */
    waitForPod: (
        name: string,
        status?: 'Running' | 'Succeeded' | 'Failed' | 'Pending',
        timeout?: number
    ) => Promise<void>;
    /** Create a resource from a YAML string */
    apply: (yaml: string) => Promise<void>;
    /** Delete a resource */
    delete: (resource: string, name: string) => Promise<void>;
    /** Get resource as JSON */
    get: <T = unknown>(resource: string, name?: string) => Promise<T>;
    /** Check if a resource exists */
    exists: (resource: string, name: string) => Promise<boolean>;
    /** Set the current namespace */
    setNamespace: (namespace: string) => void;
}

/**
 * Plugin options
 */
export interface KubectlPluginOptions {
    /** Default namespace */
    namespace?: string;
    /** Path to kubeconfig file */
    kubeconfig?: string;
}

/**
 * Create the kubectl plugin
 *
 * @example
 * ```ts
 * import { defineConfig, createTestWithPlugins } from 'repterm';
 * import { kubectlPlugin } from '@repterm/plugin-kubectl';
 *
 * const config = defineConfig({
 *   plugins: [kubectlPlugin({ namespace: 'test' })] as const,
 * });
 *
 * const test = createTestWithPlugins(config);
 *
 * test('deploy nginx', async (ctx) => {
 *   await ctx.plugins.kubectl.apply(`...`);
 *   await ctx.plugins.kubectl.waitForPod('nginx', 'Running');
 * });
 * ```
 */
export function kubectlPlugin(options: KubectlPluginOptions = {}) {
    let currentNamespace = options.namespace || 'default';
    const kubeconfig = options.kubeconfig;

    return definePlugin<'kubectl', BasePluginContext, KubectlContext, KubectlMethods>(
        'kubectl',
        (ctx) => {
            const testContext = ctx.testContext;

            const buildCommand = (args: string): string => {
                let cmd = 'kubectl';
                if (kubeconfig) {
                    cmd += ` --kubeconfig=${kubeconfig}`;
                }
                cmd += ` -n ${currentNamespace} ${args}`;
                return cmd;
            };

            const executeCommand = async (args: string): Promise<string> => {
                const cmd = buildCommand(args);
                if (ctx.debug) {
                    console.log(`[kubectl] Executing: ${cmd}`);
                }
                await testContext.terminal.start(`${cmd}\n`);
                const output = await testContext.terminal.snapshot();
                return output;
            };

            const methods: KubectlMethods = {
                run: executeCommand,
                command: (args: string) => buildCommand(args),

                waitForPod: async (name, status = 'Running', timeout = 60000) => {
                    const startTime = Date.now();
                    const checkInterval = 1000;

                    while (Date.now() - startTime < timeout) {
                        try {
                            const cmd = buildCommand(`get pod ${name} -o jsonpath='{.status.phase}'`);
                            await testContext.terminal.start(`${cmd}\n`);
                            await testContext.terminal.waitForText(status, { timeout: checkInterval });
                            return;
                        } catch {
                            await new Promise((resolve) => setTimeout(resolve, checkInterval));
                        }
                    }
                    throw new Error(`Timeout waiting for pod ${name} to reach status ${status}`);
                },

                apply: async (yaml: string) => {
                    const escapedYaml = yaml.replace(/'/g, "'\\''");
                    const cmd = `echo '${escapedYaml}' | kubectl -n ${currentNamespace} apply -f -`;
                    await testContext.terminal.start(`${cmd}\n`);
                },

                delete: async (resource: string, name: string) => {
                    await executeCommand(`delete ${resource} ${name} --ignore-not-found`);
                },

                get: async <T = unknown>(resource: string, name?: string): Promise<T> => {
                    const args = name ? `get ${resource} ${name} -o json` : `get ${resource} -o json`;
                    const output = await executeCommand(args);
                    try {
                        const jsonMatch = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                        if (jsonMatch) {
                            return JSON.parse(jsonMatch[0]) as T;
                        }
                        throw new Error('No JSON found in output');
                    } catch (e) {
                        throw new Error(`Failed to parse kubectl output: ${e}`);
                    }
                },

                exists: async (resource: string, name: string): Promise<boolean> => {
                    try {
                        const cmd = buildCommand(`get ${resource} ${name} -o name`);
                        await testContext.terminal.start(`${cmd}\n`);
                        await testContext.terminal.waitForText(`${resource}/${name}`, { timeout: 5000 });
                        return true;
                    } catch {
                        return false;
                    }
                },

                setNamespace: (namespace: string) => {
                    currentNamespace = namespace;
                },
            };

            const hooks: PluginHooks = {
                beforeTest: async () => {
                    if (ctx.debug) {
                        console.log(`[kubectl] Using namespace: ${currentNamespace}`);
                    }
                },
                afterTest: async (_, error) => {
                    if (error && ctx.debug) {
                        console.log(`[kubectl] Test failed, consider cleaning up resources`);
                    }
                },
            };

            return {
                methods,
                hooks,
                context: {
                    kubectl: {
                        namespace: currentNamespace,
                        kubeconfig,
                    },
                },
            };
        }
    );
}

export const defaultKubectlPlugin = kubectlPlugin();
