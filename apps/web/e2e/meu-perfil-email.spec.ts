import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { CAIXA_URL, E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-53: trocar o e-mail no Meu perfil com o código enviado ao endereço novo (caixa falsa).
const owner = ownerSql(E2E_DB);
const EMAIL = 'ronaldo@npac.com.br';
const NOVO = 'ronaldo.novo@exemplo.test';
type Mensagem = { to: string[]; subject: string; text: string };
const caixa = async (): Promise<Mensagem[]> => (await fetch(CAIXA_URL)).json();

async function codigo(para: string): Promise<string> {
  let c = '';
  await expect
    .poll(async () => {
      const m = (await caixa()).filter((x) => x.to.includes(para)).at(-1);
      c = /\b(\d{6})\b/.exec(m?.text ?? '')?.[1] ?? '';
      return c;
    })
    .not.toBe('');
  return c;
}

async function abrir(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('ronaldo');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/conta/perfil');
  await page.getByRole('button', { name: 'Trocar e-mail' }).click();
  return page.getByRole('dialog');
}

test.beforeEach(async () => {
  await owner`truncate rate_limit, verification`;
  await owner`update "user" set email = ${EMAIL} where username = 'ronaldo'`;
  await fetch(CAIXA_URL, { method: 'DELETE' });
});
test.afterAll(async () => {
  await owner`update "user" set email = ${EMAIL} where username = 'ronaldo'`;
  await closeTestConnections();
});

test('troca o e-mail com o código do endereço novo', async ({ page }) => {
  // Relógio parado: a contagem do "Reenviar" fica no valor inicial.
  await page.clock.install();
  const janela = await abrir(page);
  await expect(janela.getByText(`Hoje: ${EMAIL}`)).toBeVisible();
  await janela.getByLabel('Novo e-mail').fill(NOVO);
  await janela.getByRole('button', { name: 'Enviar código' }).click();
  await expect(janela.getByRole('heading', { name: 'Confirme o novo e-mail' })).toBeVisible();
  // Contagem em m:ss: começa em 1:00 (nunca "0:60").
  await expect(janela.getByText(/Reenviar em 1:00$/)).toBeVisible();
  await janela.getByLabel('Código de 6 dígitos').fill(await codigo(NOVO));
  await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText(NOVO)).toBeVisible();
  const [u] = await owner<{ email: string }[]>`select email from "user" where username = 'ronaldo'`;
  expect(u?.email).toBe(NOVO);
});

test('código errado mostra o erro e não troca', async ({ page }) => {
  const janela = await abrir(page);
  await janela.getByLabel('Novo e-mail').fill(NOVO);
  await janela.getByRole('button', { name: 'Enviar código' }).click();
  const certo = await codigo(NOVO);
  const errado = String((Number(certo) + 1) % 1_000_000).padStart(6, '0');
  await janela.getByLabel('Código de 6 dígitos').fill(errado);
  await expect(janela.getByText('Código errado. Confira e tente de novo.')).toBeVisible();
  const [u] = await owner<{ email: string }[]>`select email from "user" where username = 'ronaldo'`;
  expect(u?.email).toBe(EMAIL);
});

test('e-mail de outra pessoa: em uso, sem código', async ({ page }) => {
  const janela = await abrir(page);
  await janela.getByLabel('Novo e-mail').fill('igor@npac.com.br');
  await janela.getByRole('button', { name: 'Enviar código' }).click();
  await expect(janela.getByText('Esse e-mail já está em uso.')).toBeVisible();
  await expect(janela.getByRole('heading', { name: 'Trocar e-mail' })).toBeVisible();
});
