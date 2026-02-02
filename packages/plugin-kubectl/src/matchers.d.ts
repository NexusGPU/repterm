/**
 * Type augmentation for K8s matchers
 *
 * This file extends the Matchers interface from repterm
 * to provide TypeScript support for K8s-specific matchers.
 */

import 'repterm';

declare module 'repterm' {
    interface Matchers<R = void> {
        // Pod matchers
        /**
         * Assert that a Pod is in Running state
         * @param timeout - Timeout in milliseconds (default: 60000)
         */
        toBeRunning(timeout?: number): Promise<R>;

        /**
         * Assert that a Pod has a specific phase
         * @param phase - Expected phase ('Running' | 'Succeeded' | 'Failed' | 'Pending')
         */
        toHavePhase(phase: 'Running' | 'Succeeded' | 'Failed' | 'Pending'): Promise<R>;

        // Deployment/StatefulSet matchers
        /**
         * Assert that a resource has a specific number of replicas
         * @param count - Expected replica count
         */
        toHaveReplicas(count: number): Promise<R>;

        /**
         * Assert that a resource has a specific number of available replicas
         * @param count - Expected available replica count
         */
        toHaveAvailableReplicas(count: number): Promise<R>;

        /**
         * Assert that a Deployment is available
         */
        toBeAvailable(): Promise<R>;

        // Generic resource matchers
        /**
         * Assert that a resource exists in the cluster
         */
        toExistInCluster(): Promise<R>;

        /**
         * Assert that a resource has a specific label
         * @param key - Label key
         * @param value - Optional label value (if omitted, only checks key existence)
         */
        toHaveLabel(key: string, value?: string): Promise<R>;

        /**
         * Assert that a resource has a specific annotation
         * @param key - Annotation key
         * @param value - Optional annotation value (if omitted, only checks key existence)
         */
        toHaveAnnotation(key: string, value?: string): Promise<R>;

        /**
         * Assert that a resource has a specific condition
         * @param type - Condition type (e.g., 'Available', 'Ready')
         * @param status - Expected status ('True' | 'False' | 'Unknown')
         */
        toHaveCondition(type: string, status: 'True' | 'False' | 'Unknown'): Promise<R>;
    }
}
