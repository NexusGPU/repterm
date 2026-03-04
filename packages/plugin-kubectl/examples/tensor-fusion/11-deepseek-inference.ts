/**
 * Test Scenario 11: DeepSeek LLM Inference (Remote GPU)
 *
 * - Create a client pod with remote GPU annotations
 * - Use DeepSeek model pre-baked into PYTORCH_IMAGE at /models
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
  TIMEOUTS,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
  PYTORCH_IMAGE,
  deleteResourceAndWait,
  waitForCudaReady,
} from './_config.js';

const POD_NAME = 'test-deepseek-inference';
const MODEL_PATH = '/models/DeepSeek-R1-Distill-Qwen-1.5B';

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
`;
}

/**
 * DeepSeek inference script - loaded via base64 to avoid shell quoting issues
 */
const INFER_SCRIPT = `
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import os

local_path = "${MODEL_PATH}"
if not os.path.isdir(local_path):
    raise FileNotFoundError(f"DeepSeek model path not found: {local_path}")
print(f"Using local model path: {local_path}")
print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(local_path, trust_remote_code=True, local_files_only=True)
print("Loading model...")
model = AutoModelForCausalLM.from_pretrained(local_path, trust_remote_code=True, device_map="cuda", local_files_only=True)
print(f"Model loaded on {next(model.parameters()).device}")

prompt = "What is 1+1? Answer briefly."
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=50)
response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(f"INFERENCE_RESULT: {response}")
`.trim();

describe('Test Scenario 11: DeepSeek LLM Inference', { record: true }, () => {
  test('Load DeepSeek model and run inference with remote GPU', { timeout: TIMEOUTS.MODEL_LOADING }, async (ctx) => {
    const { kubectl } = ctx.plugins;

    // Clean up pod from previous run (pod spec is immutable; must delete before re-apply)
    await deleteResourceAndWait(kubectl, 'pod', POD_NAME);

    try {
      await step(
        'Create inference pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const yaml = podYaml(POD_NAME, TEST_GPU_POOL);
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
        }
      );

      await step(
        'Wait for pod Ready',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await kubectl.waitForPod(POD_NAME, 'Running', TIMEOUTS.POD_READY);
        }
      );

      await step(
        'Verify remote GPU available',
        {
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          await waitForCudaReady(kubectl, POD_NAME, 'python', 300000);
        }
      );

      await step(
        'Check pre-baked model files in container',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1200,
        },
        async () => {
          const output = await kubectl.exec(
            POD_NAME,
            [
              'sh',
              '-c',
              `test -f ${MODEL_PATH}/config.json && test -f ${MODEL_PATH}/tokenizer_config.json && echo MODEL_READY`,
            ],
            { container: 'python' }
          );
          expect(output).toContain('MODEL_READY');
        }
      );

      await step(
        'Write inference script',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1000,
        },
        async () => {
          const scriptBase64 = Buffer.from(INFER_SCRIPT).toString('base64');
          await kubectl.exec(
            POD_NAME,
            ['sh', '-c', `echo ${scriptBase64} | base64 -d > /tmp/infer.py`],
            { container: 'python' }
          );
        }
      );

      await step(
        'Run DeepSeek model inference',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 3000,
        },
        async () => {
          // Model loading (~3GB) + inference can take several minutes on remote GPU
          const output = await kubectl.exec(POD_NAME, ['sh', '-c', 'python3 /tmp/infer.py'], {
            container: 'python',
            timeout: TIMEOUTS.INFERENCE,
          });

          // Verify model loaded successfully
          expect(output).toContain('Model loaded on');
          expect(output).toContain('cuda');
          // Verify inference produced a result
          expect(output).toContain('INFERENCE_RESULT:');
        }
      );

      await step(
        'Delete inference pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          const result = await kubectl.delete('pod', POD_NAME);
          await expect(result).toBeSuccessful();
          await sleep(5000);
        }
      );
    } finally {
      await deleteResourceAndWait(kubectl, 'pod', POD_NAME);
    }
  });
});
