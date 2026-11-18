import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appSql, closeTestConnections, ownerSql } from '../src/testing.js';

// NPAC-53: foto do perfil em `user_photos` (sem RLS, como `user`), só JPEG/PNG/WebP até 200 KB.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const app = appSql(DB);
const ID = 'perfil-teste';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function pgError(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string; code?: string };
  }
  throw new Error('esperava erro');
}

const foto = (mime = 'image/png', size = png.length) =>
  app`insert into user_photos (user_id, bytes, mime, size) values (${ID}, ${png}, ${mime}, ${size})`;

beforeEach(async () => {
  await owner`delete from "user" where id = ${ID}`;
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close)
    values (${ID}, 'Perfil Teste', 'perfil.teste@npac.test', 'HEAD', false, false)`;
});
afterAll(async () => {
  await owner`delete from "user" where id = ${ID}`;
  await closeTestConnections();
});

describe('user_photos', () => {
  it('npac_app grava, lê, troca e apaga a foto', async () => {
    await foto();
    const [row] = await app<{ mime: string; bytes: Buffer }[]>`
      select mime, bytes from user_photos where user_id = ${ID}`;
    expect(row?.mime).toBe('image/png');
    expect(Buffer.from(row!.bytes).equals(png)).toBe(true);
    await app`update user_photos set mime = 'image/webp' where user_id = ${ID}`;
    await app`delete from user_photos where user_id = ${ID}`;
    expect(await app`select 1 from user_photos where user_id = ${ID}`).toHaveLength(0);
  });

  it('recusa tipo fora de JPEG, PNG e WebP', async () => {
    expect((await pgError(foto('image/svg+xml'))).code).toBe('23514');
  });

  it('recusa mais de 200 KB', async () => {
    expect((await pgError(foto('image/png', 204801))).code).toBe('23514');
  });

  it('apagar o usuário apaga a foto', async () => {
    await foto();
    await owner`delete from "user" where id = ${ID}`;
    expect(await owner`select 1 from user_photos where user_id = ${ID}`).toHaveLength(0);
  });
});
