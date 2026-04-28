#!/usr/bin/env tsx
/**
 * Simplified command-line GAEB2GAEB converter.
 *
 * Usage:
 *   npx tsx scripts/cli.ts <input> [output] [flags]
 *
 * Examples:
 *   npx tsx scripts/cli.ts LV_Los01.D83
 *   npx tsx scripts/cli.ts LV_Los01.D83 out.X83
 *   npx tsx scripts/cli.ts LV_Los01.D83 --audit
 *   cat LV_Los01.D83 | npx tsx scripts/cli.ts -i LV_Los01.D83 - > out.X83
 *
 * Flags:
 *   --audit          Also write a `<base>.audit.txt` next to the XML output.
 *   --validate       Run the schemaless GAEB DA XML 3.3 validator after
 *                    serialising and emit any issues to stderr.
 *   --quiet          Suppress all stderr output except errors.
 *   -i, --input-name Override the file name used for format detection
 *                    (mainly relevant when reading from stdin).
 *   -h, --help       Show this help text.
 *
 * Exit codes:
 *   0  success
 *   1  user error (bad args, format detection failed, validation failed)
 *   2  internal parser/serializer error
 *
 * The script is a thin wrapper around the same `convert()` façade the
 * browser UI and the /api/convert HTTP endpoint use, so behaviour matches
 * exactly across all three entry points.
 */

// Install DOMParser onto globalThis before the library imports run, so the
// XML parser and validator can call `new DOMParser()` outside a browser.
import './dom-setup';

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { stdin } from 'node:process';
import {
  FormatDetectionError,
  auditLogFileName,
  buildAuditLog,
  convert,
  validateGaebXml33,
} from '../app/lib/gaeb';

interface CliArgs {
  inputPath: string | '-';
  outputPath: string | '-' | null;
  inputName: string | null;
  audit: boolean;
  validate: boolean;
  quiet: boolean;
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`gaeb-convert: ${errorMessage(err)}\n`);
    process.stderr.write('Run with --help for usage.\n');
    return 1;
  }

  if (!args.quiet) {
    process.stderr.write(`gaeb-convert: reading ${args.inputPath === '-' ? 'stdin' : args.inputPath}\n`);
  }

  let bytes: Uint8Array;
  try {
    bytes = await readInput(args.inputPath);
  } catch (err) {
    process.stderr.write(`gaeb-convert: cannot read input: ${errorMessage(err)}\n`);
    return 1;
  }

  const fileName = args.inputName ?? (args.inputPath === '-' ? 'input.gaeb' : args.inputPath);

  let result;
  try {
    result = convert(bytes, fileName);
  } catch (err) {
    if (err instanceof FormatDetectionError) {
      process.stderr.write(`gaeb-convert: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(`gaeb-convert: conversion failed: ${errorMessage(err)}\n`);
    return 2;
  }

  const { doc, xml, targetFileName } = result;
  const outputPath = args.outputPath === null
    ? targetFileName
    : args.outputPath;

  try {
    await writeOutput(outputPath, xml);
  } catch (err) {
    process.stderr.write(`gaeb-convert: cannot write output: ${errorMessage(err)}\n`);
    return 1;
  }

  if (!args.quiet) {
    summarise(doc, outputPath);
  }

  if (args.audit) {
    const auditPath = outputPath === '-'
      ? '-'
      : auditLogFileName(outputPath);
    const log = buildAuditLog(doc, {
      sourceFileName: fileName,
      targetFileName: outputPath === '-' ? targetFileName : outputPath,
    });
    try {
      await writeOutput(auditPath, log);
      if (!args.quiet && auditPath !== '-') {
        process.stderr.write(`gaeb-convert: audit log → ${auditPath}\n`);
      }
    } catch (err) {
      process.stderr.write(`gaeb-convert: cannot write audit log: ${errorMessage(err)}\n`);
      return 1;
    }
  }

  if (args.validate) {
    const verdict = validateGaebXml33(xml);
    for (const issue of verdict.issues) {
      process.stderr.write(`[${issue.severity}] ${issue.path}: ${issue.message}\n`);
    }
    if (!verdict.valid) {
      process.stderr.write('gaeb-convert: validation reported errors\n');
      return 1;
    }
    if (!args.quiet) {
      process.stderr.write('gaeb-convert: validation OK\n');
    }
  }

  return 0;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    inputPath: '',
    outputPath: null,
    inputName: null,
    audit: false,
    validate: false,
    quiet: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case '--audit':
        out.audit = true;
        break;
      case '--validate':
        out.validate = true;
        break;
      case '--quiet':
        out.quiet = true;
        break;
      case '-i':
      case '--input-name':
        out.inputName = argv[++i];
        if (!out.inputName) throw new Error('--input-name requires a value');
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`unknown flag '${arg}'`);
        positional.push(arg);
    }
  }

  if (positional.length === 0) throw new Error('no input file given');
  if (positional.length > 2) throw new Error(`too many positional arguments: ${positional.slice(2).join(' ')}`);

  out.inputPath = positional[0] === '-' ? '-' : positional[0];
  out.outputPath = positional[1] ?? null;
  if (out.outputPath !== null && out.outputPath !== '-' && out.outputPath.endsWith('/')) {
    throw new Error(`output path '${out.outputPath}' looks like a directory`);
  }
  return out;
}

async function readInput(path: string | '-'): Promise<Uint8Array> {
  if (path === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(chunk as Buffer);
    return new Uint8Array(Buffer.concat(chunks));
  }
  const buf = await fs.readFile(path);
  return new Uint8Array(buf);
}

async function writeOutput(path: string | '-', text: string): Promise<void> {
  if (path === '-') {
    process.stdout.write(text);
    return;
  }
  const dir = dirname(path);
  if (dir && dir !== '.') {
    await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  }
  await fs.writeFile(path, text, 'utf-8');
}

function summarise(doc: ReturnType<typeof convert>['doc'], outputPath: string): void {
  const items = countItems(doc.award.boq);
  const cats = countCtgys(doc.award.boq);
  const parts: string[] = [
    `${doc.generation}`,
    `DA ${doc.da}`,
    `${cats} categor${cats === 1 ? 'y' : 'ies'}`,
    `${items} item${items === 1 ? '' : 's'}`,
  ];
  if (doc.sourceEncoding) parts.push(`encoding=${doc.sourceEncoding}`);
  if (doc.warnings.length > 0) parts.push(`${doc.warnings.length} warning${doc.warnings.length === 1 ? '' : 's'}`);
  process.stderr.write(`gaeb-convert: ${parts.join(', ')} → ${outputPath}\n`);
}

function countItems(nodes: ReturnType<typeof convert>['doc']['award']['boq']): number {
  let n = 0;
  const walk = (list: typeof nodes) => {
    for (const node of list) {
      if (node.kind === 'item') n++;
      else walk(node.children);
    }
  };
  walk(nodes);
  return n;
}

function countCtgys(nodes: ReturnType<typeof convert>['doc']['award']['boq']): number {
  let n = 0;
  const walk = (list: typeof nodes) => {
    for (const node of list) {
      if (node.kind === 'ctgy') {
        n++;
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return n;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const USAGE = `gaeb-convert — GAEB 90 / GAEB 2000 → GAEB DA XML 3.3 converter

Usage:
  gaeb-convert <input> [output] [flags]
  cat <input> | gaeb-convert -i <name> - [output] [flags]

Arguments:
  <input>           Path to the source file, or '-' for stdin.
  [output]          Path to write the XML to. Defaults to '<base>.x<DA>'
                    next to the input. Use '-' to stream to stdout.

Flags:
  --audit           Also write a '<output>.audit.txt' summary file.
  --validate        Validate the XML output structurally and exit 1
                    if any error-level issue is found.
  --quiet           Suppress informational stderr output.
  -i, --input-name  File name to use for format detection (required
                    when reading from stdin).
  -h, --help        Show this help.

Exit codes:
  0  success
  1  user error (bad args, format detection failed, validation failed)
  2  internal parser/serializer error

Examples:
  gaeb-convert LV_Los01.D83
  gaeb-convert LV_Los01.D83 out.X83 --audit --validate
  curl ... | gaeb-convert -i project.d83 - > project.x83
`;

main().then(
  code => process.exit(code),
  err => {
    process.stderr.write(`gaeb-convert: unexpected error: ${errorMessage(err)}\n`);
    process.exit(2);
  },
);
