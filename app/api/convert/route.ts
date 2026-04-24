/**
 * POST /api/convert — server-side GAEB2GAEB conversion endpoint.
 *
 * Two input shapes are accepted:
 *
 *   1. multipart/form-data with a `file` field     (simple curl -F)
 *   2. raw binary body + `x-filename` header       (scriptable pipelines)
 *
 * Either way the body gets fed into the shared `convert()` façade (same
 * code path as the browser UI) and the resulting GAEB DA XML 3.3 is
 * streamed back as `application/xml` with a sensible download filename.
 *
 * Errors are JSON: { error: string; code: string }
 *   400 on missing body, unknown extension, or a parser-level rejection
 *   500 on unexpected internal exceptions
 */

import { NextResponse } from 'next/server';
import { FormatDetectionError, convert } from '../../lib/gaeb';

export const runtime = 'nodejs';

interface ResolvedInput {
  bytes: Uint8Array;
  fileName: string;
}

export async function POST(request: Request): Promise<Response> {
  let input: ResolvedInput;
  try {
    input = await resolveInput(request);
  } catch (err) {
    return badRequest('INVALID_INPUT', errorMessage(err));
  }

  try {
    const { xml, targetFileName } = convert(input.bytes, input.fileName);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeFilename(targetFileName)}"`,
      },
    });
  } catch (err) {
    if (err instanceof FormatDetectionError) {
      return badRequest('UNRECOGNIZED_FORMAT', err.message);
    }
    return internalError(errorMessage(err));
  }
}

async function resolveInput(request: Request): Promise<ResolvedInput> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new Error('multipart/form-data: missing `file` part');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, fileName: file.name };
  }

  // Raw binary body path.
  const fileName = request.headers.get('x-filename');
  if (!fileName) {
    throw new Error('raw-body requests must provide an x-filename header');
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('request body is empty');
  }
  return { bytes: new Uint8Array(buffer), fileName };
}

function badRequest(code: string, message: string): Response {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

function internalError(message: string): Response {
  return NextResponse.json(
    { error: message, code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function encodeFilename(name: string): string {
  // Strip anything that would prematurely close the Content-Disposition
  // quoted value. Everything else can stay as-is; clients support UTF-8
  // filenames via the plain form here.
  return name.replace(/["\r\n]/g, '');
}
