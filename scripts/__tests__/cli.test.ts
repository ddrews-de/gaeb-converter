import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');
const TEST_DATA_DIR = join(REPO_ROOT, 'TestData');
const CLI = join(REPO_ROOT, 'scripts', 'cli.ts');
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], stdin?: Buffer): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [CLI, ...args], { cwd: REPO_ROOT });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', d => stdoutChunks.push(d));
    child.stderr.on('data', d => stderrChunks.push(d));
    child.on('error', reject);
    child.on('close', code =>
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      }),
    );
    if (stdin) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'gaeb-cli-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('CLI', () => {
  it('converts a .D83 to .X83 with --audit and --validate', async () => {
    const out = join(tmp, 'out.X83');
    const result = await runCli([
      join(TEST_DATA_DIR, 'LV_Los01.D83'),
      out,
      '--audit',
      '--validate',
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('gaeb90, DA 83');
    expect(result.stderr).toContain('validation OK');

    const xml = await readFile(out, 'utf-8');
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain(
      '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">',
    );

    const audit = await readFile(join(tmp, 'out.audit.txt'), 'utf-8');
    expect(audit).toContain('GAEB Converter — Conversion Report');
    expect(audit).toContain('Source format:    GAEB 90 (DA 83)');
  }, 60_000);

  it('converts a .P83 to .X83 and writes next to the input by default', async () => {
    // Default output path is "<base>.X83" *next to the input*. We can't
    // safely write into TestData/, so pass an explicit output instead.
    const out = join(tmp, 'p83.X83');
    const result = await runCli([
      join(TEST_DATA_DIR, 'LV_Los01.P83'),
      out,
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('gaeb2000, DA 83');
    const xml = await readFile(out, 'utf-8');
    expect(xml).toContain('GAEB_DA_XML/DA83/3.3');
  }, 60_000);

  it('reads from stdin and writes to stdout', async () => {
    const input = await readFile(join(TEST_DATA_DIR, 'LV_Los01.X83'));
    const result = await runCli(
      ['-i', 'project.x83', '-', '-', '--quiet'],
      input,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^<\?xml/);
    expect(result.stdout).toContain('GAEB_DA_XML/DA83/3.3');
    expect(result.stderr).toBe('');
  }, 60_000);

  it('exits 1 on an unknown file extension', async () => {
    const garbage = join(tmp, 'garbage.unknown');
    await writeFile(garbage, 'not a gaeb file');
    const result = await runCli([garbage]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Unrecognized GAEB file extension/);
  }, 60_000);

  it('shows help on --help', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('gaeb-convert — GAEB 90 / GAEB 2000');
    expect(result.stdout).toContain('Usage:');
  });

  it('exits 1 on no arguments', async () => {
    const result = await runCli([]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no input file given');
  });
});
