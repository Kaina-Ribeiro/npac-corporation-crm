import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * NPAC-56, Parte 2: o cargo Envios (a Maria, do seed) entra direto na aba Envios físicos, vê só ela no
 * menu, marca a Caixa como enviada (com rastreio) e entregue; a duda vê a etapa Caixa concluída na
 * ficha. A Maria recebe 404 na ficha. A gestão cria um kit pelo "Novo envio".
 */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 768, 1024, 1440] as const;
const NOME = 'Mentorado Envio Teste';
let inscricao = '';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  if (inscricao) await owner`delete from mentoria_inscricoes where id = ${inscricao}`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function shots(page: Page, file: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${file} ${w}px sem rolagem lateral`,
    ).toBe(true);
    await page.screenshot({ path: `test-results/${file}-${w}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

const cartao = (page: Page, tipo: string) =>
  page.getByRole('article', { name: `${tipo}: ${NOME}` });

test('a duda cadastra o mentorado com endereço e a Caixa entra em "A enviar"', async ({ page }) => {
  await entrar(page, 'duda');
  const r = await page.request.post('/api/mentoria/inscricoes', {
    data: { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome: NOME }] },
  });
  expect(r.status(), await r.text()).toBe(201);
  const ficha = (await r.json()) as {
    id: string;
    onboarding: { id: string; etapa: string; version: number }[];
  };
  inscricao = ficha.id;
  const end = await page.request.put(`/api/mentoria/inscricoes/${inscricao}/endereco`, {
    data: { version: 0, endereco: 'Rua das Acácias, 120 · São Paulo/SP', cep: '01415-000' },
  });
  expect(end.status(), await end.text()).toBe(200);
  const bv = ficha.onboarding.find((e) => e.etapa === 'BOAS_VINDAS')!;
  const f = await page.request.patch(`/api/mentoria/onboarding/${bv.id}`, {
    data: { version: bv.version, formularioPreenchido: true },
  });
  expect(f.status(), await f.text()).toBe(200);

  await page.goto('/acompanhamento/envios');
  const c = cartao(page, 'Caixa da Verdadeira Riqueza');
  await expect(c.getByText('CEP 01415-000')).toBeVisible();
  await expect(c.getByRole('link', { name: 'Abrir ficha' })).toBeVisible();
});

test('a Maria entra na aba, envia e entrega a Caixa; a ficha é 404 para ela', async ({ page }) => {
  await entrar(page, 'maria');
  await expect(page).toHaveURL(/\/acompanhamento\/envios$/);
  await expect(page.getByRole('heading', { name: 'Envios físicos', level: 1 })).toBeVisible();
  // Só a aba dela: nada da gestão no menu nem na página.
  await expect(page.getByRole('link', { name: 'Fila do dia' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo envio' })).toHaveCount(0);

  const c = cartao(page, 'Caixa da Verdadeira Riqueza');
  await expect(c.getByRole('link', { name: 'Abrir ficha' })).toHaveCount(0);
  await shots(page, 'envios-maria');
  await c.getByRole('button', { name: 'Marcar enviado' }).click();
  await c.getByLabel('Rastreio (opcional)').fill('BR123456789BR');
  await c.getByRole('button', { name: 'Marcar enviado' }).click();

  const transito = page.getByRole('region', { name: 'Em trânsito' });
  const linha = transito.getByRole('listitem').filter({ hasText: NOME });
  await expect(linha).toContainText('BR123456789BR');
  await expect(page.getByText('Salvo')).toBeVisible();
  await linha.getByRole('button', { name: 'Marcar entregue' }).click();
  await linha.getByRole('button', { name: 'Marcar entregue' }).click();
  await expect(
    page.getByRole('region', { name: 'Entregues' }).getByText(NOME, { exact: true }),
  ).toBeVisible();
  await expect(linha).toHaveCount(0);

  const ficha = await page.goto(`/acompanhamento/ficha/${inscricao}`);
  expect(ficha?.status()).toBe(404);
});

test('a duda vê a etapa Caixa concluída e cria um kit pelo "Novo envio"', async ({ page }) => {
  await entrar(page, 'duda');
  await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
  await expect(
    page.getByRole('button', { name: /Caixa da Verdadeira Riqueza\s*Concluída/ }),
  ).toBeVisible();

  await page.goto('/acompanhamento/envios');
  await page.getByRole('button', { name: 'Novo envio' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo envio' });
  await dlg.getByRole('searchbox').fill(NOME);
  await dlg.getByRole('button', { name: new RegExp(NOME) }).click();
  await dlg.getByLabel('O que enviar').selectOption('KIT');
  await dlg.getByRole('button', { name: 'Criar envio' }).click();
  await expect(dlg).toBeHidden();
  await expect(cartao(page, 'Kit')).toBeVisible();
  await shots(page, 'envios-duda');
});
