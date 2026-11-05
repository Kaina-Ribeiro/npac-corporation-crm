import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;
let ficha: string;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  carla = await h.signIn('carla@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  ficha = randomUUID();
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, 'Mentorado Fictício 07', 'mentorado ficticio 07')`;
  await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values
    ('FICHA_ANTES', ${ficha}, 'FOTO', 'k-antes', 'image/jpeg', 1), ('FICHA_DEPOIS', ${ficha}, 'FOTO', 'k-depois', 'image/jpeg', 1)`;
});

describe('eliminação pela API', () => {
  it('exclusão grava audit mentoria.delete com ids e contagens, sem nome', async () => {
    const r = await h.post(`/api/mentoria/registros/ficha/${ficha}/excluir`, { version: 1 }, carla);
    expect(r.status).toBe(204);
    const rows = await owner<{ entity_type: string; entity_id: string; data: unknown }[]>`
      select entity_type, entity_id, data from audit_log where action = 'mentoria.delete'`;
    expect(rows).toEqual([
      { entity_type: 'ficha', entity_id: ficha, data: { kind: 'FICHA', midias: 2 } },
    ]);
    expect(JSON.stringify(rows)).not.toContain('Fictício');
  });

  it('exclusão não deixa mídia órfã: a fila de exclusão tem a chave de cada arquivo', async () => {
    await h.post(`/api/mentoria/registros/ficha/${ficha}/excluir`, { version: 1 }, carla);
    const fila = await owner<
      { chave_objeto: string }[]
    >`select chave_objeto from mentoria_midia_exclusao order by chave_objeto`;
    expect(fila.map((f) => f.chave_objeto)).toEqual(['k-antes', 'k-depois']);
    const [m] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_midia`;
    expect(m?.n).toBe(0);
  });

  it('excluir pessoa remove a mesma pessoa nos três módulos e audita as contagens', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 07', 'mentorado ficticio 07', 'ENGAJADO')`;
    await owner`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${randomUUID()}, 'Mentorado Fictício 07', 'mentorado ficticio 07')`;
    const [m] = await owner<{ id: string }[]>`select id from mentoria_mentorados`;
    const aberto = await h.get(`/api/mentoria/mentorados/${m!.id}`, carla);
    const ref = aberto.body.pessoaRef as string;
    expect(ref).toMatch(/^[0-9a-f-]{36}$/);
    const r = await h.post(`/api/mentoria/pessoas/${ref}/excluir`, {}, carla);
    expect(r.status).toBe(204);
    for (const t of ['mentoria_mentorados', 'mentoria_fichas', 'mentoria_rdv_pessoas']) {
      const [n] = await owner<{ n: number }[]>`select count(*)::int as n from ${owner(t)}`;
      expect(n?.n, t).toBe(0);
    }
    const [a] = await owner<
      { data: unknown }[]
    >`select data from audit_log where action = 'mentoria.delete_person'`;
    expect(a?.data).toEqual({ registros: 3, midias: 2 });
    expect((await h.post(`/api/mentoria/pessoas/${ref}/excluir`, {}, carla)).status).toBe(404);
  });

  it('SDR recebe 404 na exclusão do registro', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    expect(
      (await h.post(`/api/mentoria/registros/ficha/${ficha}/excluir`, { version: 1 }, ale)).status,
    ).toBe(404);
    expect((await h.post(`/api/mentoria/pessoas/${randomUUID()}/excluir`, {}, ale)).status).toBe(
      404,
    );
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_fichas`;
    expect(n?.n).toBe(1);
  });
});
