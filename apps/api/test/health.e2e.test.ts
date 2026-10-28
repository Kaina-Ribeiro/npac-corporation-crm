import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.setup.js';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('responde { ok: true } com no-store e headers do helmet', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rotas ficam sob o prefixo /api', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(404);
  });
});
