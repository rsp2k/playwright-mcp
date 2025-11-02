/**
 * jq Engine for Structural JSON Querying in Playwright MCP.
 *
 * High-performance JSON querying engine that spawns the jq binary directly
 * for maximum compatibility and performance. Designed to integrate seamlessly
 * with our ripgrep filtering system for ultimate precision.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface JqOptions {
    /** Output raw strings instead of JSON (jq -r flag) */
    raw_output?: boolean;

    /** Compact JSON output (jq -c flag) */
    compact?: boolean;

    /** Sort object keys (jq -S flag) */
    sort_keys?: boolean;

    /** Null input - don't read input (jq -n flag) */
    null_input?: boolean;

    /** Exit status based on output (jq -e flag) */
    exit_status?: boolean;

    /** Slurp - read entire input stream into array (jq -s flag) */
    slurp?: boolean;

    /** Path to jq binary (default: /usr/bin/jq) */
    binary_path?: string;

    /** Maximum execution time in milliseconds */
    timeout_ms?: number;
}

export interface JqResult {
    /** Filtered/transformed data from jq */
    data: any;

    /** Execution metrics */
    performance: {
        execution_time_ms: number;
        input_size_bytes: number;
        output_size_bytes: number;
        reduction_percent: number;
    };

    /** jq expression that was executed */
    expression_used: string;

    /** jq exit code */
    exit_code: number;
}

export class JqEngine {
    private tempDir: string;
    private createdFiles: Set<string> = new Set();
    private jqBinaryPath: string;

    constructor(jqBinaryPath: string = '/usr/bin/jq') {
        this.tempDir = join(tmpdir(), 'playwright-mcp-jq');
        this.jqBinaryPath = jqBinaryPath;
        this.ensureTempDir();
    }

    private async ensureTempDir(): Promise<void> {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, ignore
        }
    }

    /**
     * Execute jq query on JSON data
     */
    async query(
        data: any,
        expression: string,
        options: JqOptions = {}
    ): Promise<JqResult> {
        const startTime = Date.now();

        // Serialize input data
        const inputJson = JSON.stringify(data);
        const inputSize = Buffer.byteLength(inputJson, 'utf8');

        // Create temp file for input
        const tempFile = await this.createTempFile(inputJson);

        try {
            // Build jq command arguments
            const args = this.buildJqArgs(expression, options);

            // Add input file if not using null input
            if (!options.null_input) {
                args.push(tempFile);
            }

            // Execute jq
            const result = await this.executeJq(args, options.timeout_ms || 30000);

            // Parse output
            const outputData = this.parseJqOutput(result.stdout, options.raw_output);
            const outputSize = Buffer.byteLength(result.stdout, 'utf8');

            const executionTime = Date.now() - startTime;
            const reductionPercent = inputSize > 0
                ? ((inputSize - outputSize) / inputSize) * 100
                : 0;

            return {
                data: outputData,
                performance: {
                    execution_time_ms: executionTime,
                    input_size_bytes: inputSize,
                    output_size_bytes: outputSize,
                    reduction_percent: reductionPercent
                },
                expression_used: expression,
                exit_code: result.exitCode
            };
        } finally {
            // Cleanup temp file
            await this.cleanup(tempFile);
        }
    }

    /**
     * Validate jq expression syntax
     */
    async validate(expression: string): Promise<{ valid: boolean; error?: string }> {
        try {
            // Test with empty object
            await this.query({}, expression, { timeout_ms: 5000 });
            return { valid: true };
        } catch (error: any) {
            return {
                valid: false,
                error: error.message || 'Unknown jq error'
            };
        }
    }

    /**
     * Check if jq binary is available
     */
    async checkAvailability(): Promise<boolean> {
        try {
            await fs.access(this.jqBinaryPath, fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    private buildJqArgs(expression: string, options: JqOptions): string[] {
        const args: string[] = [];

        // Add flags
        if (options.raw_output) args.push('-r');
        if (options.compact) args.push('-c');
        if (options.sort_keys) args.push('-S');
        if (options.null_input) args.push('-n');
        if (options.exit_status) args.push('-e');
        if (options.slurp) args.push('-s');

        // Add expression
        args.push(expression);

        return args;
    }

    private async executeJq(
        args: string[],
        timeoutMs: number
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise((resolve, reject) => {
            const jqProcess = spawn(this.jqBinaryPath, args);

            let stdout = '';
            let stderr = '';
            let timedOut = false;

            // Set timeout
            const timeout = setTimeout(() => {
                timedOut = true;
                jqProcess.kill('SIGTERM');
                reject(new Error(`jq execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            // Capture stdout
            jqProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            // Capture stderr
            jqProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Handle completion
            jqProcess.on('close', (code) => {
                clearTimeout(timeout);

                if (timedOut) return;

                if (code !== 0) {
                    reject(new Error(`jq exited with code ${code}: ${stderr}`));
                } else {
                    resolve({
                        stdout,
                        stderr,
                        exitCode: code || 0
                    });
                }
            });

            // Handle errors
            jqProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`jq spawn error: ${error.message}`));
            });
        });
    }

    private parseJqOutput(output: string, rawOutput?: boolean): any {
        if (!output || output.trim() === '') {
            return rawOutput ? '' : null;
        }

        if (rawOutput) {
            return output;
        }

        try {
            // Try to parse as JSON
            return JSON.parse(output);
        } catch {
            // If parsing fails, try parsing as NDJSON (newline-delimited JSON)
            const lines = output.trim().split('\n');
            if (lines.length === 1) {
                // Single line that failed to parse
                return output;
            }

            // Try parsing each line as JSON
            try {
                return lines.map(line => JSON.parse(line));
            } catch {
                // If that fails too, return raw output
                return output;
            }
        }
    }

    private async createTempFile(content: string): Promise<string> {
        const filename = `jq-input-${Date.now()}-${Math.random().toString(36).substring(7)}.json`;
        const filepath = join(this.tempDir, filename);

        await fs.writeFile(filepath, content, 'utf8');
        this.createdFiles.add(filepath);

        return filepath;
    }

    private async cleanup(filepath: string): Promise<void> {
        try {
            await fs.unlink(filepath);
            this.createdFiles.delete(filepath);
        } catch {
            // Ignore cleanup errors
        }
    }

    /**
     * Cleanup all temp files (called on shutdown)
     */
    async cleanupAll(): Promise<void> {
        const cleanupPromises = Array.from(this.createdFiles).map(filepath =>
            this.cleanup(filepath)
        );

        await Promise.all(cleanupPromises);
    }
}

/**
 * Common jq expressions for differential snapshots
 */
export const JQ_EXPRESSIONS = {
    // Filter by change type
    ADDED_ONLY: '.changes[] | select(.change_type == "added")',
    REMOVED_ONLY: '.changes[] | select(.change_type == "removed")',
    MODIFIED_ONLY: '.changes[] | select(.change_type == "modified")',

    // Filter by element role
    BUTTONS_ONLY: '.changes[] | select(.element.role == "button")',
    LINKS_ONLY: '.changes[] | select(.element.role == "link")',
    INPUTS_ONLY: '.changes[] | select(.element.role == "textbox" or .element.role == "searchbox")',
    FORMS_ONLY: '.changes[] | select(.element.role == "form")',

    // Combined filters
    ADDED_BUTTONS: '.changes[] | select(.change_type == "added" and .element.role == "button")',
    INTERACTIVE_ELEMENTS: '.changes[] | select(.element.role | IN("button", "link", "textbox", "checkbox", "radio"))',

    // Transformations
    EXTRACT_TEXT: '.changes[] | .element.text',
    EXTRACT_REFS: '.changes[] | .element.ref',

    // Aggregations
    COUNT_CHANGES: '[.changes[]] | length',
    GROUP_BY_TYPE: '[.changes[]] | group_by(.change_type)',
    GROUP_BY_ROLE: '[.changes[]] | group_by(.element.role)',

    // Console filtering
    CONSOLE_ERRORS: '.console_activity[] | select(.level == "error")',
    CONSOLE_WARNINGS: '.console_activity[] | select(.level == "warning" or .level == "error")',
};
