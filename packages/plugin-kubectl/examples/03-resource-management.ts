/**
 * Example 3: Resource Management
 *
 * Demonstrates kubectl plugin resource management API: scale, patch, label, annotate, wait, waitForReplicas
 *
 * Running instructions:
 *   bun run repterm packages/plugin-kubectl/examples/03-resource-management.ts
 *
 * Prerequisites:
 *   - kubectl is configured and connected to a Kubernetes cluster
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

// Deployment for testing
const nginxDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deploy
  labels:
    app: nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.21-alpine
        ports:
        - containerPort: 80
`;

describe('Resource Management API', () => {
    // Setup test environment
    test('Setup: Create test Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.apply(nginxDeploymentYaml);

        // Wait for Deployment to be ready
        await kubectl.wait('deployment', 'nginx-deploy', 'Available', { timeout: 120000 });
    });

    // ===== scale - Scale replicas =====
    test('scale - Scale up replicas', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use scale API to scale to 3 replicas
        await kubectl.scale('deployment', 'nginx-deploy', 3);

        // Wait for replicas to be ready
        await kubectl.waitForReplicas('deployment', 'nginx-deploy', 3, 60000);
    });

    test('scale - Scale down replicas', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.scale('deployment', 'nginx-deploy', 1);
    });

    // ===== label - Manage labels =====
    test('label - Add labels', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use label API to add labels
        await kubectl.label('deployment', 'nginx-deploy', {
            env: 'production',
            team: 'platform',
        });

        // Verify
        const deploy = await kubectl.get<{
            metadata: { labels: Record<string, string> };
        }>('deployment', 'nginx-deploy');

        if (deploy.metadata.labels.env !== 'production') {
            throw new Error('Label env not set correctly');
        }
    });

    test('label - Delete labels', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use null value to delete labels
        await kubectl.label('deployment', 'nginx-deploy', {
            team: null,  // Delete team label
        });
    });

    // ===== annotate - Manage annotations =====
    test('annotate - Add annotations', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.annotate('deployment', 'nginx-deploy', {
            'description': 'Test deployment for kubectl plugin',
            'owner': 'test-team',
        });
    });

    test('annotate - Delete annotations', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.annotate('deployment', 'nginx-deploy', {
            'owner': null,  // Delete owner annotation
        });
    });

    // ===== patch - Patch update =====
    test('patch - Strategic Merge Patch', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use object format for patch
        await kubectl.patch('deployment', 'nginx-deploy', {
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'nginx',
                            resources: {
                                limits: { memory: '128Mi' },
                            },
                        }],
                    },
                },
            },
        }, 'strategic');
    });

    test('patch - JSON Patch', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use JSON Patch format
        await kubectl.patch('deployment', 'nginx-deploy', [
            { op: 'replace', path: '/spec/replicas', value: 2 },
        ], 'json');
    });

    // ===== wait - Wait for conditions =====
    test('wait - Wait for Deployment Available', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.wait('deployment', 'nginx-deploy', 'Available', { timeout: 60000 });
    });

    // Cleanup
    test('Cleanup: Delete test Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('deployment', 'nginx-deploy', { force: true });
    });
});
