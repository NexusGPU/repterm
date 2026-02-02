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

// ===== Options Types =====

/**
 * Options for kubectl logs command
 */
export interface LogsOptions {
    /** Specify container name */
    container?: string;
    /** Follow log output (-f) */
    follow?: boolean;
    /** Number of lines to show from the end */
    tail?: number;
    /** Time range (e.g., '5m', '1h') */
    since?: string;
    /** Show logs from previous container instance */
    previous?: boolean;
}

/**
 * Options for kubectl exec command
 */
export interface ExecOptions {
    /** Specify container name */
    container?: string;
}

/**
 * Options for kubectl wait command
 */
export interface WaitOptions {
    /** Timeout in milliseconds */
    timeout?: number;
    /** Wait for resource deletion */
    forDelete?: boolean;
}

/**
 * Rollout status information
 */
export interface RolloutStatus {
    /** Whether the rollout is complete */
    ready: boolean;
    /** Total number of replicas */
    replicas: number;
    /** Number of updated replicas */
    updatedReplicas: number;
    /** Number of available replicas */
    availableReplicas: number;
}

/**
 * Rollout history entry
 */
export interface RolloutHistoryEntry {
    /** Revision number */
    revision: number;
    /** Change cause annotation */
    changeCause?: string;
}

/**
 * Rollout management methods
 */
export interface RolloutMethods {
    /** Get rollout status */
    status: (resource: string, name: string) => Promise<RolloutStatus>;
    /** Get rollout history */
    history: (resource: string, name: string) => Promise<RolloutHistoryEntry[]>;
    /** Undo rollout to previous or specific revision */
    undo: (resource: string, name: string, revision?: number) => Promise<void>;
    /** Restart rollout (trigger new deployment) */
    restart: (resource: string, name: string) => Promise<void>;
    /** Pause rollout */
    pause: (resource: string, name: string) => Promise<void>;
    /** Resume paused rollout */
    resume: (resource: string, name: string) => Promise<void>;
}

/**
 * Port forward options
 */
export interface PortForwardOptions {
    /** Listen address (default: 127.0.0.1) */
    address?: string;
    /** Delay in ms to wait for port-forward to establish (default: 2000) */
    delay?: number;
}

/**
 * Port forward handle for managing port-forward lifecycle
 */
export interface PortForwardHandle {
    /** Local port being forwarded */
    localPort: number;
    /** Stop the port-forward */
    stop: () => Promise<void>;
}

/**
 * Service endpoint information
 */
export interface ServiceEndpoint {
    /** Cluster IP of the service */
    clusterIP: string;
    /** Service port */
    port: number;
    /** List of endpoint IPs */
    endpoints: string[];
}

/**
 * Event options
 */
export interface EventOptions {
    /** Field selector for filtering events */
    fieldSelector?: string;
}

/**
 * Kubernetes event
 */
export interface K8sEvent {
    /** Event type (Normal or Warning) */
    type: 'Normal' | 'Warning';
    /** Reason for the event */
    reason: string;
    /** Event message */
    message: string;
    /** Object involved in the event */
    involvedObject: { kind: string; name: string };
    /** Last timestamp of the event */
    lastTimestamp: string;
}

/**
 * Node information
 */
export interface NodeInfo {
    /** Node name */
    name: string;
    /** Node status */
    status: 'Ready' | 'NotReady';
    /** Node roles */
    roles: string[];
    /** Kubernetes version */
    version: string;
    /** Internal IP address */
    internalIP: string;
}

export interface CpOptions {
    /** Container name */
    container?: string;
}

/**
 * Delete options
 */
export interface DeleteOptions {
    /** Force delete with --grace-period=0 --force */
    force?: boolean;
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
    delete: (resource: string, name: string, options?: DeleteOptions) => Promise<void>;
    /** Get resource as JSON */
    get: <T = unknown>(resource: string, name?: string) => Promise<T>;
    /** Check if a resource exists */
    exists: (resource: string, name: string) => Promise<boolean>;
    /** Set the current namespace */
    setNamespace: (namespace: string) => void;
    /** Get the current namespace */
    getNamespace: () => string;
    /** Get the kubeconfig path */
    getKubeconfig: () => string | undefined;

    // ===== New Core APIs =====

    /** Get pod logs */
    logs: (podName: string, options?: LogsOptions) => Promise<string>;
    /** Execute command in pod */
    exec: (podName: string, command: string | string[], options?: ExecOptions) => Promise<string>;
    /** Get detailed resource description */
    describe: (resource: string, name?: string) => Promise<string>;
    /** Wait for a condition on a resource */
    wait: (resource: string, name: string, condition: string, options?: WaitOptions) => Promise<void>;
    /** Wait for resource to have specific replica count */
    waitForReplicas: (resource: string, name: string, count: number, timeout?: number) => Promise<void>;

    // ===== Resource Management APIs =====

    /** Scale a resource (Deployment, ReplicaSet, StatefulSet) */
    scale: (resource: string, name: string, replicas: number) => Promise<void>;
    /** Patch a resource */
    patch: (
        resource: string,
        name: string,
        patch: object | string,
        type?: 'strategic' | 'merge' | 'json'
    ) => Promise<void>;
    /** Add or update labels on a resource */
    label: (resource: string, name: string, labels: Record<string, string | null>) => Promise<void>;
    /** Add or update annotations on a resource */
    annotate: (resource: string, name: string, annotations: Record<string, string | null>) => Promise<void>;

    // ===== Rollout Management =====

    /** Rollout management methods */
    rollout: RolloutMethods;

    // ===== Advanced Features =====

    /** Port forward to a resource */
    portForward: (resource: string, ports: string, options?: PortForwardOptions) => Promise<PortForwardHandle>;
    /** Wait for service to have endpoints */
    waitForService: (name: string, timeout?: number) => Promise<ServiceEndpoint>;
    /** Get cluster events */
    getEvents: (options?: EventOptions) => Promise<K8sEvent[]>;
    /** Get node information */
    getNodes: (options?: { selector?: string }) => Promise<NodeInfo[]>;
    /** Copy files to/from pod */
    cp: (source: string, dest: string, options?: CpOptions) => Promise<void>;
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
                const result = await testContext.terminal.run(`${cmd}`);
                return result.output;
            };

            const methods: KubectlMethods = {
                run: executeCommand,
                command: (args: string) => buildCommand(args),

                waitForPod: async (name, status = 'Running', timeout = 60000) => {
                    const timeoutSec = Math.ceil(timeout / 1000);

                    // 使用 kubectl wait 替代轮询，录制效果更好
                    const cmd = buildCommand(
                        `wait --for=jsonpath='{.status.phase}'=${status} pod/${name} --timeout=${timeoutSec}s`
                    );
                    await testContext.terminal.run(cmd);
                },

                apply: async (yaml: string) => {
                    // 使用 heredoc 语法避免录制时出现 quote> 提示符
                    const cmd = `cat <<'EOF' | kubectl -n ${currentNamespace} apply -f -
${yaml.trim()}
EOF`;
                    await testContext.terminal.run(`${cmd}`);
                },

                delete: async (resource: string, name: string, options?: DeleteOptions) => {
                    let args = `delete ${resource} ${name} --ignore-not-found`;
                    if (options?.force) {
                        args += ' --grace-period=0 --force';
                    }
                    await testContext.terminal.run(
                        `${buildCommand(args)}`,
                        { timeout: options?.force ? 10000 : 60000 }
                    );
                },

                get: async <T = unknown>(resource: string, name?: string): Promise<T> => {
                    const args = name ? `get ${resource} ${name} -o json` : `get ${resource} -o json`;
                    const cmd = buildCommand(args);
                    const result = await testContext.terminal.run(cmd);
                    if (testContext.terminal.isRecording?.()) {
                        const silentResult = await testContext.terminal.run(cmd, { silent: true });
                        return JSON.parse(silentResult.stdout) as T;
                    }
                    return JSON.parse(result.stdout) as T;
                },

                exists: async (resource: string, name: string): Promise<boolean> => {
                    try {
                        const cmd = buildCommand(`get ${resource} ${name} -o name`);
                        const result = await testContext.terminal.run(`${cmd}`);
                        // 兼容两种格式：deployment/name 和 deployment.apps/name
                        return result.output.includes(`/${name}`);
                    } catch {
                        return false;
                    }
                },

                setNamespace: (namespace: string) => {
                    currentNamespace = namespace;
                },

                getNamespace: () => currentNamespace,

                getKubeconfig: () => kubeconfig,

                // ===== New Core APIs =====

                logs: async (podName: string, options?: LogsOptions) => {
                    let args = `logs ${podName}`;
                    if (options?.container) args += ` -c ${options.container}`;
                    if (options?.tail !== undefined) args += ` --tail=${options.tail}`;
                    if (options?.since) args += ` --since=${options.since}`;
                    if (options?.previous) args += ` --previous`;
                    if (options?.follow) args += ` -f`;
                    return executeCommand(args);
                },

                exec: async (podName: string, command: string | string[], options?: ExecOptions) => {
                    const cmd = Array.isArray(command) ? command.join(' ') : command;
                    let args = `exec ${podName}`;
                    if (options?.container) args += ` -c ${options.container}`;
                    args += ` -- ${cmd}`;
                    return executeCommand(args);
                },

                describe: async (resource: string, name?: string) => {
                    const args = name ? `describe ${resource} ${name}` : `describe ${resource}`;
                    return executeCommand(args);
                },

                wait: async (resource: string, name: string, condition: string, options?: WaitOptions) => {
                    const timeoutMs = options?.timeout ?? 60000;
                    const timeoutSec = Math.ceil(timeoutMs / 1000);

                    if (options?.forDelete) {
                        await executeCommand(`wait ${resource}/${name} --for=delete --timeout=${timeoutSec}s`);
                    } else {
                        await executeCommand(`wait ${resource}/${name} --for=condition=${condition} --timeout=${timeoutSec}s`);
                    }
                },

                waitForReplicas: async (resource: string, name: string, count: number, timeout = 60000) => {
                    const startTime = Date.now();
                    const checkInterval = 2000;

                    while (Date.now() - startTime < timeout) {
                        try {
                            const res = await methods.get<{ status?: { readyReplicas?: number } }>(resource, name);
                            const readyReplicas = res?.status?.readyReplicas ?? 0;
                            if (readyReplicas >= count) {
                                return;
                            }
                        } catch {
                            // Resource might not exist yet, continue waiting
                        }
                        await new Promise((resolve) => setTimeout(resolve, checkInterval));
                    }
                    throw new Error(`Timeout waiting for ${resource}/${name} to have ${count} ready replicas`);
                },

                // ===== Resource Management APIs =====

                scale: async (resource: string, name: string, replicas: number) => {
                    await executeCommand(`scale ${resource}/${name} --replicas=${replicas}`);
                },

                patch: async (
                    resource: string,
                    name: string,
                    patch: object | string,
                    type: 'strategic' | 'merge' | 'json' = 'strategic'
                ) => {
                    const patchStr = typeof patch === 'string' ? patch : JSON.stringify(patch);
                    const escapedPatch = patchStr.replace(/'/g, "'\\''");
                    await executeCommand(`patch ${resource} ${name} --type=${type} -p '${escapedPatch}'`);
                },

                label: async (resource: string, name: string, labels: Record<string, string | null>) => {
                    const labelArgs = Object.entries(labels)
                        .map(([key, value]) => (value === null ? `${key}-` : `${key}=${value}`))
                        .join(' ');
                    await executeCommand(`label ${resource} ${name} ${labelArgs} --overwrite`);
                },

                annotate: async (resource: string, name: string, annotations: Record<string, string | null>) => {
                    const annotationArgs = Object.entries(annotations)
                        .map(([key, value]) => (value === null ? `${key}-` : `${key}=${value}`))
                        .join(' ');
                    await executeCommand(`annotate ${resource} ${name} ${annotationArgs} --overwrite`);
                },

                // ===== Rollout Management =====

                rollout: {
                    status: async (resource: string, name: string): Promise<RolloutStatus> => {
                        // Get resource status via JSON
                        const res = await methods.get<{
                            status?: {
                                replicas?: number;
                                updatedReplicas?: number;
                                availableReplicas?: number;
                                readyReplicas?: number;
                                conditions?: Array<{ type: string; status: string }>;
                            };
                        }>(resource, name);

                        const status = res?.status ?? {};
                        const conditions = status.conditions ?? [];
                        const availableCondition = conditions.find((c) => c.type === 'Available');
                        const progressingCondition = conditions.find((c) => c.type === 'Progressing');

                        const ready =
                            availableCondition?.status === 'True' &&
                            (progressingCondition?.status === 'True' || status.updatedReplicas === status.replicas);

                        return {
                            ready,
                            replicas: status.replicas ?? 0,
                            updatedReplicas: status.updatedReplicas ?? 0,
                            availableReplicas: status.availableReplicas ?? 0,
                        };
                    },

                    history: async (resource: string, name: string): Promise<RolloutHistoryEntry[]> => {
                        const output = await executeCommand(`rollout history ${resource}/${name}`);
                        const lines = output.split('\n').filter((line) => line.trim());

                        // Parse history output
                        const entries: RolloutHistoryEntry[] = [];
                        for (const line of lines) {
                            const match = line.match(/^\s*(\d+)\s+(.*)$/);
                            if (match) {
                                entries.push({
                                    revision: parseInt(match[1], 10),
                                    changeCause: match[2].trim() || undefined,
                                });
                            }
                        }
                        return entries;
                    },

                    undo: async (resource: string, name: string, revision?: number) => {
                        const args = revision !== undefined ? `--to-revision=${revision}` : '';
                        await executeCommand(`rollout undo ${resource}/${name} ${args}`.trim());
                    },

                    restart: async (resource: string, name: string) => {
                        await executeCommand(`rollout restart ${resource}/${name}`);
                    },

                    pause: async (resource: string, name: string) => {
                        await executeCommand(`rollout pause ${resource}/${name}`);
                    },

                    resume: async (resource: string, name: string) => {
                        await executeCommand(`rollout resume ${resource}/${name}`);
                    },
                },

                // ===== Advanced Features =====

                portForward: async (
                    resource: string,
                    ports: string,
                    options?: PortForwardOptions
                ): Promise<PortForwardHandle> => {
                    const address = options?.address ?? '127.0.0.1';
                    const [localPortStr] = ports.split(':');
                    const localPort = parseInt(localPortStr, 10);

                    // Build the kubectl command
                    const args = ['kubectl'];
                    if (currentNamespace) {
                        args.push('-n', currentNamespace);
                    }
                    args.push('port-forward', resource, ports, `--address=${address}`);

                    // Start port-forward using Bun.spawn (silent, not in terminal)
                    const proc = Bun.spawn(args, {
                        stdout: 'pipe',
                        stderr: 'pipe',
                    });

                    // Wait for port-forward to establish
                    const delay = options?.delay ?? 2000;
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    return {
                        localPort,
                        stop: async () => {
                            // Kill the process directly
                            proc.kill();
                            await proc.exited;
                        },
                    };
                },

                waitForService: async (name: string, timeout = 60000): Promise<ServiceEndpoint> => {
                    const timeoutSec = Math.ceil(timeout / 1000);

                    // 使用 kubectl wait 等待 Endpoints 有地址，替代轮询
                    const waitCmd = buildCommand(
                        `wait --for=jsonpath='{.subsets[0].addresses}' endpoints/${name} --timeout=${timeoutSec}s`
                    );
                    await testContext.terminal.run(waitCmd);

                    // 获取 Service 和 Endpoints 详细信息
                    const svc = await methods.get<{
                        spec?: { clusterIP?: string; ports?: Array<{ port: number }> };
                    }>('service', name);

                    const endpoints = await methods.get<{
                        subsets?: Array<{ addresses?: Array<{ ip: string }> }>;
                    }>('endpoints', name);

                    const clusterIP = svc?.spec?.clusterIP;
                    const port = svc?.spec?.ports?.[0]?.port;
                    const addresses = endpoints?.subsets?.[0]?.addresses ?? [];

                    if (!clusterIP || !port) {
                        throw new Error(`Service ${name} missing clusterIP or port`);
                    }

                    return {
                        clusterIP,
                        port,
                        endpoints: addresses.map((a) => a.ip),
                    };
                },

                getEvents: async (options?: EventOptions): Promise<K8sEvent[]> => {
                    let args = 'get events -o json';
                    if (options?.fieldSelector) {
                        args += ` --field-selector=${options.fieldSelector}`;
                    }
                    const cmd = buildCommand(args);

                    try {
                        const result = await testContext.terminal.run(cmd);
                        let stdout = result.stdout;
                        if (testContext.terminal.isRecording?.()) {
                            const silentResult = await testContext.terminal.run(cmd, { silent: true });
                            stdout = silentResult.stdout;
                        }
                        const data = JSON.parse(stdout) as {
                            items?: Array<{
                                type?: string;
                                reason?: string;
                                message?: string;
                                involvedObject?: { kind?: string; name?: string };
                                lastTimestamp?: string;
                            }>
                        };
                        const items = data.items ?? [];

                        return items.map((item) => ({
                            type: (item.type ?? 'Normal') as 'Normal' | 'Warning',
                            reason: item.reason ?? '',
                            message: item.message ?? '',
                            involvedObject: {
                                kind: item.involvedObject?.kind ?? '',
                                name: item.involvedObject?.name ?? '',
                            },
                            lastTimestamp: item.lastTimestamp ?? '',
                        }));
                    } catch {
                        return [];
                    }
                },

                getNodes: async (options?: { selector?: string }): Promise<NodeInfo[]> => {
                    let args = 'get nodes -o json';
                    if (options?.selector) {
                        args += ` -l ${options.selector}`;
                    }
                    const cmd = buildCommand(args);

                    try {
                        const result = await testContext.terminal.run(cmd);
                        let stdout = result.stdout;
                        if (testContext.terminal.isRecording?.()) {
                            const silentResult = await testContext.terminal.run(cmd, { silent: true });
                            stdout = silentResult.stdout;
                        }
                        type NodeItem = {
                            metadata?: { name?: string; labels?: Record<string, string> };
                            status?: {
                                conditions?: Array<{ type: string; status: string }>;
                                addresses?: Array<{ type: string; address: string }>;
                                nodeInfo?: { kubeletVersion?: string };
                            };
                        };
                        const data = JSON.parse(stdout) as { items?: NodeItem[] };
                        const items = data.items ?? [];

                        return items.map((item) => {
                            const conditions = item.status?.conditions ?? [];
                            const readyCondition = conditions.find((c) => c.type === 'Ready');
                            const labels = item.metadata?.labels ?? {};

                            // Extract roles from labels
                            const roles = Object.keys(labels)
                                .filter((k) => k.startsWith('node-role.kubernetes.io/'))
                                .map((k) => k.replace('node-role.kubernetes.io/', ''));

                            const addresses = item.status?.addresses ?? [];
                            const internalIP =
                                addresses.find((a) => a.type === 'InternalIP')?.address ?? '';

                            return {
                                name: item.metadata?.name ?? '',
                                status: (readyCondition?.status === 'True' ? 'Ready' : 'NotReady') as 'Ready' | 'NotReady',
                                roles: roles.length > 0 ? roles : ['<none>'],
                                version: item.status?.nodeInfo?.kubeletVersion ?? '',
                                internalIP,
                            };
                        });
                    } catch {
                        return [];
                    }
                },

                cp: async (source: string, dest: string, options?: CpOptions) => {
                    let args = `cp ${source} ${dest}`;
                    if (options?.container) {
                        args += ` -c ${options.container}`;
                    }
                    await executeCommand(args);
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

// Re-export matchers
export {
    K8sResource,
    pod,
    deployment,
    service,
    statefulset,
    job,
    configmap,
    secret,
    resource,
    registerK8sMatchers,
} from './matchers.js';
