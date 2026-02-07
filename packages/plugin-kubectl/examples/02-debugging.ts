/**
 * Example 2: Logging and Debugging
 *
 * Demonstrates kubectl plugin debugging API: logs, exec, describe
 *
 * Running instructions:
 *   bun run repterm packages/plugin-kubectl/examples/02-debugging.ts
 *
 * Prerequisites:
 *   - kubectl is configured and connected to a Kubernetes cluster
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
} from 'repterm';
import { kubectlPlugin } from '@nexusgpu/repterm-plugin-kubectl';

// Configure plugin
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// Pod for testing
const debugPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: debug-pod
  labels:
    app: debug
spec:
  containers:
  - name: main
    image: busybox
    command: ['sh', '-c', 'echo "Container started"; while true; do echo "heartbeat $(date)"; sleep 5; done']
`;

describe('Logging and Debugging API', () => {
    // Setup test environment
    test('Setup: Create test Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.apply(debugPodYaml);
        await kubectl.waitForPod('debug-pod', 'Running', 60000);
    });

    // ===== logs - Get Pod logs =====
    test('logs - Get Pod logs', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Basic log retrieval
        const logs = await kubectl.logs('debug-pod');
    });

    test('logs - Get logs with options', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use tail option to limit number of lines
        await kubectl.logs('debug-pod', { tail: 5 });

        // Use since option to filter by time
        await kubectl.logs('debug-pod', { since: '1m' });
    });

    // ===== exec - 在 Pod 中执行命令 =====
    test('exec - 执行简单命令', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 执行单个命令
        await kubectl.exec('debug-pod', 'hostname');
    });

    test('exec - Execute complex command', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Execute shell command
        await kubectl.exec('debug-pod', ['sh', '-c', 'ls -la / && echo "done"']);
    });

    // ===== describe - Get resource description =====
    test('describe - Get Pod description', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Get detailed description
        const description = await kubectl.describe('pod', 'debug-pod');
    });

    test('describe - Get description of all Pods', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Without specifying name, get description of all resources
        await kubectl.describe('pods');
    });

    // Cleanup
    test('Cleanup: Delete test Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('pod', 'debug-pod', { force: true });
    });
});
