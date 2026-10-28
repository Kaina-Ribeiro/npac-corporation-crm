import { Writable } from 'node:stream';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/common/logging/logger.js';

function captureLog(fn: (l: Logger) => void): string {
  let out = '';
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += String(chunk);
      cb();
    },
  });
  fn(createLogger(sink));
  return out;
}

describe('logger', () => {
  it('mascara telefone e cookie', () => {
    const out = captureLog((l) =>
      l.info({ phone: '+5511988887777', req: { headers: { cookie: 's=1' } } }),
    );
    expect(out).not.toContain('98888');
    expect(out).not.toContain('s=1');
  });
  it('mascara e-mail, instagram, senha e authorization aninhados', () => {
    const out = captureLog((l) =>
      l.info({
        lead: { email: 'a@b.com', instagram: 'fulano', password: 'segredo' },
        req: { headers: { authorization: 'Bearer tok' } },
      }),
    );
    for (const s of ['a@b.com', 'fulano', 'segredo', 'Bearer tok']) expect(out).not.toContain(s);
  });
});
