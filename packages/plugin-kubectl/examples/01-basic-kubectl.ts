/**
 * Example 1: Basic Kubectl Operations
 *
 * Demonstrates the basic kubectl plugin API: apply, delete, get, exists, waitForPod
 *
 * Running instructions:
 *   bun run repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
 *
 * Prerequisites:
 *   - kubectl is configured and connected to a Kubernetes cluster
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
    expect,
} from 'repterm';
import { kubectlPlugin } from '@nexusgpu/repterm-plugin-kubectl';

// Configure plugin
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// Pod YAML for testing
const nginxPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: nginx-test
  labels:
    app: nginx
    env: test
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80
`;

describe('Basic Kubectl API', { record: true }, () => {
    // ===== apply - Create resources =====
    test('apply - Create Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use apply API to create Pod
        await kubectl.apply(nginxPodYaml);
    });

    // ===== waitForPod - Wait for Pod to be ready =====
    test('waitForPod - Wait for Pod Running', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use waitForPod API to wait for Pod to enter Running status
        await kubectl.waitForPod('nginx-test', 'Running', 60000);
    });

    // ===== exists - Check if resource exists =====
    test('exists - Check if Pod exists', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use exists API to check resource
        const podExists = await kubectl.exists('pod', 'nginx-test');
        if (!podExists) {
            throw new Error('Pod should exist');
        }

        // Check if non-existent resource exists
        const notExists = await kubectl.exists('pod', 'non-existent-pod');
        if (notExists) {
            throw new Error('Non-existent pod should not exist');
        }
    });

    // ===== get - Get resource information =====
    test('get - Get Pod information', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use get API to retrieve resource JSON
        const pod = await kubectl.get<{
            metadata: { name: string; labels: Record<string, string> };
            status: { phase: string };
        }>('pod', 'nginx-test');

        if (pod.metadata.name !== 'nginx-test') {
            throw new Error(`Expected pod name 'nginx-test', got '${pod.metadata.name}'`);
        }
    });

    // ===== run - Execute raw kubectl command =====
    test('run - Execute raw kubectl command', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use run API to execute arbitrary kubectl command
        await kubectl.run('get pod nginx-test -o wide');
    });

    // ===== delete - Delete resources =====
    test('delete - Delete Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use delete API to delete resource
        await kubectl.delete('pod', 'nginx-test', { force: true });

        // Verify deletion
        // Note: deletion may take some time
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
});
