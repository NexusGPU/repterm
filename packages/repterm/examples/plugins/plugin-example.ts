// /**
//  * Example: Using Plugins with Repterm
//  *
//  * This example demonstrates how to use the plugin system with repterm tests.
//  * Shows the simplified approach where plugins are automatically initialized.
//  */

// import {
//     describe,
//     defineConfig,
//     createTestWithPlugins,
//     describeWithPlugins,
// } from 'repterm';
// import { kubectlPlugin } from '@repterm/plugin-kubectl';
// import { loggerPlugin } from '@repterm/plugin-logger';

// // ============== Configure Plugin Runtime ==============

// const config = defineConfig({
//     plugins: [
//         loggerPlugin({ level: 'debug', prefix: '[k8s-test]', timestamps: true }),
//         kubectlPlugin({ namespace: 'test-ns' }),
//     ] as const,
//     baseContext: {
//         debug: true,
//     },
// });

// const test = createTestWithPlugins(config);

// describe('Kubernetes Plugin Example', () => {
//     test('should create and verify nginx pod', async (ctx) => {
//         ctx.logger.info('Starting nginx pod test');
//         ctx.logger.debug(`Using namespace: ${ctx.kubectl.namespace}`);

//         await ctx.plugins.kubectl.apply(`
// apiVersion: v1
// kind: Pod
// metadata:
//   name: nginx-test
// spec:
//   containers:
//   - name: nginx
//     image: nginx:latest
//         `);

//         ctx.logger.info('Pod manifest applied');

//         await ctx.plugins.kubectl.waitForPod('nginx-test', 'Running', 120000);

//         await ctx.plugins.kubectl.delete('pod', 'nginx-test');
//         ctx.logger.info('Test completed!');
//     });

//     test('should list pods', async (ctx) => {
//         ctx.logger.info('Listing pods...');
//         await ctx.plugins.kubectl.run('get pods');
//         ctx.logger.info('Done!');
//     });
// });

// describeWithPlugins(config, 'Kubectl Tests', ({ test }) => {
//     test('check kubernetes connection', async (ctx) => {
//         ctx.logger.info('Checking Kubernetes connection...');

//         await ctx.plugins.kubectl.run('cluster-info');
//         ctx.logger.info('Cluster info retrieved');
//     });

//     test('list namespaces', async (ctx) => {
//         ctx.logger.info('Listing namespaces...');
//         await ctx.plugins.kubectl.run('get namespaces');
//     });
// });

// describeWithPlugins(config, 'Nested Suite Example', ({ test, describe }) => {
//     test('outer test', async (ctx) => {
//         ctx.logger.info('This is an outer test');
//     });

//     describe('Inner Suite', () => {
//         const innerTest = createTestWithPlugins(config);

//         innerTest('inner test with plugins', async (ctx) => {
//             ctx.logger.info('This is an inner test with plugins');
//         });
//     });
// });

// const simpleConfig = defineConfig({
//     plugins: [loggerPlugin({ level: 'info' })] as const,
//     baseContext: { debug: false },
// });

// const simpleTest = createTestWithPlugins(simpleConfig);

// describe('Simple Logger Only', () => {
//     simpleTest('log messages', async (ctx) => {
//         ctx.logger.info('Info message');
//         ctx.logger.warn('Warning!');
//         ctx.logger.error('Error occurred');
//     });
// });
