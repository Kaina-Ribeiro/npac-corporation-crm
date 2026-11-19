import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-53: foto do perfil, recortada em círculo no navegador (256 px) e enviada à API.
const owner = ownerSql(E2E_DB);
const EMAIL = 'ronaldo@npac.com.br';

/** PNG RGB de `lado` px com duas cores (metade de cima e de baixo): o recorte muda o resultado. */
function png(lado = 400): Buffer {
  const linhas: Buffer[] = [];
  for (let y = 0; y < lado; y++) {
    const cor = y < lado / 2 ? [200, 160, 90] : [40, 60, 90];
    const linha = Buffer.alloc(1 + lado * 3);
    for (let x = 0; x < lado; x++) linha.set(cor, 1 + x * 3);
    linhas.push(linha);
  }
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.from(tipo, 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('ronaldo');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/conta/perfil');
}
const escolher = (page: Page, buffer: Buffer, name = 'foto.png') =>
  page.getByLabel('Escolher foto').setInputFiles({ name, mimeType: 'image/png', buffer });
const fotoSalva = async () =>
  (
    await owner<{ bytes: Buffer; mime: string }[]>`
      select bytes, mime from user_photos where user_id = (select id from "user" where email = ${EMAIL})`
  )[0];

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterEach(async () => {
  await owner`delete from user_photos where user_id = (select id from "user" where email = ${EMAIL})`;
  await owner`update "user" set image = null where email = ${EMAIL}`;
});
test.afterAll(async () => closeTestConnections());

test('envia, recorta e a foto aparece na sidebar', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Adicionar foto' }).first().click();
  await escolher(page, png());
  const janela = page.getByRole('dialog', { name: 'Ajustar foto' });
  await expect(janela).toBeVisible();
  await janela.getByRole('button', { name: 'Salvar foto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
  await expect(janela).toBeHidden();
  const salva = await fotoSalva();
  expect(['image/webp', 'image/jpeg']).toContain(salva?.mime);
  expect(salva!.bytes.length).toBeLessThan(100 * 1024);
  await expect(page.locator('#app-sidebar img[src*="/photo?v="]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible();
});

test('as setas do teclado mudam o recorte', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Adicionar foto' }).first().click();
  await escolher(page, png());
  const janela = page.getByRole('dialog', { name: 'Ajustar foto' });
  await janela.getByRole('button', { name: 'Aumentar zoom' }).click();
  await janela.getByRole('button', { name: 'Salvar foto' }).click();
  await expect(janela).toBeHidden();
  const antes = (await fotoSalva())!.bytes;
  await page.getByRole('button', { name: 'Trocar foto' }).first().click();
  await escolher(page, png());
  await janela.getByRole('button', { name: 'Aumentar zoom' }).click();
  const area = janela.getByRole('group', { name: /Posição da foto/ });
  await area.focus();
  for (let i = 0; i < 8; i++) await area.press('ArrowUp');
  await janela.getByRole('button', { name: 'Salvar foto' }).click();
  await expect(janela).toBeHidden();
  expect(Buffer.compare(antes, (await fotoSalva())!.bytes)).not.toBe(0);
});

test('arquivo que não é imagem mostra o erro e não envia', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Adicionar foto' }).first().click();
  await escolher(page, Buffer.from('não sou uma foto'), 'foto.jpg');
  await expect(
    page.getByText('Não deu para abrir essa imagem. Use JPG, PNG ou WebP.'),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Ajustar foto' })).toBeHidden();
  expect(await fotoSalva()).toBeUndefined();
});

test('remover volta à inicial e o botão vira Adicionar foto', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Adicionar foto' }).first().click();
  await escolher(page, png());
  await page
    .getByRole('dialog', { name: 'Ajustar foto' })
    .getByRole('button', { name: 'Salvar foto' })
    .click();
  await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible();
  await page.getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('button', { name: 'Adicionar foto' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover' })).toHaveCount(0);
  await expect(page.locator('#app-sidebar img[src*="/photo?v="]')).toHaveCount(0);
  expect(await fotoSalva()).toBeUndefined();
});
