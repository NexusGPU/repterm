#!/usr/bin/env bun
/**
 * Launcher subcommand for capturing stdout/stderr/exitcode
 * This is a hidden subcommand used internally by terminal.run() in recording mode
 * 
 * Usage: repterm __launcher__ --id=<uuid> -- <command...>
 */

import { parseArgs } from 'util';

export async function runLauncher(argv: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args: argv,
        options: {
            id: { type: 'string' },
        },
        allowPositionals: true,
    });

    const id = values.id;
    if (!id) {
        console.error('Error: --id is required');
        process.exit(1);
    }

    const command = positionals.join(' ');
    if (!command) {
        console.error('Error: command is required');
        process.exit(1);
    }

    const stdoutPath = `/tmp/repterm-${id}.stdout`;
    const stderrPath = `/tmp/repterm-${id}.stderr`;
    const exitPath = `/tmp/repterm-${id}.exit`;

    // Use interactive shell to inherit user environment (aliases, functions, etc.)
    const shell = process.env.SHELL || '/bin/bash';
    const proc = Bun.spawn([shell, '-i', '-c', command], {
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe',
    });

    // Create file writers
    const stdoutFile = Bun.file(stdoutPath);
    const stderrFile = Bun.file(stderrPath);
    const stdoutWriter = stdoutFile.writer();
    const stderrWriter = stderrFile.writer();

    // Handle stream: tee to terminal and file
    const handleStream = async (
        stream: ReadableStream<Uint8Array>,
        output: NodeJS.WriteStream,
        writer: ReturnType<typeof stdoutFile.writer>
    ) => {
        for await (const chunk of stream) {
            output.write(chunk);   // Display in terminal
            writer.write(chunk);   // Write to file
        }
        await writer.end();
    };

    // Process streams in parallel
    await Promise.all([
        handleStream(proc.stdout, process.stdout, stdoutWriter),
        handleStream(proc.stderr, process.stderr, stderrWriter),
        proc.exited,
    ]);

    // Write exit code
    await Bun.write(exitPath, String(proc.exitCode ?? -1));
}
