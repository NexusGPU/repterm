/**
 * Example 4: Rollout Management
 *
 * Demonstrates kubectl plugin's rollout API: status, history, restart, undo, pause, resume
 *
 * Run:
 *   bun run repterm packages/plugin-kubectl/examples/04-rollout.ts
 *
 * Prerequisites:
 *   - kubectl is configured and connected to Kubernetes cluster
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
} from '../../repterm/src/index.js';
import { kubectlPlugin } from '../src/index.js';

// Configure plugin
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// Test Deployment
const appDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deploy
  annotations:
    kubernetes.io/change-cause: "Initial deployment"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: nginx:1.20-alpine
        ports:
        - containerPort: 80
`;

describe('Rollout Management API', () => {
    // Setup test environment
    test('Setup: Create test Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.apply(appDeploymentYaml);
        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    // ===== rollout.status - Get rollout status =====
    test('rollout.status - Get rollout status', async (ctx) => {
        const { kubectl } = ctx.plugins;

        const status = await kubectl.rollout.status('deployment', 'app-deploy');
    });

    // ===== rollout.history - Get rollout history =====
    test('rollout.history - Get rollout history', async (ctx) => {
        const { kubectl } = ctx.plugins;

        const history = await kubectl.rollout.history('deployment', 'app-deploy');
        for (const entry of history) {
        }
    });

    // ===== rollout.restart - Restart Deployment =====
    test('rollout.restart - Restart Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.restart('deployment', 'app-deploy');

        // Wait for restart to complete
        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    // ===== rollout.pause / resume - Pause/Resume rollout =====
    test('rollout.pause - Pause rollout', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.pause('deployment', 'app-deploy');
    });

    test('rollout.resume - Resume rollout', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.resume('deployment', 'app-deploy');
    });

    // Trigger new version for rollback testing
    test('Trigger image update', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use patch to update image
        await kubectl.patch('deployment', 'app-deploy', {
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'nginx:1.21-alpine',
                        }],
                    },
                },
            },
        });

        // Add change cause annotation
        await kubectl.annotate('deployment', 'app-deploy', {
            'kubernetes.io/change-cause': 'Update to nginx:1.21',
        });

        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    // ===== rollout.undo - Rollback =====
    test('rollout.undo - Rollback to previous version', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.undo('deployment', 'app-deploy');

        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    test('rollout.undo - Rollback to specific version', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Get history to find available version
        const history = await kubectl.rollout.history('deployment', 'app-deploy');
        if (history.length > 1) {
            const targetRevision = history[0].revision;
            await kubectl.rollout.undo('deployment', 'app-deploy', targetRevision);
        } else {
        }
    });

    // Cleanup
    test('Cleanup: Delete test Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('deployment', 'app-deploy', { force: true });
    });
});
