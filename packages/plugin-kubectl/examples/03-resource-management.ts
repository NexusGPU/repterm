/**
 * 示例 3: 资源管理
 *
 * 演示 kubectl 插件的资源管理 API：scale, patch, label, annotate, wait, waitForReplicas
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/03-resource-management.ts
 *
 * 前置条件:
 *   - 已配置 kubectl 并连接到 Kubernetes 集群
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

// 测试用 Deployment
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

describe('资源管理 API', () => {
    // 准备测试环境
    test('准备: 创建测试 Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.apply(nginxDeploymentYaml);

        // 等待 Deployment 就绪
        await kubectl.wait('deployment', 'nginx-deploy', 'Available', { timeout: 120000 });
    });

    // ===== scale - 扩缩容 =====
    test('scale - 扩展副本数', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 scale API 扩展到 3 个副本
        await kubectl.scale('deployment', 'nginx-deploy', 3);

        // 等待副本就绪
        await kubectl.waitForReplicas('deployment', 'nginx-deploy', 3, 60000);
    });

    test('scale - 缩减副本数', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.scale('deployment', 'nginx-deploy', 1);
    });

    // ===== label - 管理标签 =====
    test('label - 添加标签', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 label API 添加标签
        await kubectl.label('deployment', 'nginx-deploy', {
            env: 'production',
            team: 'platform',
        });

        // 验证
        const deploy = await kubectl.get<{
            metadata: { labels: Record<string, string> };
        }>('deployment', 'nginx-deploy');

        if (deploy.metadata.labels.env !== 'production') {
            throw new Error('Label env not set correctly');
        }
    });

    test('label - 删除标签', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 null 值删除标签
        await kubectl.label('deployment', 'nginx-deploy', {
            team: null,  // 删除 team 标签
        });
    });

    // ===== annotate - 管理注解 =====
    test('annotate - 添加注解', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.annotate('deployment', 'nginx-deploy', {
            'description': 'Test deployment for kubectl plugin',
            'owner': 'test-team',
        });
    });

    test('annotate - 删除注解', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.annotate('deployment', 'nginx-deploy', {
            'owner': null,  // 删除 owner 注解
        });
    });

    // ===== patch - 补丁更新 =====
    test('patch - Strategic Merge Patch', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用对象形式的 patch
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

        // 使用 JSON Patch 格式
        await kubectl.patch('deployment', 'nginx-deploy', [
            { op: 'replace', path: '/spec/replicas', value: 2 },
        ], 'json');
    });

    // ===== wait - 等待条件 =====
    test('wait - 等待 Deployment Available', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.wait('deployment', 'nginx-deploy', 'Available', { timeout: 60000 });
    });

    // 清理
    test('清理: 删除测试 Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('deployment', 'nginx-deploy', { force: true });
    });
});
