/**
 * Kubectl Result Types
 *
 * Provides result classes for kubectl commands with intelligent success detection.
 * Handles both normal mode (exitCode-based) and PTY/recording mode (output-based).
 *
 * @packageDocumentation
 */

/**
 * Base class for kubectl command execution results.
 * Provides unified success detection logic for both PTY and non-PTY modes.
 */
export abstract class KubectlResult {
    constructor(
        /** Command output (stdout + stderr in PTY mode) */
        public readonly output: string,
        /** The executed command */
        public readonly command: string,
        /** Exit code (-1 in PTY mode where exit code is unavailable) */
        public readonly exitCode: number
    ) { }

    /**
     * Check if the command succeeded.
     * - Non-PTY mode: Uses exitCode === 0
     * - PTY mode (exitCode === -1): Delegates to subclass isOutputSuccessful()
     */
    get successful(): boolean {
        // Non-PTY mode: exitCode is reliable
        if (this.exitCode !== -1) {
            return this.exitCode === 0;
        }
        // PTY mode: check output content (subclass implementation)
        return this.isOutputSuccessful();
    }

    /** Subclass implementation: determine success based on output content */
    protected abstract isOutputSuccessful(): boolean;

    /** Common error detection helper */
    protected hasError(): boolean {
        const output = this.output.toLowerCase();
        return (
            output.includes('error:') ||
            output.includes('error from server') ||
            output.includes('unable to') ||
            output.includes('forbidden') ||
            output.includes('not found') && output.includes('error')
        );
    }
}

/**
 * Result for kubectl apply command.
 * Success indicators: "created", "configured", "unchanged"
 */
export class ApplyResult extends KubectlResult {
    protected isOutputSuccessful(): boolean {
        if (this.hasError()) return false;
        const output = this.output.toLowerCase();
        // apply success patterns: "created", "configured", "unchanged"
        return /\b(created|configured|unchanged)\b/.test(output);
    }
}

/**
 * Result for kubectl delete command.
 * Success indicators: "deleted" or "not found" (with --ignore-not-found)
 */
export class DeleteResult extends KubectlResult {
    protected isOutputSuccessful(): boolean {
        // For delete, "not found" with --ignore-not-found is actually success
        const output = this.output.toLowerCase();
        // Check for actual errors first
        if (output.includes('error:') || output.includes('error from server') || output.includes('forbidden')) {
            return false;
        }
        // delete success patterns: "deleted" or "not found" (idempotent delete)
        return /\b(deleted|not found)\b/.test(output);
    }
}

/**
 * Result for kubectl patch command.
 * Success indicators: "patched" or "(no change)"
 */
export class PatchResult extends KubectlResult {
    protected isOutputSuccessful(): boolean {
        if (this.hasError()) return false;
        const output = this.output.toLowerCase();
        // patch success patterns: "patched" or "(no change)"
        return /\b(patched)\b|\(no change\)/.test(output);
    }
}

/**
 * Result for kubectl scale command.
 * Success indicators: "scaled"
 */
export class ScaleResult extends KubectlResult {
    protected isOutputSuccessful(): boolean {
        if (this.hasError()) return false;
        const output = this.output.toLowerCase();
        // scale success pattern: "scaled"
        return /\bscaled\b/.test(output);
    }
}

/**
 * Result for kubectl label/annotate commands.
 * Success indicators: "labeled" or "annotated"
 */
export class LabelResult extends KubectlResult {
    protected isOutputSuccessful(): boolean {
        if (this.hasError()) return false;
        const output = this.output.toLowerCase();
        // label/annotate success patterns: "labeled" or "annotated"
        return /\b(labeled|annotated)\b/.test(output);
    }
}

/**
 * Result for kubectl wait command.
 * Success indicators: "condition met" or specific condition messages
 */
export class WaitResult extends KubectlResult {
    protected isOutputSuccessful(): boolean {
        if (this.hasError()) return false;
        const output = this.output.toLowerCase();
        // wait success patterns: "condition met" or specific resource/condition met
        // kubectl wait outputs: "tensorfusionworkload.tensor-fusion.ai/test-workload condition met"
        return /\bcondition met\b/.test(output) ||
            // for --for=delete: resource disappears successfully
            /\bdeleted\b/.test(output);
    }
}
