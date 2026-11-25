import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-75 (Duda, 24/11/2026, opção A): a tela Onboarding virou "Dashboard", com o bloco Engajamento no topo; o
// engajamento é marcado à mão na ficha (aside Inscrição, depois de Status) e o Dashboard soma. Operação só vê.
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOME = 'Mentorado Fictício Eng 75';
const CANCELADO = 'Mentorado Fictício Eng Cancelado';
let inscricao = '';
let cancelada = '';

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function nova(nome: string, status: string, variante: string | null) {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, mentoria_variante, status, inicio_jornada, termino_previsto)
     values ('INDIVIDUAL', '2M', $1, $2, ${HOJE} - 40, ${HOJE} + 325) returning id`,
    [variante, status],
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${nome.toLowerCase()})`;
  return i!.id;
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const grupo = (page: Page, nome: string) =>
  page.getByRole('group', { name: nome, exact: true }).filter({ visible: true });
const cartao = (page: Page, nome: string) =>
  page.getByRole('button', { name: new RegExp(`^${nome}`) }).filter({ visible: true });

test.beforeAll(async () => {
  inscricao = await nova(NOME, 'ATIVO', '2 encontros');
  cancelada = await nova(CANCELADO, 'CANCELADO', null);
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`update mentoria_inscricoes set engajamento = null where id = ${inscricao}`;
});
test.afterAll(async () => {
  await owner`delete from mentoria_inscricoes where id in (${inscricao}, ${cancelada})`;
  await closeTestConnections();
});

test('Admin marca o engajamento na ficha e o Dashboard soma', async ({ page }) => {
  await entrar(page, 'duda');
  await lateral(page).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Engajamento', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Onboarding', level: 2 })).toBeVisible();
  await expect(page).toHaveTitle(/^Dashboard/);

  // Começa sem marcação; cancelado fica fora do Total.
  await expect(grupo(page, 'Sem marcação').getByText(NOME)).toBeVisible();
  await expect(grupo(page, 'Sem marcação').getByText('Individual, 2M / 2 encontros')).toBeVisible();
  await expect(page.getByText(CANCELADO)).toHaveCount(0);
  const engajados = Number(await cartao(page, 'Engajados').locator('b').textContent());

  // O nome abre a ficha; o campo fica depois de Status.
  await grupo(page, 'Sem marcação')
    .getByRole('link', { name: new RegExp(NOME) })
    .click();
  await page.waitForURL(new RegExp(`/acompanhamento/ficha/${inscricao}`));
  const lado = page.getByRole('complementary', { name: 'Inscrição' });
  const campo = lado.getByLabel('Engajamento', { exact: true });
  await expect(campo).toHaveValue('');
  const rotulos = await lado.locator('.pr > span:first-child').allTextContents();
  expect(rotulos.indexOf('Engajamento')).toBe(rotulos.indexOf('Status') + 1);
  await campo.selectOption('ENGAJADO');
  await expect(page.getByText('Tudo salvo')).toBeVisible();
  await expect(page.locator('.fh-tags').getByText('Engajado', { exact: true })).toBeVisible();

  await lateral(page).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/onboarding/);
  await expect(grupo(page, 'Engajados').getByText(NOME)).toBeVisible();
  await expect(grupo(page, 'Sem marcação').getByText(NOME)).toHaveCount(0);
  await expect(cartao(page, 'Engajados').locator('b')).toHaveText(String(engajados + 1));
  await expect(page.locator('.eg-tipos').getByText('2M / 2 encontros')).toBeVisible();

  // Só o nome do campo no histórico.
  const [h] = await owner<{ campos: string[] }[]>`
    select campos from mentoria_historico where inscricao_id = ${inscricao} order by quando desc limit 1`;
  expect(h?.campos).toEqual(['engajamento']);
});

test('Operação vê o Dashboard e o campo, mas não marca', async ({ page }) => {
  await owner`update mentoria_inscricoes set engajamento = 'EM_RISCO' where id = ${inscricao}`;
  await entrar(page, 'operacao');
  await page.goto('/acompanhamento/onboarding');
  await expect(grupo(page, 'Em risco').getByText(NOME)).toBeVisible();
  await page.goto(`/acompanhamento/ficha/${inscricao}`);
  const campo = page
    .getByRole('complementary', { name: 'Inscrição' })
    .getByLabel('Engajamento', { exact: true });
  await expect(campo).toHaveValue('EM_RISCO');
  await expect(campo).toBeDisabled();
});
