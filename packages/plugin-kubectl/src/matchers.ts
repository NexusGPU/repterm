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
import { KubectlResult } from './result.js';

// ===== Module Augmentation for K8s Matchers =====

/**
 * Augment bun:test Matchers to include K8s matcher methods.
 * This provides TypeScript type information for dynamically added matchers.
 */
declare module 'bun:test' {
    interface Matchers<T> {
        /** Assert that a kubectl operation succeeded */
        toBeSuccessful(): Promise<void>;
        /** Assert that a resource exists in the cluster */
        toExistInCluster(): Promise<void>;
        /** Assert that a resource does not exist in the cluster */
        toNotExistInCluster(): Promise<void>;
        /** Assert that a Pod is in Running state */
        toBeRunning(timeout?: number): Promise<void>;
        /** Assert that a Pod has a specific phase */
        toHavePhase(phase: string): Promise<void>;
        /** Assert that a resource has a specific number of replicas */
        toHaveReplicas(count: number): Promise<void>;
        /** Assert that a resource has a specific number of ready replicas */
        toHaveReadyReplicas(count: number): Promise<void>;
        /** Assert that a resource has a specific number of available replicas */
        toHaveAvailableReplicas(count: number): Promise<void>;
        /** Assert that a Deployment is available */
        toBeAvailable(): Promise<void>;
        /** Assert that a resource has a specific label */
        toHaveLabel(key: string, value?: string): Promise<void>;
        /** Assert that a resource has a specific annotation */
        toHaveAnnotation(key: string, value?: string): Promise<void>;
        /** Assert that a resource has a specific condition */
        toHaveCondition(type: string, status: 'True' | 'False' | 'Unknown'): Promise<void>;
        /** Assert that a resource has a specific status field value (supports dot notation for nested paths) */
        toHaveStatusField(path: string, value: unknown): Promise<void>;
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

// ===== Tensor Fusion CRD Wrappers =====

/**
 * Create a GPUPool resource wrapper (Tensor Fusion CRD)
 */
export function gpupool(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'gpupool', name);
}

/**
 * Create a GPU resource wrapper (Tensor Fusion CRD)
 */
export function gpu(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'gpu', name);
}

/**
 * Create a TensorFusionWorkload resource wrapper (Tensor Fusion CRD)
 */
export function tensorfusionworkload(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'tensorfusionworkload', name);
}

/**
 * Create a TensorFusionConnection resource wrapper (Tensor Fusion CRD)
 */
export function tensorfusionconnection(kubectl: KubectlMethods, name: string): K8sResource {
    return new K8sResource(kubectl, 'tensorfusionconnection', name);
}

/**
 * Create a custom CRD resource wrapper with explicit API group
 * @param kubectl - kubectl methods instance
 * @param kind - Resource kind (e.g., 'gpupool.tensor-fusion.ai')
 * @param name - Resource name
 */
export function crd(kubectl: KubectlMethods, kind: string, name: string): K8sResource {
    return new K8sResource(kubectl, kind, name);
}

// ===== Type Guard =====

function isK8sResource(value: unknown): value is K8sResource {
    return value instanceof K8sResource;
}

function isKubectlResult(value: unknown): value is KubectlResult {
    return value instanceof KubectlResult;
}

// ===== Register Matchers =====

/**
 * Register K8s matchers with expect
 */
export function registerK8sMatchers(): void {
    expect.extend({
        /**
         * Assert that a kubectl operation succeeded
         */
        async toBeSuccessful(received: unknown): Promise<MatcherResult> {
            if (!isKubectlResult(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a KubectlResult (from kubectl.apply/delete/patch/scale/label)',
                };
            }

            const pass = received.successful;
            return {
                pass,
                message: () =>
                    pass
                        ? 'Expected kubectl command to fail, but it succeeded'
                        : `Expected kubectl command to succeed, but failed:\n${received.output.slice(0, 500)}`,
                actual: pass ? 'succeeded' : 'failed',
                expected: 'succeeded',
            };
        },

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
                const actualPhase = await kubectl.getJsonPath<string>(kind, name, '.status.phase');
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
                const actual = await kubectl.getJsonPath<number>(kind, name, '.status.replicas') ?? 0;
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
                const actual = await kubectl.getJsonPath<number>(kind, name, '.status.availableReplicas') ?? 0;
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
                const jsonPath = '.status.conditions[?(@.type=="Available")].status';
                const statusValue = await kubectl.getJsonPath<string>(kind, name, jsonPath);
                // JSONPath may return multiple values separated by space, take first
                const actualStatus = statusValue?.split(' ')?.[0];
                const pass = actualStatus === 'True';

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to be available`
                            : `Expected ${kind}/${name} to be available`,
                    actual: actualStatus,
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
                // Escape dots in label key for JSONPath
                const escapedKey = key.replace(/\./g, '\\.');
                const jsonPath = `.metadata.labels.${escapedKey}`;
                const actualValue = await kubectl.getJsonPath<string>(kind, name, jsonPath);
                const pass = value !== undefined ? actualValue === value : actualValue !== undefined;

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
                // Escape dots in annotation key for JSONPath
                const escapedKey = key.replace(/\./g, '\\.');
                const jsonPath = `.metadata.annotations.${escapedKey}`;
                const actualValue = await kubectl.getJsonPath<string>(kind, name, jsonPath);
                const pass = value !== undefined ? actualValue === value : actualValue !== undefined;

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
                const jsonPath = `.status.conditions[?(@.type=="${type}")].status`;
                const statusValue = await kubectl.getJsonPath<string>(kind, name, jsonPath);
                // JSONPath may return multiple values separated by space, take first
                const actualStatus = statusValue?.split(' ')?.[0];
                const pass = actualStatus === status;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have condition ${type}=${status}`
                            : `Expected ${kind}/${name} to have condition ${type}=${status}, got ${actualStatus ?? 'not found'}`,
                    actual: actualStatus,
                    expected: status,
                };
            } catch (e) {
                return {
                    pass: false,
                    message: () => `Failed to get ${kind}/${name}: ${e}`,
                };
            }
        },

        /**
         * Assert that a resource does not exist in the cluster
         */
        async toNotExistInCluster(received: unknown): Promise<MatcherResult> {
            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;
            const exists = await kubectl.exists(kind, name);

            return {
                pass: !exists,
                message: () =>
                    !exists
                        ? `Expected ${kind}/${name} to exist in cluster`
                        : `Expected ${kind}/${name} not to exist in cluster`,
            };
        },

        /**
         * Assert that a resource has a specific number of ready replicas
         */
        async toHaveReadyReplicas(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const count = args[0] as number;

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const actual = await kubectl.getJsonPath<number>(kind, name, '.status.readyReplicas') ?? 0;
                const pass = actual === count;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have ${count} ready replicas`
                            : `Expected ${kind}/${name} to have ${count} ready replicas, got ${actual}`,
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
         * Assert that a resource has a specific status field value
         * Supports dot notation for nested paths (e.g., 'phase', 'available.tflops')
         */
        async toHaveStatusField(received: unknown, ...args: unknown[]): Promise<MatcherResult> {
            const path = args[0] as string;
            const expectedValue = args[1];

            if (!isK8sResource(received)) {
                return {
                    pass: false,
                    message: () => 'Expected value to be a K8sResource',
                };
            }

            const { kubectl, kind, name } = received;

            try {
                const jsonPath = `.status.${path}`;
                const actual = await kubectl.getJsonPath<unknown>(kind, name, jsonPath);
                const pass = actual === expectedValue;

                return {
                    pass,
                    message: () =>
                        pass
                            ? `Expected ${kind}/${name} not to have status.${path} = ${JSON.stringify(expectedValue)}`
                            : `Expected ${kind}/${name} to have status.${path} = ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)}`,
                    actual,
                    expected: expectedValue,
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
