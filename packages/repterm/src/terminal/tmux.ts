/**
 * Tmux integration for multi-pane recording
 * Manages tmux sessions for multi-terminal tests
 */

export interface TmuxConfig {
  sessionName: string;
  cols?: number;
  rows?: number;
}

/**
 * Helper to run tmux commands
 */
async function runTmux(args: string[]): Promise<string> {
  const proc = Bun.spawn(['tmux', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(stderr || `Tmux exited with code ${proc.exitCode}`);
  }

  return stdout;
}

/**
 * Tmux session manager
 */
export class TmuxSession {
  private config: TmuxConfig;
  private paneIds: string[] = [];

  constructor(config: TmuxConfig) {
    this.config = config;
  }

  /**
   * Create a new tmux session
   */
  async create(): Promise<void> {
    const { sessionName, cols, rows } = this.config;

    const args = ['new-session', '-d', '-s', sessionName];

    if (cols && rows) {
      args.push('-x', cols.toString(), '-y', rows.toString());
    }

    try {
      await runTmux(args);
      // Get the initial pane ID
      const stdout = await runTmux(['list-panes', '-t', sessionName, '-F', '#{pane_id}']);
      this.paneIds.push(stdout.trim());
    } catch (error) {
      throw new Error(`Failed to create tmux session: ${(error as Error).message}`);
    }
  }

  /**
   * Split the window to create a new pane
   */
  async splitPane(vertical = false): Promise<string> {
    const { sessionName } = this.config;
    const direction = vertical ? '-v' : '-h';

    try {
      // Split and get the new pane ID
      const stdout = await runTmux([
        'split-window',
        direction,
        '-t',
        sessionName,
        '-P',
        '-F',
        '#{pane_id}',
      ]);
      const paneId = stdout.trim();
      this.paneIds.push(paneId);
      return paneId;
    } catch (error) {
      throw new Error(`Failed to split tmux pane: ${(error as Error).message}`);
    }
  }

  /**
   * Send keys to a specific pane
   */
  async sendKeys(paneId: string, keys: string): Promise<void> {
    try {
      await runTmux(['send-keys', '-t', paneId, keys, 'Enter']);
    } catch (error) {
      throw new Error(`Failed to send keys to tmux pane: ${(error as Error).message}`);
    }
  }

  /**
   * Capture pane output
   */
  async capturePane(paneId: string): Promise<string> {
    try {
      return await runTmux(['capture-pane', '-t', paneId, '-p']);
    } catch (error) {
      throw new Error(`Failed to capture tmux pane: ${(error as Error).message}`);
    }
  }

  /**
   * Kill the tmux session
   */
  async kill(): Promise<void> {
    const { sessionName } = this.config;

    try {
      await runTmux(['kill-session', '-t', sessionName]);
    } catch {
      // Ignore errors if session doesn't exist
    }
  }

  /**
   * Get all pane IDs
   */
  getPaneIds(): string[] {
    return [...this.paneIds];
  }

  /**
   * Get the session name
   */
  getSessionName(): string {
    return this.config.sessionName;
  }
}

/**
 * Create a tmux session
 */
export function createTmuxSession(config: TmuxConfig): TmuxSession {
  return new TmuxSession(config);
}

/**
 * Check if tmux is available
 */
export async function checkTmuxAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', 'tmux'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
