import { defineConfig, createTestWithPlugins } from '../../../src/index.js';
import { kubectlPlugin } from '../../../../plugin-kubectl/src/index.js';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

test('typed kubectl plugin access', async (ctx) => {
  const k = ctx.plugins.kubectl;
  await k.waitForPod('demo');
});
