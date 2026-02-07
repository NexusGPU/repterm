/**
 * Example 0: Simple demo (no K8s cluster required)
 *
 * Verifies kubectl plugin basics without connecting to a Kubernetes cluster.
 *
 * Run: bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
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

describe('Kubectl plugin basics', () => {
    test('namespace configuration', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Verify initial namespace
        const ns = kubectl.getNamespace();
        if (ns !== 'default') {
            throw new Error(`Expected namespace 'default', got '${ns}'`);
        }

        // Switch namespace
        kubectl.setNamespace('kube-system');
        if (kubectl.getNamespace() !== 'kube-system') {
            throw new Error('Namespace switch failed');
        }

        // Restore
        kubectl.setNamespace('default');
    });

    test('command building', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Verify command() produces correct command
        const cmd = kubectl.command('get pods');
        if (!cmd.includes('kubectl')) {
            throw new Error('Command should contain kubectl');
        }
        if (!cmd.includes('-n default')) {
            throw new Error('Command should contain namespace');
        }
        if (!cmd.includes('get pods')) {
            throw new Error('Command should contain get pods');
        }
    });

    test('kubectl version (run API)', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Execute via plugin run()
        await kubectl.run('version --client');
    });
});
