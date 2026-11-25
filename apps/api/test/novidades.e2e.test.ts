import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { NOVIDADES, ULTIMA_NOVIDADE } from '@npac/shared/novidades';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

// NPAC-77: versão no ar e "já vi" das novidades, guardado na conta.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
const ANA = 'ana@npac.com.br';
const DUDA = 'carla@npac.com.br'; // cargo Acompanhamento (fora do comercial)
const MAIS_ANTIGA = NOVIDADES[NOVIDADES.length - 1]!.id;
const SEGUNDA = NOVIDADES[1]!.id;

const vistaDe = async (email: string) =>
  (
    await owner<
      { v: string | null }[]
    >`select novidades_vista as v from "user" where email = ${email}`
  )[0]!.v;
const definir = (email: string, v: string | null) =>
  owner`update "user" set novidades_vista = ${v} where email = ${email}`;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`update "user" set novidades_vista = null where email in (${ANA}, ${DUDA})`;
});
afterAll(async () => {
  await owner`update "user" set novidades_vista = null where email in (${ANA}, ${DUDA})`;
  await resetAuthState();
  await closeTestApp(app);
});

describe('GET /api/me: versão e novidades', () => {
  it('sem APP_VERSION a versão é "dev"', async () => {
    const ana = await h.signIn(ANA);
    expect((await h.get('/api/me', ana)).body.versao).toBe('dev');
  });

  it('coluna vazia: grava a mais nova e não abre nada (conta nova não recebe o histórico)', async () => {
    const ana = await h.signIn(ANA);
    expect(await vistaDe(ANA)).toBeNull();
    const res = await h.get('/api/me', ana);
    expect(res.status).toBe(200);
    expect(res.body.novidadesVista).toBe(ULTIMA_NOVIDADE);
    expect(await vistaDe(ANA)).toBe(ULTIMA_NOVIDADE);
  });

  it('com valor gravado, devolve o que está lá sem mudar', async () => {
    await definir(ANA, MAIS_ANTIGA);
    const ana = await h.signIn(ANA);
    expect((await h.get('/api/me', ana)).body.novidadesVista).toBe(MAIS_ANTIGA);
    expect(await vistaDe(ANA)).toBe(MAIS_ANTIGA);
  });
});

describe('POST /api/me/novidades/vista', () => {
  it('avança para uma novidade mais nova e o /me já devolve', async () => {
    await definir(ANA, MAIS_ANTIGA);
    const ana = await h.signIn(ANA);
    const res = await h.post('/api/me/novidades/vista', { ate: SEGUNDA }, ana);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ novidadesVista: SEGUNDA });
    expect((await h.get('/api/me', ana)).body.novidadesVista).toBe(SEGUNDA);
  });

  it('nunca volta: id mais antigo fica como estava', async () => {
    await definir(ANA, ULTIMA_NOVIDADE);
    const ana = await h.signIn(ANA);
    const res = await h.post('/api/me/novidades/vista', { ate: MAIS_ANTIGA }, ana);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ novidadesVista: ULTIMA_NOVIDADE });
    expect(await vistaDe(ANA)).toBe(ULTIMA_NOVIDADE);
  });

  it('id que saiu do arquivo conta como tudo visto: qualquer id existente vale', async () => {
    await definir(ANA, 'saiu-do-arquivo');
    const ana = await h.signIn(ANA);
    expect((await h.get('/api/me', ana)).body.novidadesVista).toBe('saiu-do-arquivo');
    const res = await h.post('/api/me/novidades/vista', { ate: MAIS_ANTIGA }, ana);
    expect(res.body).toEqual({ novidadesVista: MAIS_ANTIGA });
  });

  it.each([[{ ate: 'nao-existe' }], [{ ate: 7 }], [{}], [{ ate: null }]])(
    'pedido inválido %j: 400 e nada muda',
    async (body) => {
      await definir(ANA, MAIS_ANTIGA);
      const ana = await h.signIn(ANA);
      const res = await h.post('/api/me/novidades/vista', body, ana);
      expect(res.status).toBe(400);
      expect(await vistaDe(ANA)).toBe(MAIS_ANTIGA);
    },
  );

  it('vale para o cargo do Acompanhamento (fora do comercial)', async () => {
    await definir(DUDA, MAIS_ANTIGA);
    const duda = await h.signIn(DUDA);
    const res = await h.post('/api/me/novidades/vista', { ate: ULTIMA_NOVIDADE }, duda);
    expect(res.status).toBe(200);
    expect(await vistaDe(DUDA)).toBe(ULTIMA_NOVIDADE);
  });

  it('sem sessão: 401', async () => {
    const res = await h.post('/api/me/novidades/vista', { ate: ULTIMA_NOVIDADE });
    expect(res.status).toBe(401);
  });

  it('só mexe na própria conta', async () => {
    await definir(ANA, MAIS_ANTIGA);
    await definir(DUDA, MAIS_ANTIGA);
    const ana = await h.signIn(ANA);
    await h.post('/api/me/novidades/vista', { ate: ULTIMA_NOVIDADE }, ana);
    expect(await vistaDe(DUDA)).toBe(MAIS_ANTIGA);
  });
});
