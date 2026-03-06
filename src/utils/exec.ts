import { spawn, execFile, type SpawnOptions } from 'child_process';
import { promisify } from 'util';
import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import type { RunResult } from '../types.js';

const execFileAsync = promisify(execFile);

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  [key: string]: unknown;
}

interface RunCaptureOptions extends RunOptions {
  onLine?: (line: string) => void;
}

/**
 * Run a command and capture stdout/stderr.
 * Throws on non-zero exit code.
 */
export async function run(cmd: string, args: string[] = [], opts: RunOptions = {}): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...opts.env },
      ...opts,
    } as Parameters<typeof execFileAsync>[2]);
    return { 
      stdout: String(stdout || '').trim(), 
      stderr: String(stderr || '').trim() 
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    throw new Error(
      `Command failed: ${cmd} ${args.join(' ')}\n${e.stderr || e.message}`
    );
  }
}

/**
 * Run a command and capture output, returning null on failure instead of throwing.
 */
export async function runSafe(cmd: string, args: string[] = [], opts: RunOptions = {}): Promise<RunResult | null> {
  try {
    return await run(cmd, args, opts);
  } catch {
    return null;
  }
}

/**
 * Run a command with inherited stdio (interactive).
 * Returns exit code.
 */
export function runInteractive(cmd: string, args: string[] = [], opts: RunOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...opts.env },
      ...opts,
    } as SpawnOptions);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}`));
      } else {
        resolve(code ?? 0);
      }
    });
  });
}

/**
 * Run a command, capturing stdout line by line.
 * Calls onLine(line) for each stdout line.
 * Returns { stdout, stderr }.
 */
export function runCapture(cmd: string, args: string[] = [], opts: RunCaptureOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const child = spawn(cmd, args, {
      env: { ...process.env, ...opts.env },
      ...opts,
    } as SpawnOptions);

    child.stdout?.on('data', (d: Buffer) => stdoutChunks.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => stderrChunks.push(d.toString()));
    if (opts.onLine) {
      child.stdout?.on('data', (d: Buffer) => {
        d.toString().split('\n').filter(Boolean).forEach(opts.onLine!);
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      const out = stdoutChunks.join('').trim();
      const err = stderrChunks.join('').trim();
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}\n${err}`));
      } else {
        resolve({ stdout: out, stderr: err });
      }
    });
  });
}

/**
 * Run a command with a spinner. Shows success/fail on completion.
 */
export async function runWithSpinner<T>(text: string, fn: (spinner: Ora) => Promise<T>): Promise<T> {
  const spinner = ora(text).start();
  try {
    const result = await fn(spinner);
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail(chalk.red((err as Error).message));
    throw err;
  }
}

/**
 * Spawn a process, write stdinData to its stdin, and capture stdout.
 * Useful for commands that read from stdin.
 */
export function spawnWithStdin(cmd: string, args: string[], stdinData: string, opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env },
    });

    child.stdout!.on('data', (d: Buffer) => stdoutChunks.push(d.toString()));
    child.stderr!.on('data', (d: Buffer) => stderrChunks.push(d.toString()));

    child.on('error', reject);
    child.on('close', (code) => {
      const out = stdoutChunks.join('').trim();
      const err = stderrChunks.join('').trim();
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}\n${err}`));
      } else {
        resolve({ stdout: out, stderr: err });
      }
    });

    if (stdinData) {
      child.stdin!.write(stdinData);
      child.stdin!.end();
    }
  });
}

/**
 * Check if a command exists in PATH.
 */
export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await run('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}
