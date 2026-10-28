import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const key = Buffer.alloc(32, 7).toString('base64');
const validEnv = {
  APP_DATABASE_URL: 'postgres://npac_app:x@localhost:5432/npac',
  BETTER_AUTH_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
  FIELD_ENCRYPTION_KEY: key,
  BLIND_INDEX_KEY: Buffer.alloc(32, 9).toString('base64'),
  API_PORT: '4000',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('aceita env válido e decodifica as chaves', () => {
    const env = loadEnv(validEnv);
    expect(env.FIELD_ENCRYPTION_KEY).toHaveLength(32);
    expect(env.API_PORT).toBe(4000);
  });
  it('env sem chave falha', () =>
    expect(() => loadEnv({ ...validEnv, FIELD_ENCRYPTION_KEY: undefined })).toThrow());
  it('chave que não tem 32 bytes falha', () =>
    expect(() =>
      loadEnv({ ...validEnv, BLIND_INDEX_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/32 bytes/));
  it('sem segredo do auth falha', () =>
    expect(() => loadEnv({ ...validEnv, BETTER_AUTH_SECRET: undefined })).toThrow());
  it('origens extras confiáveis vêm separadas por vírgula e precisam ser URLs', () => {
    expect(loadEnv(validEnv).EXTRA_TRUSTED_ORIGINS).toEqual([]);
    expect(
      loadEnv({ ...validEnv, EXTRA_TRUSTED_ORIGINS: 'https://a.trycloudflare.com, http://x:1' })
        .EXTRA_TRUSTED_ORIGINS,
    ).toEqual(['https://a.trycloudflare.com', 'http://x:1']);
    expect(() => loadEnv({ ...validEnv, EXTRA_TRUSTED_ORIGINS: 'nao-e-url' })).toThrow();
  });
  it('MFA obrigatório por padrão e nunca desligável em produção', () => {
    expect(loadEnv(validEnv).MFA_REQUIRED).toBe(true);
    expect(loadEnv({ ...validEnv, MFA_REQUIRED: 'false' }).MFA_REQUIRED).toBe(false);
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'production', MFA_REQUIRED: 'false' })).toThrow(
      /MFA/,
    );
  });
});
