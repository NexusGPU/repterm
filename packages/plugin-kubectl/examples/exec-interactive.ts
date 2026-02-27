/**
 * POC: Interactive exec into container
 *
 * Demonstrates entering a container shell via `kubectl exec -it` and running
 * commands interactively using expect/send pattern. This approach produces
 * natural-looking recordings compared to individual `kubectl exec` calls.
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/exec-interactive.ts
 */

import { describe, defineConfig, createTestWithPlugins, expect, step } from 'repterm';
import { kubectlPlugin } from '@nexusgpu/repterm-plugin-kubectl';

const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});
const test = createTestWithPlugins(config);

const POD_NAME = 'test-exec-nginx';

describe('交互式 exec 进入容器', { record: true }, () => {
  test('exec 进入 nginx 容器执行一系列命令', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // ===== Step 1: 创建 pod =====
    await step('创建 nginx pod', {
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      const result = await kubectl.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: ${POD_NAME}
spec:
  restartPolicy: Never
  containers:
    - name: nginx
      image: nginx:alpine
`);
      await expect(result).toBeSuccessful();
    });

    await step('等待 pod 就绪', {
      typingSpeed: 0,
      pauseAfter: 2000,
    }, async () => {
      await kubectl.waitForPod(POD_NAME, 'Running');
    });

    // ===== Step 2: 进入容器并执行命令 =====
    // NOTE: proc.expect() 使用 output.includes(text) 检查整个 tmux 面板累积输出，
    // 因此每次 expect 的文本必须是"首次出现"的，不能匹配到之前的历史输出。
    await step('进入容器执行命令', {
      typingSpeed: 80,
      pauseAfter: 2000,
    }, async () => {
      const proc = ctx.$({ interactive: true })`kubectl exec -it ${POD_NAME} -c nginx -- sh`;

      // 等待容器内 shell 提示符 (kubectl exec 连接需要时间)
      // NOTE: tmux capture-pane -p 会裁剪每行尾部空白，Alpine sh 提示符
      // "/ # " 被裁剪为 "/ #"，因此不能匹配 "# "（带空格），需用 "/ #"
      await proc.expect('/ #', { timeout: 15000 });

      // 查看当前用户 (输出 "root"，在历史输出中唯一)
      await proc.send('whoami');
      await proc.expect('root');

      // 查看 nginx 版本 (输出含 "nginx/"，在历史输出中唯一)
      await proc.send('nginx -v');
      await proc.expect('nginx/');

      // 列出 web 根目录 (输出含 "index.html"，在历史输出中唯一)
      await proc.send('ls /usr/share/nginx/html/');
      await proc.expect('index.html');

      // 查看系统信息 (输出含 "Alpine"，大写 A 与镜像名 alpine 小写 a 不同)
      await proc.send('cat /etc/os-release | head -2');
      await proc.expect('Alpine');

      // 退出容器
      await proc.send('exit');
      await proc;
    });

    // ===== Step 3: 清理 =====
    await step('清理资源', {
      typingSpeed: 0,
      pauseAfter: 1000,
    }, async () => {
      const result = await kubectl.delete('pod', POD_NAME);
      await expect(result).toBeSuccessful();
    });
  });
});
