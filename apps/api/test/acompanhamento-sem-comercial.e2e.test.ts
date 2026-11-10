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

/** Rotas que o cargo usa: a própria sessão, o SSE (fim de sessão), o módulo e as públicas. */
const LIBERADAS = [
  /^\/api\/me$/,
  /^\/api\/events$/,
  /^\/api\/mentoria\//,
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

  it('o módulo e a própria sessão continuam abertos', async () => {
    const s = await carla();
    expect((await h.get('/api/me', s)).status).toBe(200);
    expect((await h.get('/api/mentoria/backup/medidor', s)).status).toBe(200);
  });
});
