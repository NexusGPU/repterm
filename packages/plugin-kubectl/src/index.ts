/// <reference path="./matchers.d.ts" />
/**
 * Kubectl Plugin for Repterm
 *
 * Provides Kubernetes-specific testing utilities and commands.
 *
 * @packageDocumentation
 */

import { definePlugin, type BasePluginContext, type PluginHooks } from 'repterm-api';
import {
    KubectlResult,
    ApplyResult,
    DeleteResult,
    PatchResult,
    ScaleResult,
    LabelResult,
    WaitResult,
} from './result.js';

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
 * Options for kubectl get command
 */
export interface GetOptions {
    /** Label selector (-l) */
    selector?: string;
    /** Field selector (--field-selector) */
    fieldSelector?: string;
    /** Get resources from all namespaces (-A) */
    allNamespaces?: boolean;
    /** jq filter expression to filter JSON output */
    jqFilter?: string;
    /** Enable watch mode (-w) - returns WatchProcess instead of data */
    watch?: boolean;
    /** Output format for watch mode (wide, name, custom-columns, etc.) */
    output?: string;
}

/**
 * Watch process controller
 */
export interface WatchProcess {
    /** Interrupt the watch process (sends Ctrl+C) */
    interrupt: () => Promise<void>;
}

/**
 * Cluster information returned by clusterInfo
 */
export interface ClusterInfo {
    /** Whether the cluster is reachable */
    reachable: boolean;
    /** Kubernetes control plane URL */
    controlPlane?: string;
    /** CoreDNS service URL */
    coreDNS?: string;
    /** Server version */
    serverVersion?: string;
    /** Error message if cluster is not reachable */
    error?: string;
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
    apply: (yaml: string) => Promise<ApplyResult>;
    /** Delete a resource */
    delete: (resource: string, name: string, options?: DeleteOptions) => Promise<DeleteResult>;
    /** Get resource as JSON, supports label selector and other options */
    get: {
        <T = unknown>(resource: string, name?: string, options?: GetOptions & { watch?: false | undefined }): Promise<T>;
        (resource: string, name: string | undefined, options: GetOptions & { watch: true }): Promise<WatchProcess>;
    };
    /** Get a specific field value using JSONPath expression */
    getJsonPath: <T = string>(resource: string, name: string, jsonPath: string, options?: GetOptions) => Promise<T | undefined>;
    /** Check if a resource exists */
    exists: (resource: string, name: string) => Promise<boolean>;
    /** Set the current namespace */
    setNamespace: (namespace: string) => void;
    /** Get the current namespace */
    getNamespace: () => string;
    /** Get the kubeconfig path */
    getKubeconfig: () => string | undefined;
    /** Return shell command to set KUBECONFIG (e.g. for use in terminal.run). Example: setCluster('/path/to/kubeconfig') => "export KUBECONFIG='/path/to/kubeconfig'" */
    setCluster: (kubeConfigPath: string) => string;
    /** Get cluster connection info */
    clusterInfo: () => Promise<ClusterInfo>;

    // ===== New Core APIs =====

    /** Get pod logs */
    logs: (podName: string, options?: LogsOptions) => Promise<string>;
    /** Execute command in pod */
    exec: (podName: string, command: string | string[], options?: ExecOptions) => Promise<string>;
    /** Get detailed resource description */
    describe: (resource: string, name?: string) => Promise<string>;
    /** Wait for a condition on a resource */
    wait: (resource: string, name: string, condition: string, options?: WaitOptions) => Promise<WaitResult>;
    /** Wait for a JSONPath field to have a specific value */
    waitForJsonPath: (
        resource: string,
        name: string,
        jsonPath: string,
        value: string,
        timeout?: number
    ) => Promise<void>;
    /** Wait for resource to have specific replica count */
    waitForReplicas: (resource: string, name: string, count: number, timeout?: number) => Promise<void>;

    // ===== Resource Management APIs =====

    /** Scale a resource (Deployment, ReplicaSet, StatefulSet) */
    scale: (resource: string, name: string, replicas: number) => Promise<ScaleResult>;
    /** Patch a resource */
    patch: (
        resource: string,
        name: string,
        patch: object | string,
        type?: 'strategic' | 'merge' | 'json'
    ) => Promise<PatchResult>;
    /** Add or update labels on a resource */
    label: (resource: string, name: string, labels: Record<string, string | null>) => Promise<LabelResult>;
    /** Add or update annotations on a resource */
    annotate: (resource: string, name: string, annotations: Record<string, string | null>) => Promise<LabelResult>;

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
 * import { kubectlPlugin } from '@nexusgpu/repterm-plugin-kubectl';
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

                    // Use kubectl wait instead of polling for cleaner recording
                    const cmd = buildCommand(
                        `wait --for=jsonpath='{.status.phase}'=${status} pod/${name} --timeout=${timeoutSec}s`
                    );
                    await testContext.terminal.run(cmd);
                },

                apply: async (yaml: string): Promise<ApplyResult> => {
                    // Use heredoc to avoid quote> prompt in recording
                    const cmd = `cat <<'EOF' | kubectl -n ${currentNamespace} apply -f -
${yaml.trim()}
EOF`;
                    const result = await testContext.terminal.run(`${cmd}`);
                    return new ApplyResult(result.output, cmd, result.code);
                },

                delete: async (resource: string, name: string, options?: DeleteOptions): Promise<DeleteResult> => {
                    let args = `delete ${resource} ${name} --ignore-not-found`;
                    if (options?.force) {
                        args += ' --grace-period=0 --force';
                    }
                    const cmd = buildCommand(args);
                    const result = await testContext.terminal.run(
                        cmd,
                        { timeout: options?.force ? 10000 : 60000 }
                    );
                    return new DeleteResult(result.output, cmd, result.code);
                },

                get: ((resource: string, name?: string, options?: GetOptions): any => {
                    // Watch mode: start continuous watch, return Promise<WatchProcess>
                    if (options?.watch) {
                        let args = name ? `get ${resource} ${name} -w` : `get ${resource} -w`;
                        if (options.selector) {
                            args += ` -l ${options.selector}`;
                        }
                        if (options.fieldSelector) {
                            args += ` --field-selector=${options.fieldSelector}`;
                        }
                        if (options.allNamespaces) {
                            args += ' -A';
                        }
                        if (options.output) {
                            args += ` -o ${options.output}`;
                        }

                        const cmd = buildCommand(args);
                        const proc = testContext.terminal.run(cmd);

                        // Return Promise so caller must await; ensures stepTitle and command input complete
                        return (async (): Promise<WatchProcess> => {
                            await proc.start?.();  // Wait for input to finish
                            return {
                                interrupt: async () => {
                                    await proc.interrupt?.();
                                }
                            };
                        })();
                    }

                    // Normal mode: fetch JSON data
                    return (async () => {
                        let args = name ? `get ${resource} ${name}` : `get ${resource}`;
                        if (options?.selector) {
                            args += ` -l ${options.selector}`;
                        }
                        if (options?.fieldSelector) {
                            args += ` --field-selector=${options.fieldSelector}`;
                        }
                        if (options?.allNamespaces) {
                            args += ' -A';
                        }
                        args += ' -o json';

                        // Build full command with optional jq filter
                        let fullCmd = buildCommand(args);
                        if (options?.jqFilter) {
                            fullCmd += ` | jq '${options.jqFilter}'`;
                        }

                        const result = await testContext.terminal.run(fullCmd);

                        let stdout: string;
                        if (testContext.terminal.isPtyMode?.()) {
                            const silentResult = await testContext.terminal.run(fullCmd, { silent: true });
                            stdout = silentResult.stdout;
                        } else {
                            stdout = result.stdout;
                        }

                        // Check for kubectl errors before parsing JSON
                        const trimmed = stdout.trim();
                        if (trimmed.startsWith('error:') || trimmed.startsWith('Error') ||
                            trimmed.includes('Error from server') || trimmed.includes('not found')) {
                            throw new Error(`kubectl get failed: ${trimmed}`);
                        }

                        try {
                            return JSON.parse(trimmed);
                        } catch {
                            return trimmed;
                        }
                    })();
                }) as KubectlMethods['get'],

                getJsonPath: async <T = string>(
                    resource: string,
                    name: string,
                    jsonPath: string,
                    options?: GetOptions
                ): Promise<T | undefined> => {
                    let args = `get ${resource} ${name}`;
                    if (options?.selector) {
                        args += ` -l ${options.selector}`;
                    }
                    if (options?.fieldSelector) {
                        args += ` --field-selector=${options.fieldSelector}`;
                    }
                    if (options?.allNamespaces) {
                        args += ' -A';
                    }
                    // Ensure jsonPath is properly quoted
                    const escapedPath = jsonPath.startsWith('{') ? jsonPath : `{${jsonPath}}`;
                    args += ` -o jsonpath='${escapedPath}'`;
                    const cmd = buildCommand(args);
                    const result = await testContext.terminal.run(cmd);
                    const output = testContext.terminal.isPtyMode?.()
                        ? (await testContext.terminal.run(cmd, { silent: true })).stdout
                        : result.stdout;

                    const trimmed = output.trim();

                    // Handle empty/null values
                    if (trimmed === '' || trimmed === '<none>' || trimmed === '<nil>') {
                        return undefined;
                    }

                    // Try to parse as JSON (numbers, booleans, etc.), otherwise return as string
                    try {
                        return JSON.parse(trimmed) as T;
                    } catch {
                        return trimmed as T;
                    }
                },

                exists: async (resource: string, name: string): Promise<boolean> => {
                    try {
                        const cmd = buildCommand(`get ${resource} ${name} -o name`);
                        const result = await testContext.terminal.run(`${cmd}`);
                        // In PTY mode, use silent run for clean output
                        let stdout = result.stdout;
                        if (testContext.terminal.isPtyMode?.()) {
                            const silentResult = await testContext.terminal.run(cmd, { silent: true });
                            stdout = silentResult.stdout;
                        }
                        // Support both formats: deployment/name and deployment.apps/name
                        return stdout.includes(`/${name}`);
                    } catch {
                        return false;
                    }
                },

                setNamespace: (namespace: string) => {
                    currentNamespace = namespace;
                },

                getNamespace: () => currentNamespace,

                getKubeconfig: () => kubeconfig,

                setCluster: (kubeConfigPath: string): string => {
                    const quoted = kubeConfigPath.replace(/'/g, "'\\''");
                    return `export KUBECONFIG='${quoted}'`;
                },

                clusterInfo: async (): Promise<ClusterInfo> => {
                    try {
                        // Run cluster-info command
                        let kubectlCmd = 'kubectl';
                        if (kubeconfig) {
                            kubectlCmd += ` --kubeconfig=${kubeconfig}`;
                        }
                        const result = await testContext.terminal.run(`${kubectlCmd} cluster-info`);
                        const output = result.output;

                        // Parse control plane URL
                        const controlPlaneMatch = output.match(/Kubernetes (?:control plane|master) is running at (https?:\/\/[^\s]+)/);
                        const coreDNSMatch = output.match(/CoreDNS is running at (https?:\/\/[^\s]+)/);

                        // Get server version
                        let serverVersion: string | undefined;
                        try {
                            const versionResult = await testContext.terminal.run(`${kubectlCmd} version --short 2>/dev/null || ${kubectlCmd} version -o json`, { silent: true });
                            const versionOutput = versionResult.stdout;
                            // Try to parse JSON format
                            try {
                                const versionJson = JSON.parse(versionOutput);
                                serverVersion = versionJson.serverVersion?.gitVersion;
                            } catch {
                                // Try short format: Server Version: v1.28.0
                                const versionMatch = versionOutput.match(/Server Version:\s*(v[\d.]+)/);
                                serverVersion = versionMatch?.[1];
                            }
                        } catch {
                            // Ignore version fetch errors
                        }

                        return {
                            reachable: true,
                            controlPlane: controlPlaneMatch?.[1],
                            coreDNS: coreDNSMatch?.[1],
                            serverVersion,
                        };
                    } catch (e) {
                        return {
                            reachable: false,
                            error: e instanceof Error ? e.message : String(e),
                        };
                    }
                },

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

                wait: async (resource: string, name: string, condition: string, options?: WaitOptions): Promise<WaitResult> => {
                    const timeoutMs = options?.timeout ?? 20000;
                    const timeoutSec = Math.ceil(timeoutMs / 1000);

                    let cmd: string;
                    if (options?.forDelete) {
                        cmd = buildCommand(`wait ${resource}/${name} --for=delete --timeout=${timeoutSec}s`);
                    } else {
                        cmd = buildCommand(`wait ${resource}/${name} --for=condition=${condition} --timeout=${timeoutSec}s`);
                    }

                    const result = await testContext.terminal.run(cmd);
                    return new WaitResult(result.output, cmd, result.code);
                },

                waitForJsonPath: async (
                    resource: string,
                    name: string,
                    jsonPath: string,
                    value: string,
                    timeout = 60000
                ) => {
                    const timeoutSec = Math.ceil(timeout / 1000);
                    // Ensure jsonPath is properly formatted for kubectl wait
                    const formattedPath = jsonPath.startsWith('{') ? jsonPath : `{${jsonPath}}`;
                    await executeCommand(
                        `wait ${resource}/${name} --for=jsonpath='${formattedPath}'=${value} --timeout=${timeoutSec}s`
                    );
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

                scale: async (resource: string, name: string, replicas: number): Promise<ScaleResult> => {
                    const cmd = buildCommand(`scale ${resource}/${name} --replicas=${replicas}`);
                    const result = await testContext.terminal.run(cmd);
                    return new ScaleResult(result.output, cmd, result.code);
                },

                patch: async (
                    resource: string,
                    name: string,
                    patch: object | string,
                    type: 'strategic' | 'merge' | 'json' = 'strategic'
                ): Promise<PatchResult> => {
                    const patchStr = typeof patch === 'string' ? patch : JSON.stringify(patch);
                    const escapedPatch = patchStr.replace(/'/g, "'\\''");
                    const cmd = buildCommand(`patch ${resource} ${name} --type=${type} -p '${escapedPatch}'`);
                    const result = await testContext.terminal.run(cmd);
                    return new PatchResult(result.output, cmd, result.code);
                },

                label: async (resource: string, name: string, labels: Record<string, string | null>): Promise<LabelResult> => {
                    const labelArgs = Object.entries(labels)
                        .map(([key, value]) => (value === null ? `${key}-` : `${key}=${value}`))
                        .join(' ');
                    const cmd = buildCommand(`label ${resource} ${name} ${labelArgs} --overwrite`);
                    const result = await testContext.terminal.run(cmd);
                    return new LabelResult(result.output, cmd, result.code);
                },

                annotate: async (resource: string, name: string, annotations: Record<string, string | null>): Promise<LabelResult> => {
                    const annotationArgs = Object.entries(annotations)
                        .map(([key, value]) => (value === null ? `${key}-` : `${key}=${value}`))
                        .join(' ');
                    const cmd = buildCommand(`annotate ${resource} ${name} ${annotationArgs} --overwrite`);
                    const result = await testContext.terminal.run(cmd);
                    return new LabelResult(result.output, cmd, result.code);
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

                    // Use kubectl wait for Endpoints to have addresses instead of polling
                    const waitCmd = buildCommand(
                        `wait --for=jsonpath='{.subsets[0].addresses}' endpoints/${name} --timeout=${timeoutSec}s`
                    );
                    await testContext.terminal.run(waitCmd);

                    // Fetch Service and Endpoints details
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
                        if (testContext.terminal.isPtyMode?.()) {
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
                        if (testContext.terminal.isPtyMode?.()) {
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
    // Tensor Fusion CRD wrappers
    gpupool,
    gpu,
    tensorfusionworkload,
    tensorfusionconnection,
    crd,
    registerK8sMatchers,
} from './matchers.js';

// Re-export result types
export {
    KubectlResult,
    ApplyResult,
    DeleteResult,
    PatchResult,
    ScaleResult,
    LabelResult,
} from './result.js';
