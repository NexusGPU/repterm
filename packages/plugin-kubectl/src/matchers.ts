/**
 * Kubernetes Matchers for Repterm
 *
 * Provides expect() matchers for Kubernetes resources.
 * All operations are executed through kubectl API (PTY visible).
 *
 * @packageDocumentation
 */

import { expect, type MatcherResult } from 'repterm';
import type { KubectlMethods } from './index.js';

// ===== Module Augmentation for K8s Matchers =====

/**
 * Augment GenericExpect to include K8s matcher methods.
 * This provides TypeScript type information for dynamically added matchers.
 * 
 * Note: We augment with K8sResource constraint to ensure proper typing
 */
declare module 'repterm' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface GenericExpect<T> {
        /** Assert that a resource exists in the cluster */
        toExistInCluster(): Promise<this>;
        /** Assert that a Pod is in Running state */
        toBeRunning(timeout?: number): Promise<this>;
        /** Assert that a Pod has a specific phase */
        toHavePhase(phase: string): Promise<this>;
        /** Assert that a resource has a specific number of replicas */
        toHaveReplicas(count: number): Promise<this>;
        /** Assert that a resource has a specific number of available replicas */
        toHaveAvailableReplicas(count: number): Promise<this>;
        /** Assert that a Deployment is available */
        toBeAvailable(): Promise<this>;
        /** Assert that a resource has a specific label */
        toHaveLabel(key: string, value?: string): Promise<this>;
        /** Assert that a resource has a specific annotation */
        toHaveAnnotation(key: string, value?: string): Promise<this>;
        /** Assert that a resource has a specific condition */
        toHaveCondition(type: string, status: 'True' | 'False' | 'Unknown'): Promise<this>;
    }
}

// ===== K8sResource Wrapper =====

/**
 * Wrapper class for Kubernetes resources
 * Holds reference to kubectl methods for matcher operations
 */
export class K8sResource {
    constructor(
        public readonly kubectl: KubectlMethods,
        public readonly kind: string,
        public readonly name: string
    ) { }
}

// ===== Helper Functions =====

/**
 * Create a Pod resource wrapper
 */
export function pod(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'pod', name);
}

/**
 * Create a Deployment resource wrapper
 */
export function deployment(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'deployment', name);
}

/**
 * Create a Service resource wrapper
 */
export function service(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'service', name);
}

/**
 * Create a StatefulSet resource wrapper
 */
export function statefulset(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'statefulset', name);
}

/**
 * Create a Job resource wrapper
 */
export function job(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'job', name);
}

/**
 * Create a ConfigMap resource wrapper
 */
export function configmap(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'configmap', name);
}

/**
 * Create a Secret resource wrapper
 */
export function secret(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'secret', name);
}

/**
 * Create a generic resource wrapper
 */
export function resource(kubectl: KubectlMethods, kind: string, name: string): K8sResource {
    return new K8sResource(kubectl, kind, name);
}

// ===== Type Guard =====

function isK8sResource(value: unknown): value is K8sResource {
    return value instanceof K8sResource;
}

// ===== Register Matchers =====

/**
 * Register K8s matchers with expect
 */
export function registerK8sMatchers(): void {
    expect.extend({
        /**
         * Assert that a Pod is in Running state
         */
        async toBeRunning(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const timeout = (args[0] as number | undefined) ?? 60000;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            if (kind !== 'pod') {
                return {
                    pass: false,
                    message: () => `toBeRunning() is only valid for pods, got ${kind}`,
                };
            }

            try {
                await kubectl.waitForPod(name, 'Running', timeout);
                return {
                    pass: true,
                    message: () => `Expected pod/${name} not to be Running`,
                };
            } catch {
                return {
                    pass: false,
                    message: () => `Expected pod/${name} to be Running within ${timeout}ms`,
                    actual: 'Not Running',
                    expected: 'Running',
                };
            }
        },

        /**
         * Assert that a Pod has a specific phase
         */
        async toHavePhase(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const phase = args[0] as string;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{ status?: { phase?: string } }>(kind, name);
                const actualPhase = res?.status?.phase;
                const pass = actualPhase === phase;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have phase ${phase}`
                            : `Expected ${kind}/${name} to have phase ${phase}, got ${actualPhase}`,
                    actual: actualPhase,
                    expected: phase,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a resource has a specific number of replicas
         */
        async toHaveReplicas(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const count = args[0] as number;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{ status?: { replicas?: number } }>(kind, name);
                const actual = res?.status?.replicas ?? 0;
                const pass = actual === count;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have ${count} replicas`
                            : `Expected ${kind}/${name} to have ${count} replicas, got ${actual}`,
                    actual,
                    expected: count,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a resource has a specific number of available replicas
         */
        async toHaveAvailableReplicas(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const count = args[0] as number;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{ status?: { availableReplicas?: number } }>(kind, name);
                const actual = res?.status?.availableReplicas ?? 0;
                const pass = actual === count;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have ${count} available replicas`
                            : `Expected ${kind}/${name} to have ${count} available replicas, got ${actual}`,
                    actual,
                    expected: count,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a Deployment is available
         */
        async toBeAvailable(received: unknown): Promise<MatcherResult> {
            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{
                    status?: {
                        conditions?: Array<{ type: string; status: string }>;
                    };
                }>(kind, name);

                const conditions = res?.status?.conditions ?? [];
                const availableCondition = conditions.find((c) => c.type === 'Available');
                const pass = availableCondition?.status === 'True';

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to be available`
                            : `Expected ${kind}/${name} to be available`,
                    actual: availableCondition?.status,
                    expected: 'True',
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a resource exists in the cluster
         */
        async toExistInCluster(received: unknown): Promise<MatcherResult> {
            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;
            const exists = await kubectl.exists(kind, name);

            return {
                pass: exists,
                message: () =>
                    exists
                        ? `Expected ${kind}/${name} not to exist in cluster`
                        : `Expected ${kind}/${name} to exist in cluster`,
            };
        },

        /**
         * Assert that a resource has a specific label
         */
        async toHaveLabel(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const key = args[0] as string;
            const value = args[1] as string | undefined;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{ metadata?: { labels?: Record<string, string> } }>(kind, name);
                const labels = res?.metadata?.labels ?? {};
                const actualValue = labels[key];
                const pass = value !== undefined ? actualValue === value : key in labels;

                return {
                    pass,
                    message: () => {
                        if (value !== undefined) {
                            return pass
                                ? `Expected ${kind}/${name} not to have label ${key}=${value}`
                                : `Expected ${kind}/${name} to have label ${key}=${value}, got ${actualValue}`;
                        }
                        return pass
                            ? `Expected ${kind}/${name} not to have label ${key}`
                            : `Expected ${kind}/${name} to have label ${key}`;
                    },
                    actual: actualValue,
                    expected: value ?? `label "${key}" exists`,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a resource has a specific annotation
         */
        async toHaveAnnotation(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const key = args[0] as string;
            const value = args[1] as string | undefined;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{ metadata?: { annotations?: Record<string, string> } }>(kind, name);
                const annotations = res?.metadata?.annotations ?? {};
                const actualValue = annotations[key];
                const pass = value !== undefined ? actualValue === value : key in annotations;

                return {
                    pass,
                    message: () => {
                        if (value !== undefined) {
                            return pass
                                ? `Expected ${kind}/${name} not to have annotation ${key}=${value}`
                                : `Expected ${kind}/${name} to have annotation ${key}=${value}, got ${actualValue}`;
                        }
                        return pass
                            ? `Expected ${kind}/${name} not to have annotation ${key}`
                            : `Expected ${kind}/${name} to have annotation ${key}`;
                    },
                    actual: actualValue,
                    expected: value ?? `annotation "${key}" exists`,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a resource has a specific condition
         */
        async toHaveCondition(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const type = args[0] as string;
            const status = args[1] as 'True' | 'False' | 'Unknown';

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const res = await kubectl.get<{
                    status?: { conditions?: Array<{ type: string; status: string }> };
                }>(kind, name);
                const conditions = res?.status?.conditions ?? [];
                const condition = conditions.find((c) => c.type === type);
                const pass = condition?.status === status;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have condition ${type}=${status}`
                            : `Expected ${kind}/${name} to have condition ${type}=${status}, got ${condition?.status ?? 'not found'}`,
                    actual: condition?.status,
                    expected: status,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },
    });
}

// Auto-register matchers when this module is imported
registerK8sMatchers();
