import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
const PESSOA = '44444444-4444-4444-8444-444444444444';

test.beforeEach(async () => {
  await owner`truncate rate_limit, audit_log`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`insert into mentoria_rdv_pessoas (id, nome, nome_norm)
    values (${PESSOA}, 'Casal Fictício 40', 'casal ficticio 40')`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function entrar(page: Page, rota: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  await page.goto(rota);
}
const salvo = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();

test('Novo mentorado cria a pessoa; importar .json abre a prévia', async ({ page }) => {
  await entrar(page, '/acompanhamento/rdv');
  await expect(page.getByRole('heading', { name: 'Linha do tempo RDV' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Casal Fictício 40/ })).toBeVisible();
  await page.getByRole('button', { name: 'Importar .json' }).click();
  await expect(page.getByRole('dialog', { name: /Importar/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Novo mentorado' }).click();
  const d = page.getByRole('dialog', { name: 'Novo mentorado' });
  await d.getByRole('button', { name: 'Criar' }).click();
  await expect(d.getByText('Informe o nome')).toBeVisible();
  await d.getByLabel('Nome do mentorado ou casal').fill('Casal Fictício 41');
  await d.getByRole('button', { name: 'Criar' }).click();
  await page.waitForURL(/\/acompanhamento\/rdv\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Nome do mentorado' })).toHaveValue(
    'Casal Fictício 41',
  );
});

test('nome do cabeçalho salva ao sair do campo', async ({ page }) => {
  await entrar(page, `/acompanhamento/rdv/${PESSOA}`);
  const nome = page.getByRole('textbox', { name: 'Nome do mentorado' });
  await nome.fill('Casal Fictício 42');
  await nome.blur();
  await salvo(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nome do mentorado' })).toHaveValue(
    'Casal Fictício 42',
  );
});

test('diagnóstico não tem campo editável; colar mostra "atual → novo" e os rótulos que faltam', async ({
  page,
}) => {
  await entrar(page, `/acompanhamento/rdv/${PESSOA}`);
  const diag = page.getByRole('region', { name: 'Diagnóstico inicial' });
  await expect(diag.getByRole('textbox')).toHaveCount(0);
  await diag.getByRole('button', { name: 'Colar dados do diagnóstico' }).click();
  const d = page.getByRole('dialog', { name: 'Colar dados do diagnóstico' });
  await d.getByLabel('Texto do diagnóstico').fill('Idade: 41\nTrabalho: autônomo fictício');
  await d.getByRole('button', { name: 'Ver prévia' }).click();
  await expect(d.getByRole('row', { name: /Idade.*—.*41/ })).toBeVisible();
  await expect(d.getByText(/Ficam como estão: Situação conjugal/)).toBeVisible();
  // Prévia não grava.
  const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_diagnostico`;
  expect(n?.n).toBe(0);
  await d.getByRole('button', { name: 'Gravar diagnóstico' }).click();
  await expect(d).toHaveCount(0);
  await expect(diag.getByText('41')).toBeVisible();
  await expect(diag.getByText('autônomo fictício')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Diagnóstico inicial' }).getByText('autônomo fictício'),
  ).toBeVisible();
});

test('pasta não tem campo digitável; colar o link grava e abre em nova aba', async ({ page }) => {
  await entrar(page, `/acompanhamento/rdv/${PESSOA}`);
  const pasta = page.getByRole('region', { name: 'Link da pasta' });
  await expect(pasta.getByRole('textbox')).toHaveCount(0);
  await pasta.getByRole('button', { name: 'Colar link' }).click();
  const d = page.getByRole('dialog', { name: 'Colar link da pasta' });
  await d.getByLabel('Link da pasta').fill('https://exemplo.com/x');
  await d.getByRole('button', { name: 'Gravar link' }).click();
  await expect(d.getByText(/Link não aceito/)).toBeVisible();
  await d.getByLabel('Link da pasta').fill('https://drive.google.com/drive/folders/ficticia');
  await d.getByRole('button', { name: 'Gravar link' }).click();
  await expect(d).toHaveCount(0);
  const link = pasta.getByRole('link', { name: /drive\.google\.com/ });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/ficticia');
});

test('remover foto de perfil pede confirmação (D29)', async ({ page }) => {
  await entrar(page, `/acompanhamento/rdv/${PESSOA}`);
  const foto = join(tmpdir(), 'foto-ficticia-rdv.png');
  writeFileSync(
    foto,
    Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082',
      'hex',
    ),
  );
  await page.getByLabel('Adicionar foto').setInputFiles(foto);
  const remover = page.getByRole('button', { name: 'Remover foto de perfil' });
  await expect(remover).toBeVisible();
  await remover.click();
  const d = page.getByRole('dialog', { name: 'Remover a foto de perfil?' });
  await d.getByRole('button', { name: 'Cancelar' }).click();
  const conta = async () =>
    (await owner<{ n: number }[]>`select count(*)::int as n from mentoria_midia`)[0]?.n;
  expect(await conta()).toBe(1);
  await remover.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover foto' }).click();
  await expect(remover).toHaveCount(0);
  await expect.poll(conta).toBe(0);
});

test('remover mentorado do RDV pede confirmação; cancelar não grava', async ({ page }) => {
  await entrar(page, `/acompanhamento/rdv/${PESSOA}`);
  await page.getByRole('button', { name: 'Remover mentorado' }).click();
  const d = page.getByRole('dialog', { name: /Remover Casal Fictício 40/ });
  await d.getByRole('button', { name: 'Cancelar' }).click();
  const conta = async () =>
    (
      await owner<
        { n: number }[]
      >`select count(*)::int as n from mentoria_rdv_pessoas where id = ${PESSOA}`
    )[0]?.n;
  expect(await conta()).toBe(1);
  await page.getByRole('button', { name: 'Remover mentorado' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar exclusão' }).click();
  await page.waitForURL(/\/acompanhamento\/rdv$/);
  expect(await conta()).toBe(0);
});

test('Exportar PDF grava mentoria.print e a impressão esconde botões', async ({ page }) => {
  await entrar(page, `/acompanhamento/rdv/${PESSOA}`);
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect
    .poll(
      async () =>
        (
          await owner<
            { n: number }[]
          >`select count(*)::int as n from audit_log where action = 'mentoria.print'`
        )[0]?.n,
    )
    .toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Navegação lateral' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exportar PDF' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Colar link' })).toBeHidden();
  await expect(page.getByText('Casal Fictício 40').first()).toBeVisible();
});
