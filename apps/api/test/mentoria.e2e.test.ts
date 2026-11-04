import { ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REQUIRES_MFA } from '../src/auth/requires-mfa.decorator.js';
import { api, auditCount, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let idA: string;

const LISTA = '/api/mentoria/mentorados';
const BUSCA = '/api/mentoria/mentorados/search';

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await owner`update "user" set role = 'HEAD', two_factor_enabled = false where email = 'ana@npac.com.br'`;
  await owner`truncate mentoria_mentorados cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
  for (let i = 1; i <= 55; i++) {
    const n = String(i).padStart(2, '0');
    await owner`insert into mentoria_mentorados (nome, nome_norm, status)
      values (${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`}, 'ENGAJADO')`;
  }
  await owner`insert into mentoria_mentorados (nome, nome_norm, status, tipo_mentoria)
    values ('Ágata Fictícia', 'agata ficticia', 'EM_RISCO', 'Mentoria Fictícia A')`;
  const [r] = await owner<
    { id: string }[]
  >`select id from mentoria_mentorados where nome_norm = 'agata ficticia'`;
  idA = r!.id;
});

/** Login e MFA ligado depois (sem pedir código), como nos demais testes. */
const comMfa = async (email: string) => {
  const s = await h.signIn(email);
  await owner`update "user" set two_factor_enabled = true where email = ${email}`;
  return s;
};

describe('acesso', () => {
  it('SDR (ale), CLOSER (sonia) e HEAD (ronaldo) recebem 404 em lista e em GET por id (controle: DIRETOR recebe 200 na mesma rota)', async () => {
    const diretor = await comMfa('ana@npac.com.br');
    expect((await h.get(LISTA, diretor)).status).toBe(200);
    expect((await h.get(`${LISTA}/${idA}`, diretor)).status).toBe(200);
    for (const email of ['ale@npac.com.br', 'sonia@npac.com.br', 'ronaldo@npac.com.br']) {
      const s = await comMfa(email);
      expect((await h.get(LISTA, s)).status).toBe(404);
      expect((await h.get(`${LISTA}/${idA}`, s)).status).toBe(404);
      expect((await h.post(BUSCA, {}, s)).status).toBe(404);
    }
  });

  it('ACOMPANHAMENTO (carla) sem MFA recebe 403 MFA_REQUIRED', async () => {
    const carla = await h.signIn('carla@npac.com.br');
    const res = await h.get(LISTA, carla);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
    expect(res.body.message).toContain('Conta > MFA');
  });

  it('ACOMPANHAMENTO com two_factor_enabled verdadeiro lista e abre um registro', async () => {
    const carla = await comMfa('carla@npac.com.br');
    const lista = await h.get(LISTA, carla);
    expect(lista.status).toBe(200);
    expect(lista.body.itens).toHaveLength(50);
    const um = await h.get(`${LISTA}/${idA}`, carla);
    expect(um.status).toBe(200);
    expect(um.body).toMatchObject({
      id: idA,
      nome: 'Ágata Fictícia',
      status: 'EM_RISCO',
      version: 1,
    });
  });

  it('DIRETOR sem MFA recebe 403; com MFA recebe 200', async () => {
    const semMfa = await h.signIn('ana@npac.com.br');
    const r = await h.get(LISTA, semMfa);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('MFA_REQUIRED');
    await owner`update "user" set two_factor_enabled = true where email = 'ana@npac.com.br'`;
    expect((await h.get(LISTA, semMfa)).status).toBe(200);
  });

  it('id não-uuid ou inexistente → 404 (controle: id válido de registro existente → 200)', async () => {
    const carla = await comMfa('carla@npac.com.br');
    expect((await h.get(`${LISTA}/${idA}`, carla)).status).toBe(200);
    expect((await h.get(`${LISTA}/nao-e-uuid`, carla)).status).toBe(404);
    expect((await h.get(`${LISTA}/00000000-0000-4000-8000-000000000000`, carla)).status).toBe(404);
  });

  it('GET por id de registro existente tem Cache-Control: no-store (com DIRETOR)', async () => {
    const diretor = await comMfa('ana@npac.com.br');
    const res = await h.get(`${LISTA}/${idA}`, diretor);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('varredura de rotas do módulo: toda rota exige MFA (metadata REQUIRES_MFA); falha se alguma não exigir', async () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap((m) =>
      [...m.controllers.values()].map((c) => c.metatype as object),
    );
    const doModulo = controllers.filter((c) =>
      String(Reflect.getMetadata('path', c) ?? '').startsWith('mentoria'),
    );
    expect(doModulo.length).toBeGreaterThan(0);
    for (const c of doModulo) expect(Reflect.getMetadata(REQUIRES_MFA, c)).toBe(true);
  });

  it('nenhuma URL de paginação traz nome (cursor opaco)', async () => {
    const carla = await comMfa('carla@npac.com.br');
    const p1 = await h.get(LISTA, carla);
    expect(p1.body.itens[0].nome).toBe('Ágata Fictícia');
    const cursor = p1.body.cursor as string;
    expect(cursor).toBeTruthy();
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8').toLowerCase();
    expect(decoded).not.toContain('mentorado');
    expect(decoded).not.toContain('ficticio');
    const p2 = await h.get(`${LISTA}?cursor=${encodeURIComponent(cursor)}`, carla);
    expect(p2.status).toBe(200);
    expect(p2.body.itens).toHaveLength(6);
    expect(p2.body.cursor).toBeNull();
    const todos = [...p1.body.itens, ...p2.body.itens].map((i: { id: string }) => i.id);
    expect(new Set(todos).size).toBe(56);
    // Cursor adulterado não vale.
    const ruim = await h.get(`${LISTA}?cursor=${cursor.slice(0, -2)}xx`, carla);
    expect(ruim.status).toBe(400);
  });

  it('GET /api/mentoria/mentorados/search → 404 e POST → 200 (busca só por POST)', async () => {
    const carla = await comMfa('carla@npac.com.br');
    expect((await h.get(BUSCA, carla)).status).toBe(404);
    const res = await h.post(BUSCA, { q: 'agata' }, carla);
    expect(res.status).toBe(200);
    expect(res.body.itens.map((i: { id: string }) => i.id)).toEqual([idA]);
    const sem = await h.post(BUSCA, { q: 'ÁGATA  fictícia' }, carla);
    expect(sem.body.itens).toHaveLength(1);
    const st = await h.post(BUSCA, { status: 'EM_RISCO' }, carla);
    expect(st.body.itens).toHaveLength(1);
    const tm = await h.post(BUSCA, { tipoMentoria: 'Mentoria Fictícia A' }, carla);
    expect(tm.body.itens).toHaveLength(1);
    expect((await h.post(BUSCA, { outro: 1 }, carla)).status).toBe(400);
  });

  it('abrir um registro grava audit mentoria.open sem nome nem e-mail', async () => {
    const carla = await comMfa('carla@npac.com.br');
    await h.get(`${LISTA}/${idA}`, carla);
    expect(await auditCount('mentoria.open')).toBe(1);
    const rows = await owner<{ entity_type: string; entity_id: string; data: unknown }[]>`
      select entity_type, entity_id, data from audit_log where action = 'mentoria.open'`;
    expect(rows[0]).toMatchObject({
      entity_type: 'mentorado',
      entity_id: idA,
      data: { fields: [] },
    });
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('Ágata');
    expect(dump).not.toContain('@');
  });

  it('listar não grava auditoria', async () => {
    const carla = await comMfa('carla@npac.com.br');
    await h.get(LISTA, carla);
    await h.post(BUSCA, { q: 'agata' }, carla);
    const [r] = await owner<
      { n: number }[]
    >`select count(*)::int as n from audit_log where action like 'mentoria.%'`;
    expect(r?.n).toBe(0);
  });
});
