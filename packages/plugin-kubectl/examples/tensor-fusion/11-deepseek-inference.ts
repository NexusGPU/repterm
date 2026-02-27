/**
 * Test Scenario 11: DeepSeek LLM Inference (Remote GPU)
 *
 * - Create a client pod with remote GPU annotations and hostPath mounts
 *   for Demo scripts and local DeepSeek-R1-Distill-Qwen-1.5B model
 * - Install transformers library
 * - Load the local model onto the remote GPU and run text generation
 * - Verify inference produces valid output
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/11-deepseek-inference.ts
 */

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  DEFAULT_TIMEOUT,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
} from './_config.js';

const POD_NAME = 'test-deepseek-inference';
const PYTORCH_IMAGE = 'registry.cn-hangzhou.aliyuncs.com/tensorfusion/pytorch:2.6.0-cuda12.4-cudnn9-runtime';
const MODEL_PATH = '/workspace/Demo/models/DeepSeek-R1-Distill-Qwen-1.5B';

function podYaml(podName: string, poolName: string): string {
  return `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${TEST_NAMESPACE}
  labels:
    tensor-fusion.ai/enabled: "true"
  annotations:
    tensor-fusion.ai/is-local-gpu: "false"
    tensor-fusion.ai/gpupool: "${poolName}"
    tensor-fusion.ai/tflops-request: "2"
    tensor-fusion.ai/vram-request: "128Mi"
    tensor-fusion.ai/tflops-limit: "71200m"
    tensor-fusion.ai/vram-limit: "15Gi"
    tensor-fusion.ai/inject-container: "python"
spec:
  priorityClassName: tensor-fusion-high
  nodeSelector:
    kubernetes.io/hostname: cpu
  restartPolicy: Never
  terminationGracePeriodSeconds: 3
  containers:
    - name: python
      image: ${PYTORCH_IMAGE}
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          cpu: 10m
          memory: 64Mi
        limits:
          cpu: "4"
          memory: 16Gi
      volumeMounts:
        - name: demo-files
          mountPath: /workspace/Demo
        - name: model-cache
          mountPath: /root/.cache/huggingface
  volumes:
    - name: demo-files
      hostPath:
        path: /home/ubuntu/Demo
        type: DirectoryOrCreate
    - name: model-cache
      hostPath:
        path: /home/ubuntu/.cache/huggingface
        type: DirectoryOrCreate
`;
}

/**
 * DeepSeek inference script - loaded via base64 to avoid shell quoting issues
 */
const INFER_SCRIPT = `
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

local_path = "${MODEL_PATH}"
print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(local_path, trust_remote_code=True)
print("Loading model...")
model = AutoModelForCausalLM.from_pretrained(local_path, trust_remote_code=True, device_map="cuda")
print(f"Model loaded on {next(model.parameters()).device}")

prompt = "What is 1+1? Answer briefly."
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=50)
response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(f"INFERENCE_RESULT: {response}")
`.trim();

describe('测试场景 11: DeepSeek LLM 推理', { record: true }, () => {
  test('远程 GPU 模式下加载 DeepSeek 模型执行推理', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await step('创建推理 pod', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const yaml = podYaml(POD_NAME, TEST_GPU_POOL);
      const result = await kubectl.apply(yaml);
      await expect(result).toBeSuccessful();
    });

    await step('等待 pod 就绪', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      await kubectl.waitForPod(POD_NAME, 'Running', DEFAULT_TIMEOUT * 3);
    });

    await step('验证远程 GPU 可用', {
      typingSpeed: 0,
      pauseAfter: 2500,
    }, async () => {
      const cudaAvailable = await kubectl.exec(
        POD_NAME,
        ['sh', '-c', 'python3 -c "import torch; print(torch.cuda.is_available())"'],
        { container: 'python' },
      );
      expect(cudaAvailable.trim()).toBe('True');
    });

    await step('安装 transformers 依赖', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      await kubectl.exec(
        POD_NAME,
        ['sh', '-c', 'pip install -q transformers accelerate'],
        { container: 'python' },
      );
    });

    await step('写入推理脚本', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 1000,
    }, async () => {
      const scriptBase64 = Buffer.from(INFER_SCRIPT).toString('base64');
      await kubectl.exec(
        POD_NAME,
        ['sh', '-c', `echo ${scriptBase64} | base64 -d > /tmp/infer.py`],
        { container: 'python' },
      );
    });

    await step('执行 DeepSeek 模型推理', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 3000,
    }, async () => {
      const output = await kubectl.exec(
        POD_NAME,
        ['sh', '-c', 'python3 /tmp/infer.py'],
        { container: 'python' },
      );

      // 验证模型加载成功
      expect(output).toContain('Model loaded on');
      expect(output).toContain('cuda');
      // 验证推理产生了结果
      expect(output).toContain('INFERENCE_RESULT:');
    });

    await step('删除推理 pod', {
      showStepTitle: false,
      typingSpeed: 0,
      pauseAfter: 1500,
    }, async () => {
      const result = await kubectl.delete('pod', POD_NAME);
      await expect(result).toBeSuccessful();
      await sleep(5000);
    });
  });
});
