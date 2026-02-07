/**
 * Dependency checking utilities
 * Verifies external dependencies are available
 */

/**
 * Check if a command is available (internal)
 */
async function checkCommand(command: string): Promise<boolean> {
  const proc = Bun.spawn(['which', command], {
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await proc.exited;
  return proc.exitCode === 0;
}

/**
 * Check all required dependencies
 */
export async function checkDependencies(recording: boolean = false): Promise<{
  allPresent: boolean;
  missing: string[];
}> {
  const required: string[] = [];
  const missing: string[] = [];

  if (recording) {
    required.push('asciinema', 'tmux');
  }

  for (const cmd of required) {
    const available = await checkCommand(cmd);
    if (!available) {
      missing.push(cmd);
    }
  }

  return {
    allPresent: missing.length === 0,
    missing,
  };
}

/**
 * Print dependency check results
 */
export function printDependencyCheck(result: { allPresent: boolean; missing: string[] }): void {
  if (result.allPresent) {
    console.log('✓ All dependencies available');
  } else {
    console.error('✗ Missing dependencies:', result.missing.join(', '));
    console.error('\nTo install:');
    for (const dep of result.missing) {
      if (dep === 'asciinema') {
        console.error('  brew install asciinema  # macOS');
        console.error('  apt-get install asciinema  # Ubuntu/Debian');
      } else if (dep === 'tmux') {
        console.error('  brew install tmux  # macOS');
        console.error('  apt-get install tmux  # Ubuntu/Debian');
      }
    }
  }
}
