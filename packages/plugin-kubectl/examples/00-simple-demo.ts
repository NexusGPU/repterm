/**
 * 示例 0: 简单演示（无需 K8s 集群）
 *
 * 验证 kubectl 插件基础功能，无需连接 Kubernetes 集群
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
} from '../../repterm/src/index.js';
import { kubectlPlugin } from '../src/index.js';

// 配置插件
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

describe('Kubectl 插件基础功能', () => {
    test('验证命名空间配置', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 验证初始命名空间
        const ns = kubectl.getNamespace();
        if (ns !== 'default') {
            throw new Error(`Expected namespace 'default', got '${ns}'`);
        }

        // 切换命名空间
        kubectl.setNamespace('kube-system');
        if (kubectl.getNamespace() !== 'kube-system') {
            throw new Error('Namespace switch failed');
        }

        // 恢复
        kubectl.setNamespace('default');
    });

    test('验证命令构建', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 验证 command 方法生成正确的命令
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

    test('执行 kubectl version (run API)', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用插件的 run 方法执行命令
        await kubectl.run('version --client');
    });
});
