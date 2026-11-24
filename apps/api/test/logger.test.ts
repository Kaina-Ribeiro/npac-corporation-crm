import { Writable } from 'node:stream';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { createLogger, semLogDeAcesso } from '../src/common/logging/logger.js';

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
  // NPAC-71: cada linha de acesso levava ~1 KB de cabeçalhos e a checagem de saúde (a cada 15 s)
  // enchia o log; em produção sobravam ~25 minutos, sem as linhas de push.
  it('resposta vai só com o status, sem cabeçalhos', () => {
    const out = captureLog((l) =>
      l.info({
        res: { statusCode: 200, headers: { 'content-security-policy': "default-src 'self'" } },
      }),
    );
    expect(out).toContain('"statusCode":200');
    expect(out).not.toContain('content-security-policy');
  });
  it('a checagem de saúde fica fora do log de acesso', () => {
    expect(semLogDeAcesso({ url: '/api/health' })).toBe(true);
    expect(semLogDeAcesso({ url: '/api/health?x=1' })).toBe(true);
    expect(semLogDeAcesso({ url: '/api/leads' })).toBe(false);
    expect(semLogDeAcesso({})).toBe(false);
  });
});
