/**
 * Type augmentation for K8s matchers.
 *
 * This declaration augments bun:test matchers because repterm's expect()
 * re-exports bun:test expect.
 */

declare module 'bun:test' {
    interface Matchers<T> {
        toBeSuccessful(): Promise<void>;
        toExistInCluster(): Promise<void>;
        toNotExistInCluster(): Promise<void>;
        toBeRunning(timeout?: number): Promise<void>;
        toHavePhase(phase: string): Promise<void>;
        toHaveReplicas(count: number): Promise<void>;
        toHaveReadyReplicas(count: number): Promise<void>;
        toHaveAvailableReplicas(count: number): Promise<void>;
        toBeAvailable(): Promise<void>;
        toHaveLabel(key: string, value?: string): Promise<void>;
        toHaveAnnotation(key: string, value?: string): Promise<void>;
        toHaveCondition(type: string, status: 'True' | 'False' | 'Unknown'): Promise<void>;
        toHaveStatusField(path: string, value: unknown): Promise<void>;
    }
}
