/**
 * 测试场景 5: 多 Workload 共享 GPU
 *
 * 验证两个 TensorFusionWorkload 共享同一张 GPU 时：
 * - 两个 workload 均可正常调度并进入 Running
 * - GPU.status.available 资源扣减准确（两倍请求量）
 * - GPU.status.runningApps 包含两个 workload
 * - 删除后资源正确恢复
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/05-multi-workload-shared-gpu.ts
 */

import { sleep } from 'bun';
import {
    test,
    describe,
    expect,
    step,
    gpu,
    tensorfusionworkload,
    workloadYaml,
    DEFAULT_TIMEOUT,
    getFirstGpuName,
    getGpuAvailable,
    parseTflops,
    TEST_NAMESPACE,
} from './_config.js';

const WL_NAME_1 = 'tf-share-wl-1';
const WL_NAME_2 = 'tf-share-wl-2';

/** 每个 workload 请求的 tflops（1 TFlops = 1000m） */
const TFLOPS_REQUEST = '1000m';
const TFLOPS_LIMIT = '1000m';
const VRAM_REQUEST = '1Gi';
const VRAM_LIMIT = '1Gi';

describe('测试场景 5: 多 Workload 共享 GPU', { record: true }, () => {
    test('两个 TensorFusionWorkload 共享同一张 GPU 完整流程', async (ctx) => {
        const { kubectl } = ctx.plugins;
        let gpuName: string;
        let initialTflops: string;

        // ===== Step 1: 记录初始状态 =====
        await step('获取目标 GPU 并记录初始资源', {
            showStepTitle: false,
            typingSpeed: 60,
            pauseAfter: 1500,
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);

            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;

            // 确认 GPU 有足够资源容纳两个 workload
            const initialNum = parseTflops(initialTflops);
            const requiredNum = parseTflops(TFLOPS_REQUEST) * 2;
            expect(initialNum).toBeGreaterThanOrEqual(requiredNum);
        });

        // ===== Step 2: 创建两个 workload =====
        await step('创建第一个 Workload: ' + WL_NAME_1, {
            showStepTitle: false,
            typingSpeed: 100,
            pauseAfter: 2000,
        }, async () => {
            const yaml = workloadYaml(WL_NAME_1, {
                tflopsRequest: TFLOPS_REQUEST,
                tflopsLimit: TFLOPS_LIMIT,
                vramRequest: VRAM_REQUEST,
                vramLimit: VRAM_LIMIT,
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        await step('创建第二个 Workload: ' + WL_NAME_2, {
            showStepTitle: false,
            typingSpeed: 100,
            pauseAfter: 2000,
        }, async () => {
            const yaml = workloadYaml(WL_NAME_2, {
                tflopsRequest: TFLOPS_REQUEST,
                tflopsLimit: TFLOPS_LIMIT,
                vramRequest: VRAM_REQUEST,
                vramLimit: VRAM_LIMIT,
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        // ===== Step 3: 等待两个 workload 都变为 Running =====
        await step('等待 ' + WL_NAME_1 + ' Ready', {
            showStepTitle: false,
            pauseAfter: 1500,
        }, async () => {
            const result = await kubectl.wait(
                'tensorfusionworkload',
                WL_NAME_1,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
            await expect(result).toBeSuccessful();
        });

        await step('等待 ' + WL_NAME_2 + ' Ready', {
            showStepTitle: false,
            pauseAfter: 1500,
        }, async () => {
            const result = await kubectl.wait(
                'tensorfusionworkload',
                WL_NAME_2,
                'Ready',
                { timeout: DEFAULT_TIMEOUT }
            );
            await expect(result).toBeSuccessful();
        });

        await step('验证两个 Workload 状态均为 Running', {
            typingSpeed: 80,
            pauseAfter: 2000,
        }, async () => {
            const wl1 = tensorfusionworkload(kubectl, WL_NAME_1);
            await expect(wl1).toHaveStatusField('phase', 'Running');

            const wl2 = tensorfusionworkload(kubectl, WL_NAME_2);
            await expect(wl2).toHaveStatusField('phase', 'Running');
        });

        // ===== Step 4: 验证 GPU 可用资源扣减 =====
        await step('检查 GPU 可用资源变化', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2500,
        }, async () => {
            await sleep(1000);
            const afterAvailable = await getGpuAvailable(kubectl, gpuName);

            const initialNum = parseTflops(initialTflops);
            const afterNum = parseTflops(afterAvailable.tflops);
            const expectedDeduction = parseTflops(TFLOPS_REQUEST) * 2;

            // TFlops 应减少约 2 个 workload 的请求量
            expect(afterNum).toBeLessThan(initialNum);
            expect(initialNum - afterNum).toBeGreaterThanOrEqual(expectedDeduction - 100);
            expect(initialNum - afterNum).toBeLessThanOrEqual(expectedDeduction + 100);
        });

        // ===== Step 5: 验证 runningApps =====
        await step('检查 GPU runningApps 包含两个 workload', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2500,
        }, async () => {
            const runningApps = await kubectl.getJsonPath<Array<{
                namespace?: string;
                name?: string;
                count?: number;
            }>>(
                'gpu', gpuName, '.status.runningApps'
            );

            expect(runningApps).toBeDefined();
            expect(Array.isArray(runningApps)).toBe(true);

            const appNames = (runningApps ?? []).map(
                app => `${app.namespace}/${app.name}`
            );

            expect(appNames).toContain(`${TEST_NAMESPACE}/${WL_NAME_1}`);
            expect(appNames).toContain(`${TEST_NAMESPACE}/${WL_NAME_2}`);
        });

        // ===== Step 6: 清理 =====
        await step('删除两个 TensorFusionWorkload', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000,
        }, async () => {
            const r1 = await kubectl.delete('tensorfusionworkload', WL_NAME_1);
            await expect(r1).toBeSuccessful();

            const r2 = await kubectl.delete('tensorfusionworkload', WL_NAME_2);
            await expect(r2).toBeSuccessful();
        });

        await step('等待资源释放并验证恢复', {
            pauseAfter: 2000,
        }, async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));

            const afterRelease = await getGpuAvailable(kubectl, gpuName);
            const releasedNum = parseTflops(afterRelease.tflops);
            const initialNum = parseTflops(initialTflops);

            // 允许小误差，但应接近初始值
            expect(releasedNum).toBeGreaterThanOrEqual(initialNum - 100);
        });
    });
});
