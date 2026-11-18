import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pngComTexto } from './media-fixtures.js';
import {
  api,
  auditCount,
  closeTestApp,
  createTestApp,
  deactivate,
  ORIGIN,
  owner,
  resetAuthState,
  type Cookie,
} from './helpers.js';

// NPAC-53: foto do perfil. Cada um troca a própria; quem está logado vê a de todos.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
const ANA = 'ana@npac.com.br';
const IGOR = 'igor@npac.com.br';
const CARLA = 'carla@npac.com.br';

const idOf = async (email: string) =>
  (await owner<{ id: string }[]>`select id from "user" where email = ${email}`)[0]!.id;
const enviar = (cookie: Cookie, dados: Buffer, nome = 'foto.png') =>
  request(app.getHttpServer())
    .put('/api/me/photo')
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .attach('foto', dados, { filename: nome, contentType: 'image/png' });
const baixar = (path: string, cookie?: Cookie) => {
  const r = request(app.getHttpServer()).get(path).set('Origin', ORIGIN).buffer(true);
  return cookie ? r.set('Cookie', cookie) : r;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`delete from user_photos`;
  await owner`update "user" set image = null`;
});
afterAll(async () => {
  await owner`delete from user_photos`;
  await owner`update "user" set image = null`;
  await resetAuthState();
  await closeTestApp(app);
});

describe('foto do perfil', () => {
  it('envia PNG, devolve a URL com a versão e serve os bytes sem metadados', async () => {
    const ana = await h.signIn(ANA);
    const res = await enviar(ana, pngComTexto());
    expect(res.status).toBe(200);
    const id = await idOf(ANA);
    expect(res.body.photo).toMatch(new RegExp(`^/api/users/${id}/photo\\?v=[a-z0-9]+$`));
    const foto = await baixar(res.body.photo, await h.signIn(IGOR));
    expect(foto.status).toBe(200);
    expect(foto.headers['content-type']).toBe('image/png');
    expect(foto.headers['x-content-type-options']).toBe('nosniff');
    expect(foto.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect((foto.body as Buffer).includes(Buffer.from('tEXt'))).toBe(false);
  });

  it('recusa o que não é JPEG, PNG ou WebP', async () => {
    const ana = await h.signIn(ANA);
    const svg = await enviar(
      ana,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'a.svg',
    );
    expect(svg.status).toBe(400);
    expect(svg.body.message).toBe('Não deu para abrir essa imagem. Use JPG, PNG ou WebP.');
    expect((await enviar(ana, Buffer.from('texto qualquer'), 'a.jpg')).status).toBe(400);
  });

  it('recusa acima de 200 KB', async () => {
    const ana = await h.signIn(ANA);
    const grande = Buffer.concat([pngComTexto(), Buffer.alloc(200 * 1024)]);
    expect((await enviar(ana, grande)).status).toBe(413);
  });

  it('sem sessão: 401 para enviar e para ver', async () => {
    expect((await enviar('', pngComTexto())).status).toBe(401);
    expect((await baixar(`/api/users/${await idOf(ANA)}/photo`)).status).toBe(401);
  });

  it('quem não tem foto: 404', async () => {
    const igor = await h.signIn(IGOR);
    expect((await baixar(`/api/users/${await idOf(ANA)}/photo`, igor)).status).toBe(404);
  });

  it('as outras rotas seguem sem cache', async () => {
    const ana = await h.signIn(ANA);
    expect((await h.get('/api/me', ana)).headers['cache-control']).toBe('no-store');
  });

  it('cada envio muda a versão', async () => {
    const ana = await h.signIn(ANA);
    const a = (await enviar(ana, pngComTexto())).body.photo as string;
    await new Promise((r) => setTimeout(r, 5));
    const b = (await enviar(ana, pngComTexto())).body.photo as string;
    expect(a).not.toBe(b);
  });

  it('remover apaga a foto e a versão', async () => {
    const ana = await h.signIn(ANA);
    await enviar(ana, pngComTexto());
    const res = await h.del('/api/me/photo', {}, ana);
    expect(res.status).toBe(204);
    const id = await idOf(ANA);
    expect((await baixar(`/api/users/${id}/photo`, ana)).status).toBe(404);
    const [u] = await owner<{ image: string | null }[]>`select image from "user" where id = ${id}`;
    expect(u?.image).toBeNull();
  });

  it('foto de quem foi desativado continua aparecendo para a equipe', async () => {
    const res = await enviar(await h.signIn(IGOR), pngComTexto());
    await deactivate(IGOR);
    expect((await baixar(res.body.photo, await h.signIn(ANA))).status).toBe(200);
  });

  it('o cargo Acompanhamento também troca e vê fotos', async () => {
    const carla = await h.signIn(CARLA);
    expect((await enviar(carla, pngComTexto())).status).toBe(200);
    expect((await h.get('/api/team/photos', carla)).status).toBe(200);
  });

  it('o mapa da equipe lista só quem tem foto, por id e por nome único', async () => {
    const ana = await h.signIn(ANA);
    const url = (await enviar(ana, pngComTexto())).body.photo as string;
    const [u] = await owner<{ name: string }[]>`select name from "user" where email = ${ANA}`;
    const res = await h.get('/api/team/photos', await h.signIn(IGOR));
    expect(res.body).toEqual({ photos: { [await idOf(ANA)]: url }, names: { [u!.name]: url } });
  });

  it('nome repetido na equipe não entra no mapa por nome', async () => {
    const ana = await h.signIn(ANA);
    await enviar(ana, pngComTexto());
    const [u] = await owner<{ name: string }[]>`select name from "user" where email = ${ANA}`;
    const [igor] = await owner<{ name: string }[]>`select name from "user" where email = ${IGOR}`;
    await owner`update "user" set name = ${u!.name} where email = ${IGOR}`;
    try {
      const res = await h.get('/api/team/photos', ana);
      expect(res.body.names).toEqual({});
    } finally {
      await owner`update "user" set name = ${igor!.name} where email = ${IGOR}`;
    }
  });

  it('audita sem nome, e-mail ou foto', async () => {
    const ana = await h.signIn(ANA);
    await enviar(ana, pngComTexto());
    await h.del('/api/me/photo', {}, ana);
    expect(await auditCount('user.photo_set')).toBe(1);
    expect(await auditCount('user.photo_removed')).toBe(1);
    const rows = await owner<{ data: unknown }[]>`
      select data from audit_log where action like 'user.photo%'`;
    expect(JSON.stringify(rows)).not.toMatch(/@|Ana/);
  });
});
