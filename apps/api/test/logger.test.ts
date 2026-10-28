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
  const logger = createLogger(sink);
  logger.level = 'info'; // setup-env silencia logs da API, mas este teste precisa capturá-los.
  fn(logger);
  return out;
}

describe('logger', () => {
  it('omite query strings e corpo da requisição', () => {
    const out = captureLog((l) =>
      l.info({
        req: {
          method: 'GET',
          url: '/api/leads?search=11988887777',
          body: { search: '11988887777' },
          headers: { cookie: 's=1' },
        },
      }),
    );
    expect(out).not.toContain('98888');
    expect(out).toContain('/api/leads');
  });
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
