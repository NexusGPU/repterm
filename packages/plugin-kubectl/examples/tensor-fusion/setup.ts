/**
 * Global environment setup for Tensor Fusion test suite.
 *
 * This file is automatically loaded before all test files in this directory
 * by repterm's directory loader. It provisions the cloud infrastructure
 * required for the test suite and tears it down after all tests complete.
 *
 * Prerequisites: run scripts/build-tf-test-images.ts once to pre-warm the
 * containerd image cache on both CPU and GPU nodes via UCloud custom image.
 *
 * Execution order:
 *   beforeAll: check gpu node → (create if missing + wait Ready) → uninstall TF → install TF → wait Available → apply cluster CR → wait GPUPool Running → wait GPU objects registered → wait tflops > 0
 *   afterAll:  uninstall TF → delete GPU node
 */
import { sleep } from 'bun';
import { beforeAll, afterAll, expect } from 'repterm';
import type { DollarFunction } from 'repterm';

const UCLOUD_CREATE_ARGS = [
  '--Action',
  'CreateUHostInstance',
  '--Quantity',
  '1',
  '--ChargeType',
  'Dynamic',
  '--LoginMode',
  'ImagePasswd',
  '--Tag',
  'Default',
  '--Name',
  'gpu',
  '--GpuType',
  'T4S',
  '--Features.UNI',
  'false',
  '--HotplugFeature',
  'false',
  '--NetCapability',
  'Normal',
  '--AutoDataDiskInit',
  'On',
  '--MinimalCpuPlatform',
  'Intel/Auto',
  '--MachineType',
  'G',
  '--Disks.0.BackupType',
  'NONE',
  '--Disks.0.Type',
  'CLOUD_SSD',
  '--Disks.0.Size',
  '100',
  '--Disks.0.IsBoot',
  'True',
  '--Memory',
  '16384',
  '--CPU',
  '8',
  '--GPU',
  '1',
  '--ImageId',
  'uimage-1nhwezwvwhol',
  '--SecurityGroupId',
  '325475',
  '--SecurityMode',
  'Firewall',
  '--SubnetId',
  'subnet-1hyousmpt270',
  '--VPCId',
  'uvnet-1hyousey4p4l',
  '--ProjectId',
  'org-1szevn',
  '--Zone',
  'cn-wlcb-01',
  '--Region',
  'cn-wlcb',
];

const UCLOUD_DESCRIBE_ARGS = [
  '--Action',
  'DescribeUHostInstance',
  '--Region',
  'cn-wlcb',
  '--ProjectId',
  'org-1szevn',
];

async function queryGpuUhostId($: DollarFunction): Promise<string> {
  const output = (await $`ucloud api ${UCLOUD_DESCRIBE_ARGS}`).stdout;
  const result = JSON.parse(output) as {
    RetCode: number;
    UHostSet: Array<{ UHostId: string; GPU: number }>;
  };
  if (result.RetCode !== 0) {
    throw new Error(`Failed to query UHost instances: ${JSON.stringify(result)}`);
  }
  const gpuInstance = result.UHostSet?.find((h) => h.GPU >= 1);
  if (!gpuInstance) {
    throw new Error('No GPU UHost instance found in UCloud');
  }
  return gpuInstance.UHostId;
}

beforeAll(async (ctx) => {
  const { $ } = ctx;

  // Step 1: Check if the gpu node already exists and is Ready
  const nodeCheck = await $`kubectl get node gpu --no-headers`;
  const gpuNodeReady =
    nodeCheck.code === 0 &&
    nodeCheck.stdout.includes('Ready') &&
    !nodeCheck.stdout.includes('NotReady');

  let uhostId: string;

  if (gpuNodeReady) {
    // Node already ready — query existing uhost-id from UCloud
    uhostId = await queryGpuUhostId($);
    console.log(`[setup] Using existing GPU node: ${uhostId}`);
  } else {
    // Step 1a: Create GPU node via ucloud
    const createOutput = (await $`ucloud api ${UCLOUD_CREATE_ARGS}`).stdout;
    const createResult = JSON.parse(createOutput) as {
      RetCode: number;
      UHostIds: string[];
    };

    if (createResult.RetCode !== 0) {
      throw new Error(`Failed to create GPU node: ${JSON.stringify(createResult)}`);
    }

    uhostId = createResult.UHostIds[0];
    console.log(`[setup] Created GPU node: ${uhostId}`);

    // Step 1b: Wait for the node to become Ready (node name is always "gpu")
    // kubectl timeout is 600s, use 660s repterm timeout to allow kubectl to report the error
    const waitNode = await $({
      timeout: 660000,
    })`kubectl wait node/gpu --for=condition=Ready --timeout=600s`;
    expect(waitNode).toSucceed();
  }

  // Step 2: Remove existing TensorFusion installation (ignore errors if not installed)
  await $({
    timeout: 120000,
  })`helm uninstall tensor-fusion-sys --namespace tensor-fusion-sys --ignore-not-found`;

  // Step 3: Install TensorFusion
  const helmInstall = await $({
    timeout: 360000,
  })`helm upgrade --install --create-namespace --namespace tensor-fusion-sys --repo https://download.tensor-fusion.ai --set agent.agentId="" -f https://download.tensor-fusion.ai/values-cn.yaml tensor-fusion-sys tensor-fusion`;
  // beforeAll/afterAll always run with recording:false (non-PTY), so exit code is reliable.
  if (helmInstall.code !== 0) {
    throw new Error(
      `Helm install failed:\n${(helmInstall.stderr || helmInstall.stdout).slice(-2000)}`
    );
  }
  // Step 4: Wait for controller deployment to exist, then wait for Available
  for (;;) {
    const check =
      await $`kubectl get deployment/tensor-fusion-sys-controller -n tensor-fusion-sys --no-headers`;
    if (check.code === 0) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const waitController = await $({
    timeout: 360000,
  })`kubectl wait deployment/tensor-fusion-sys-controller -n tensor-fusion-sys --for=condition=Available --timeout=300s`;
  expect(waitController).toSucceed();

  // Step 5: Apply TensorFusionCluster and SchedulingConfigTemplate
  await $`kubectl apply -f https://app.tensor-fusion.ai/tmpl/tf-cluster`;
  await $`kubectl apply -f https://app.tensor-fusion.ai/tmpl/tf-scheduling-config`;

  // Step 5b: Annotate GPU node to force controller reconciliation
  await $`kubectl annotate node gpu tensor-fusion.ai/reconcile-ts=${Math.floor(Date.now() / 1000)} --overwrite`;

  // Step 6: Wait for GPUPool to become Ready
  const poolDeadline = Date.now() + 300_000;
  for (;;) {
    if (Date.now() > poolDeadline)
      throw new Error('Timeout: no GPUPool resources appeared within 300s');
    const check = await $`kubectl get gpupool --all-namespaces --no-headers`;
    if (check.code === 0 && check.stdout.trim().length > 0) break;
    await sleep(3000);
  }
  const poolRunDeadline = Date.now() + 600_000;
  for (;;) {
    if (Date.now() > poolRunDeadline)
      throw new Error('Timeout: GPUPool did not reach Running phase within 600s');
    const phaseOut =
      await $`kubectl get gpupool --all-namespaces -o jsonpath={.items[*].status.phase}`;
    if (
      phaseOut.code === 0 &&
      phaseOut.stdout
        .trim()
        .split(/\s+/)
        .every((p) => p === 'Running')
    )
      break;
    await sleep(3000);
  }
  // Step 7: Wait for at least one GPU object to be registered in the pool.
  const gpuObjDeadline = Date.now() + 300_000;
  for (;;) {
    if (Date.now() > gpuObjDeadline)
      throw new Error('Timeout: no GPU objects registered in pool within 300s');
    const gpuCheck =
      await $`kubectl get gpu --selector tensor-fusion.ai/gpupool=tensor-fusion-shared --no-headers`;
    if (gpuCheck.code === 0 && gpuCheck.stdout.trim().length > 0) break;
    await sleep(3000);
  }
  // Wait for at least one NVIDIA GPU with vendor status — this is the same check
  // getFirstGpuName() does in tests; ensures the TF agent has fully reported GPU info.
  const gpuAvailDeadline = Date.now() + 600_000;
  for (;;) {
    if (Date.now() > gpuAvailDeadline)
      throw new Error('Timeout: no NVIDIA GPU vendor reported within 600s');
    const gpuJson =
      await $`kubectl get gpu --selector tensor-fusion.ai/gpupool=tensor-fusion-shared -o json`;
    if (gpuJson.code === 0) {
      try {
        const items = (
          JSON.parse(gpuJson.stdout) as { items: Array<{ status?: { vendor?: string } }> }
        ).items;
        if (items.some((g) => g.status?.vendor?.toLowerCase() === 'nvidia')) break;
      } catch {
        /* ignore parse errors, retry */
      }
    }
    await sleep(3000);
  }
  return { uhostId };
});

afterAll(async (ctx) => {
  const { $, uhostId } = ctx as { $: DollarFunction; uhostId?: string };

  // Step 1: Remove TensorFusion
  //
  // Uninstall order matters:
  //   1. helm uninstall (stops controller — no more reconciliation or finalizer processing)
  //   2. Delete webhooks (helm may leave MutatingWebhookConfiguration behind; if the webhook
  //      is still active it re-adds finalizers on every patch, making cleanup impossible)
  //   3. Force-remove finalizers on remaining CRD instances (controller is gone, no one else
  //      will process them)
  //   4. Delete namespace

  // Step 1a: Helm uninstall — stops controller and most cluster-scoped resources
  await $({
    timeout: 120000,
  })`helm uninstall tensor-fusion-sys --namespace tensor-fusion-sys --ignore-not-found`;

  // Step 1b: Delete greptimedb resources and namespace (helm creates these for metrics;
  // if left Terminating the next helm install will fail creating resources in it)
  await $`kubectl delete configmap tensor-fusion-sys-greptimedb-standalone -n greptimedb --ignore-not-found`;
  await $`kubectl delete statefulset tensor-fusion-sys-greptimedb-standalone -n greptimedb --ignore-not-found`;
  await $`kubectl delete service greptimedb-standalone -n greptimedb --ignore-not-found`;
  await $`kubectl delete namespace greptimedb --ignore-not-found`;

  // Step 1c: Delete leftover webhooks (helm may not clean up cluster-scoped webhook configs)
  await $`kubectl delete mutatingwebhookconfiguration -l app.kubernetes.io/instance=tensor-fusion-sys --ignore-not-found`;
  await $`kubectl delete validatingwebhookconfiguration -l app.kubernetes.io/instance=tensor-fusion-sys --ignore-not-found`;
  await $`kubectl delete mutatingwebhookconfiguration tensor-fusion-sys-mutating-webhook --ignore-not-found`;

  // Step 1d: Force-remove finalizers on all remaining TF CRD instances
  for (const kind of ['tensorfusioncluster', 'gpupool', 'gpu', 'gpunode']) {
    const list = await $`kubectl get ${kind} -A -o jsonpath={.items[*].metadata.name} 2>/dev/null`;
    const names = list.stdout.trim().split(/\s+/).filter(Boolean);
    for (const name of names) {
      await $`kubectl patch ${kind} ${name} -p '{"metadata":{"finalizers":null}}' --type=merge`;
      await $`kubectl delete ${kind} ${name} --ignore-not-found --wait=false`;
    }
  }

  // Brief wait for deletions to propagate
  await sleep(3000);

  // Step 1e: Delete the tensor-fusion-sys namespace
  await $`kubectl delete namespace tensor-fusion-sys --ignore-not-found`;

  // Step 2: Delete GPU node using the uhost-id saved in beforeAll
  if (uhostId) {
    const proc = $({
      interactive: true,
      timeout: 600000,
    })`ucloud uhost delete --destroy --release-eip --region cn-wlcb --project-id org-1szevn --uhost-id ${uhostId}`;
    await proc.expect('(y/n)');
    await proc.send('y');
    await proc;
    console.log(`[setup] Deleted GPU node: ${uhostId}`);
  }
});
