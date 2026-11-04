import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
});

describe('backup e limites', () => {
  it('limites mostram 256 KB por registro, 25.000 registros e 20 MB, com os registros usados nos 3 módulos', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 01', 'mentorado ficticio 01', 'ENGAJADO')`;
    await owner`insert into mentoria_fichas (id, nome, nome_norm) values (gen_random_uuid(), 'Mentorado Fictício 02', 'mentorado ficticio 02')`;
    await owner`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (gen_random_uuid(), 'Mentorado Fictício 03', 'mentorado ficticio 03')`;
    const carla = await h.signIn('carla@npac.com.br');
    await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
    const r = await h.get('/api/mentoria/backup/limites', carla);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      registroBytes: 256 * 1024,
      registrosTotal: 25_000,
      arquivoBytes: 20 * 1024 * 1024,
      registrosUsados: 3,
    });
  });

  it('SDR recebe 404 nos limites', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.get('/api/mentoria/backup/limites', ale)).status).toBe(404);
  });
});
