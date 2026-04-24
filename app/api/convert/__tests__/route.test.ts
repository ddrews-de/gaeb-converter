import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POST } from '../route';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(TEST_DATA_DIR, name));
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

function rawRequest(body: ArrayBuffer, fileName: string): Request {
  return new Request('http://localhost/api/convert', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-filename': fileName,
    },
    body,
  });
}

describe('POST /api/convert — raw body path', () => {
  it('converts a .X83 fixture to GAEB DA XML 3.3', async () => {
    const response = await POST(rawRequest(fixture('LV_Los01.X83'), 'LV_Los01.X83'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/application\/xml/);
    expect(response.headers.get('content-disposition')).toMatch(
      /filename="LV_Los01\.X83"/,
    );
    const body = await response.text();
    expect(body).toContain('<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">');
  });

  it('rewrites the target filename for .P83 and .D83 sources', async () => {
    const p = await POST(rawRequest(fixture('LV_Los01.P83'), 'LV_Los01.P83'));
    const d = await POST(rawRequest(fixture('LV_Los01.D83'), 'LV_Los01.D83'));
    expect(p.status).toBe(200);
    expect(d.status).toBe(200);
    expect(p.headers.get('content-disposition')).toMatch(/LV_Los01\.X83/);
    expect(d.headers.get('content-disposition')).toMatch(/LV_Los01\.X83/);
  });

  it('returns 400 when the x-filename header is missing', async () => {
    const request = new Request('http://localhost/api/convert', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: fixture('LV_Los01.X83') as BodyInit,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when the body is empty', async () => {
    const request = new Request('http://localhost/api/convert', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': 'empty.x83',
      },
      body: new ArrayBuffer(0),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('INVALID_INPUT');
  });

  it('returns 400 on an unknown extension', async () => {
    const helloBytes = new TextEncoder().encode('hello');
    const helloAb = helloBytes.buffer.slice(
      helloBytes.byteOffset,
      helloBytes.byteOffset + helloBytes.byteLength,
    );
    const response = await POST(rawRequest(helloAb as ArrayBuffer, 'file.unknown'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('UNRECOGNIZED_FORMAT');
  });
});

describe('POST /api/convert — multipart/form-data path', () => {
  it('accepts a file field and returns the converted XML', async () => {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(fixture('LV_Los01.X83'))], {
      type: 'application/octet-stream',
    });
    form.append('file', blob, 'LV_Los01.X83');

    const request = new Request('http://localhost/api/convert', {
      method: 'POST',
      body: form,
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(
      /filename="LV_Los01\.X83"/,
    );
    const body = await response.text();
    expect(body).toMatch(/^<\?xml/);
  });

  it('returns 400 when the multipart payload lacks a file field', async () => {
    const form = new FormData();
    form.append('other', 'nope');
    const request = new Request('http://localhost/api/convert', {
      method: 'POST',
      body: form,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
