import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const abrirFunil = async (page: Page) => {
  await lateral(page).getByRole('link', { name: 'Onboarding', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Onboarding', level: 1 })).toBeVisible();
};
const coluna = (page: Page, nome: string) =>
  page.getByRole('button', { name: new RegExp(`^${nome}`) });
const linha = (page: Page, nome: string) =>
  page.getByRole('listitem').filter({ hasText: nome }).filter({ visible: true });

async function criar(page: Page, nome: string, mentoria = 'RDV') {
  const r = await page.request.post('/api/mentoria/inscricoes', {
    data: { tipo: 'INDIVIDUAL', mentoria, pessoas: [{ nome }] },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string };
}

async function concluirPelaLinha(page: Page, etapa: string, nome: string) {
  await coluna(page, etapa).click();
  await linha(page, nome).getByRole('button', { name: 'Marcar enviada' }).click();
  await linha(page, nome).getByRole('button', { name: 'Marcar concluída' }).click();
  await expect(linha(page, nome)).toHaveCount(0);
}

test('Operação conduz da boas-vindas até a Caixa pelo funil', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const nome = 'Mentorado Fictício 60';
  const { id } = await criar(page, nome);
  await abrirFunil(page);

  await concluirPelaLinha(page, 'Boas-vindas', nome);
  await concluirPelaLinha(page, 'Grupos de WhatsApp', nome);
  await concluirPelaLinha(page, 'Aquecimento da Riqueza', nome);
  await concluirPelaLinha(page, 'PME de aquecimento', nome);

  await coluna(page, 'Caixa da Verdadeira Riqueza').click();
  await linha(page, nome).getByRole('link', { name: 'Registrar envio' }).click();
  await page.waitForURL(new RegExp(`/acompanhamento/ficha/${id}`));

  // A Caixa pede o formulário preenchido, que fica no passo de boas-vindas.
  await page.getByRole('button', { name: /^Boas-vindas/ }).click();
  await page.getByRole('switch', { name: 'Formulário preenchido' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();

  await page.getByRole('button', { name: /^Caixa da Verdadeira Riqueza/ }).click();
  await page.getByLabel('Data de envio').fill('2026-11-01');
  await page.getByLabel('Rastreio').fill('BR123FI');
  await page.getByRole('button', { name: 'Registrar envio' }).click();
  await expect(page.getByLabel('Data de recebimento')).toBeVisible();
  await page.getByLabel('Data de recebimento').fill('2026-11-05');
  await page.getByRole('button', { name: 'Marcar entregue' }).click();

  await expect
    .poll(
      async () =>
        (
          await owner<{ status: string }[]>`
          select status from mentoria_onboarding_etapas
          where inscricao_id = ${id} and etapa = 'CAIXA'`
        )[0]?.status,
    )
    .toBe('CONCLUIDA');

  // No computador a lista de IDRs fica ao lado do funil; as abas são só do celular.
  await abrirFunil(page);
  await expect(page.getByRole('link', { name: new RegExp(nome) }).first()).toBeVisible();
});

test('dias parado aparecem por pessoa', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await abrirFunil(page);
  await coluna(page, 'Boas-vindas').click();
  await expect(linha(page, 'Mentorada Fictícia 11')).toContainText('Parado há 5 dias');
});

test('botão Dispensar só existe em 2M e 6M', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const m2 = 'Mentorado Fictício 61';
  const rdv = 'Mentorado Fictício 62';
  await criar(page, m2, '2M');
  await criar(page, rdv);
  await abrirFunil(page);
  await coluna(page, 'Boas-vindas').click();
  await expect(linha(page, m2).getByRole('button', { name: 'Dispensar' })).toBeVisible();
  await expect(linha(page, rdv).getByRole('button', { name: 'Dispensar' })).toHaveCount(0);

  await linha(page, m2).getByRole('button', { name: 'Dispensar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dispensar' }).click();
  await expect(linha(page, m2)).toHaveCount(0);
});

test('Manu não vê o funil', async ({ page }) => {
  await entrar(page, 'manu');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await lateral(page).getByRole('link', { name: 'Onboarding', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/onboarding/);
  await expect(page.getByText('Esta aba é da Operação e do Acompanhamento')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Funil das etapas' })).toHaveCount(0);
  const r = await page.request.post('/api/mentoria/onboarding/painel', { data: {} });
  expect(r.status()).toBe(404);
});

test('importado mostra as etapas como anteriores ao sistema', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.goto('/acompanhamento/ficha/00000000-0000-4000-8000-000000000003');
  await expect(page.getByText('Entrou antes do sistema')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar enviada' })).toHaveCount(0);
});
