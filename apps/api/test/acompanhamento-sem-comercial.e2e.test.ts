import { RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';

// O cargo Acompanhamento só usa o módulo de mentorados: nada do comercial (leads, equipe,
// vendas, chat, avisos…). Invisível = 404, como no resto do CRM.

// Chaves de metadata do Nest (`@nestjs/common/constants`, sem tipos exportados).
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;

/**
 * Rotas que o cargo usa: a sessão, o SSE (fim de sessão), o módulo, o push (D12), as públicas e
 * o Meu perfil (NPAC-53: a própria conta e as fotos da equipe, sem dado comercial).
 */
const LIBERADAS = [
  /^\/api\/me$/,
  /^\/api\/me\//,
  /^\/api\/users\/:id\/photo$/,
  /^\/api\/team\/photos$/,
  /^\/api\/events$/,
  /^\/api\/mentoria\//,
  /^\/api\/push\//,
  /^\/api\/health$/,
  /^\/api\/_test\//,
];

type Rota = { metodo: string; caminho: string };

/** Todas as rotas registradas no Nest (inclui as que forem criadas depois deste teste). */
function rotas(): Rota[] {
  const out: Rota[] = [];
  for (const mod of app.get(ModulesContainer).values()) {
    for (const ctrl of mod.controllers.values()) {
      const tipo = ctrl.metatype as (new (...a: never[]) => object) | null;
      if (!tipo) continue;
      const bases = [Reflect.getMetadata(PATH_METADATA, tipo) as string | string[]].flat();
      const proto = tipo.prototype as Record<string, unknown>;
      for (const nome of Object.getOwnPropertyNames(proto)) {
        const fn = proto[nome];
        if (typeof fn !== 'function' || nome === 'constructor') continue;
        const caminho = Reflect.getMetadata(PATH_METADATA, fn) as string | string[] | undefined;
        const metodo = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
        if (caminho === undefined || metodo === undefined) continue;
        for (const base of bases)
          for (const c of [caminho].flat()) {
            const partes = ['api', base, c].filter((p) => p && p !== '/');
            out.push({
              metodo: RequestMethod[metodo].toLowerCase(),
              caminho: `/${partes.join('/')}`.replace(/\/+/g, '/'),
            });
          }
      }
    }
  }
  return out;
}

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => resetAuthState());

const carla = async () => {
  const s = await h.signIn('carla@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  return s;
};

describe('cargo Acompanhamento não vê o comercial', () => {
  it('toda rota fora do módulo responde 404', async () => {
    const s = await carla();
    const todas = rotas().filter((r) => !r.caminho.startsWith('/api/auth'));
    const comerciais = todas.filter((r) => !LIBERADAS.some((re) => re.test(r.caminho)));
    // A varredura enxerga as rotas comerciais que vazavam para o cargo (itodev, 05/11/2026).
    expect(comerciais.map((r) => r.caminho)).toEqual(
      expect.arrayContaining([
        '/api/team',
        '/api/leads',
        '/api/notifications',
        '/api/today/search',
      ]),
    );
    const vazou: string[] = [];
    for (const r of comerciais) {
      const url = r.caminho.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
      const req = (
        request(app.getHttpServer()) as unknown as Record<string, (u: string) => request.Test>
      )[r.metodo]!(url)
        .set('Origin', ORIGIN)
        .set('Cookie', s);
      const res = r.metodo === 'get' ? await req : await req.send({});
      if (res.status !== 404) vazou.push(`${r.metodo.toUpperCase()} ${r.caminho} → ${res.status}`);
    }
    expect(vazou).toEqual([]);
  });

  it('Acompanhamento sem o selo de Admin recebe 404 em admin/*; com o selo, as contas da área abrem', async () => {
    // NPAC-54, Fase 2: o Admin do módulo é o Head do Acompanhamento e gerencia as contas da área.
    const ADMIN = ['/api/admin/users', '/api/admin/access-requests', '/api/admin/acessos'];
    for (const perfil of [null, 'OPERACAO']) {
      await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
      if (perfil)
        await owner`insert into mentoria_perfis (user_id, perfil, admin)
          select id, ${perfil}, false from "user" where email = 'carla@npac.com.br'`;
      const s = await carla();
      for (const url of ADMIN) expect((await h.get(url, s)).status, `${perfil} ${url}`).toBe(404);
    }
    await owner`update mentoria_perfis set admin = true where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
    try {
      const s = await carla();
      expect((await h.get('/api/admin/users', s)).status).toBe(200);
      expect((await h.get('/api/admin/access-requests', s)).status).toBe(200);
      // Registro de acessos e transferir leads: só Diretoria / comercial.
      expect((await h.get('/api/admin/acessos', s)).status).toBe(404);
      expect((await h.post('/api/admin/users/x/transfer-leads', { to: 'y' }, s)).status).toBe(404);
    } finally {
      await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
    }
  });

  it('o módulo e a própria sessão continuam abertos', async () => {
    const s = await carla();
    expect((await h.get('/api/me', s)).status).toBe(200);
    expect((await h.get('/api/mentoria/eu', s)).status).toBe(200);
  });
});
