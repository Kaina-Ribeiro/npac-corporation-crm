import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rodarWorkerDeMidia } from '../src/mentoria/media-worker.js';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';
import { jpegComExif } from './media-fixtures.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;
let ficha: string;
const MB = 1024 * 1024;
const dir = () => process.env.MEDIA_DIR!;

const enviar = (
  path: string,
  arquivo: Buffer,
  nome: string,
  cookie: string,
  tipo = 'application/octet-stream',
) =>
  request(app.getHttpServer())
    .post(path)
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .attach('arquivo', arquivo, { filename: nome, contentType: tipo });
const pdf = (bytes: number) =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes - 9, 0x20)]);

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
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, 'Mentorado Fictício 08', 'mentorado ficticio 08')`;
});

describe('mídia', () => {
  it('arquivo de 20 MB é aceito; 20 MB + 1 byte recebe 413 antes de ler o corpo inteiro', async () => {
    const ok = await enviar(
      `/api/mentoria/ficha-antes/${ficha}/midia`,
      pdf(20 * MB),
      'grande.pdf',
      carla,
    );
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ tipo: 'PDF', tamanhoBytes: 20 * MB });
    const grande = await enviar(
      `/api/mentoria/ficha-antes/${ficha}/midia`,
      pdf(20 * MB + 1),
      'grande.pdf',
      carla,
    );
    expect(grande.status).toBe(413);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_midia`;
    expect(n?.n).toBe(1);
  });

  it('.jpg com conteúdo HTML é recusado (400)', async () => {
    const r = await enviar(
      `/api/mentoria/ficha-antes/${ficha}/midia`,
      Buffer.from('<html><script>x</script></html>'),
      'foto.jpg',
      carla,
      'image/jpeg',
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Envie foto (JPEG, PNG ou WEBP), vídeo (MP4 ou MOV) ou PDF');
  });

  it('SVG e HTML são recusados mesmo com extensão de imagem', async () => {
    for (const [conteudo, nome] of [
      ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'a.png'],
      ['<!doctype html><p>x', 'b.webp'],
    ] as const) {
      const r = await enviar(
        `/api/mentoria/ficha-antes/${ficha}/midia`,
        Buffer.from(conteudo),
        nome,
        carla,
        'image/png',
      );
      expect(r.status).toBe(400);
    }
  });

  it('imagem gravada não traz EXIF nem GPS; nome no volume é UUID e o nome original não aparece', async () => {
    const r = await enviar(
      `/api/mentoria/ficha-depois/${ficha}/midia`,
      jpegComExif(),
      'Pessoa-Ficticia-praia.jpg',
      carla,
      'image/jpeg',
    );
    expect(r.status).toBe(201);
    const [m] = await owner<
      { chave_objeto: string; mime: string }[]
    >`select chave_objeto, mime from mentoria_midia`;
    expect(m?.chave_objeto).toMatch(/^[0-9a-f-]{36}$/);
    expect(m?.mime).toBe('image/jpeg');
    const arquivos = readdirSync(dir());
    expect(arquivos).toContain(m!.chave_objeto);
    expect(arquivos.join(' ')).not.toContain('Pessoa');
    const gravado = readFileSync(join(dir(), m!.chave_objeto)).toString('binary');
    expect(gravado).not.toContain('Exif');
    expect(gravado).not.toContain('GPS');
    const dump = JSON.stringify(await owner`select * from mentoria_midia`);
    expect(dump).not.toContain('Pessoa');
  });

  it('GET de PDF vem com attachment e nosniff', async () => {
    const up = await enviar(`/api/mentoria/ficha-antes/${ficha}/midia`, pdf(1000), 'x.pdf', carla);
    const r = await h.get(`/api/mentoria/midia/${up.body.id}`, carla);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['content-disposition']).toMatch(/^attachment/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toContain('no-store');
  });

  it('DELETE de mídia responde 204 sem confirmação e o worker apaga o arquivo', async () => {
    const up = await enviar(`/api/mentoria/ficha-antes/${ficha}/midia`, pdf(1000), 'x.pdf', carla);
    const [m] = await owner<
      { chave_objeto: string }[]
    >`select chave_objeto from mentoria_midia where id = ${up.body.id}`;
    expect(existsSync(join(dir(), m!.chave_objeto))).toBe(true);
    const r = await h.del(`/api/mentoria/midia/${up.body.id}`, {}, carla);
    expect(r.status).toBe(204);
    expect((await h.get(`/api/mentoria/midia/${up.body.id}`, carla)).status).toBe(404);
    await rodarWorkerDeMidia(app);
    expect(existsSync(join(dir(), m!.chave_objeto))).toBe(false);
  });

  it('worker roda sem sessão de usuário: apaga o arquivo e preenche removido_em', async () => {
    const up = await enviar(`/api/mentoria/ficha-antes/${ficha}/midia`, pdf(1000), 'x.pdf', carla);
    await h.post(`/api/mentoria/registros/ficha/${ficha}/excluir`, { version: 1 }, carla);
    const [f] = await owner<
      { chave_objeto: string; removido_em: Date | null }[]
    >`select chave_objeto, removido_em from mentoria_midia_exclusao`;
    expect(f?.removido_em).toBeNull();
    expect(up.status).toBe(201);
    expect(await rodarWorkerDeMidia(app)).toBe(1);
    const [g] = await owner<
      { removido_em: Date | null }[]
    >`select removido_em from mentoria_midia_exclusao`;
    expect(g?.removido_em).not.toBeNull();
    expect(existsSync(join(dir(), f!.chave_objeto))).toBe(false);
  });

  it('upload, download e exclusão geram audit sem nome', async () => {
    const up = await enviar(
      `/api/mentoria/ficha-antes/${ficha}/midia`,
      pdf(1000),
      'Pessoa-Ficticia.pdf',
      carla,
    );
    await h.get(`/api/mentoria/midia/${up.body.id}`, carla);
    await h.del(`/api/mentoria/midia/${up.body.id}`, {}, carla);
    const rows = await owner<{ action: string; data: unknown }[]>`
      select action, data from audit_log where action like 'mentoria.media.%' order by id`;
    expect(rows.map((r) => r.action)).toEqual([
      'mentoria.media.upload',
      'mentoria.media.download',
      'mentoria.media.delete',
    ]);
    expect(JSON.stringify(rows)).not.toContain('Pessoa');
  });

  it('link de vídeo só aceita https da allowlist', async () => {
    const ok = await h.post(
      `/api/mentoria/conquista/${ficha}/midia/link`,
      { urlVideo: 'https://youtu.be/ficticio' },
      carla,
    );
    expect(ok.status).toBe(404); // a conquista não existe: o dono precisa existir
    const ok2 = await h.post(
      `/api/mentoria/ficha-antes/${ficha}/midia/link`,
      { urlVideo: 'https://youtu.be/ficticio' },
      carla,
    );
    expect(ok2.status).toBe(201);
    expect(ok2.body).toMatchObject({ tipo: 'LINK_VIDEO' });
    for (const urlVideo of ['javascript:alert(1)', 'http://youtu.be/x', 'https://evil.test/x'])
      expect(
        (await h.post(`/api/mentoria/ficha-antes/${ficha}/midia/link`, { urlVideo }, carla)).status,
      ).toBe(400);
  });

  it('dono inexistente ou tipo de dono desconhecido → 404', async () => {
    expect(
      (await enviar(`/api/mentoria/ficha-antes/${randomUUID()}/midia`, pdf(100), 'x.pdf', carla))
        .status,
    ).toBe(404);
    expect(
      (await enviar(`/api/mentoria/lead/${ficha}/midia`, pdf(100), 'x.pdf', carla)).status,
    ).toBe(404);
  });

  it('SDR recebe 404 em qualquer rota de mídia', async () => {
    const up = await enviar(`/api/mentoria/ficha-antes/${ficha}/midia`, pdf(100), 'x.pdf', carla);
    const ale = await h.signIn('ale@npac.com.br');
    expect(
      (await enviar(`/api/mentoria/ficha-antes/${ficha}/midia`, pdf(100), 'x.pdf', ale)).status,
    ).toBe(404);
    expect((await h.get(`/api/mentoria/midia/${up.body.id}`, ale)).status).toBe(404);
    expect((await h.del(`/api/mentoria/midia/${up.body.id}`, {}, ale)).status).toBe(404);
    expect((await h.get('/api/mentoria/backup/medidor', ale)).status).toBe(404);
  });

  it('medidor (soma de tamanho_bytes) bate com a soma dos arquivos gravados', async () => {
    await enviar(`/api/mentoria/ficha-antes/${ficha}/midia`, pdf(1000), 'a.pdf', carla);
    await enviar(`/api/mentoria/ficha-depois/${ficha}/midia`, pdf(2500), 'b.pdf', carla);
    await h.post(
      `/api/mentoria/ficha-antes/${ficha}/midia/link`,
      { urlVideo: 'https://vimeo.com/1' },
      carla,
    );
    const r = await h.get('/api/mentoria/backup/medidor', carla);
    expect(r.body).toEqual({ bytes: 3500, arquivos: 2 });
    const chaves = await owner<
      { chave_objeto: string }[]
    >`select chave_objeto from mentoria_midia where chave_objeto is not null`;
    const soma = chaves.reduce((s, c) => s + readFileSync(join(dir(), c.chave_objeto)).length, 0);
    expect(soma).toBe(3500);
  });
});
