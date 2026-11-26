import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-79, Parte 2 (opção A + janelinha 2): a aba "Renovações e gestão" e o "Registrar renovação" da ficha, pelo
// caminho real (login → menu → clique). A Duda renova; quem tem "só a carteira" vê só os dela; a Operação não tem a
// aba (sem item no menu e 404).
const owner = ownerSql(E2E_DB);
const NOME = 'Mentorado Fictício Renovação';
let HOJE = '';
let carla = '';

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
/** A linha da lista (o item "Ficha do mentorado" da lateral também traz o nome, como a última aberta). */
const linhaDe = (page: Page, n: number) =>
  page.locator('.rv-row').filter({ hasText: `${NOME} ${n}` });
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

async function entrar(page: Page, usuario: string) {
  await page.goto('/login/acompanhamento');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function abrirAba(page: Page) {
  await lateral(page).getByRole('link', { name: 'Renovações e gestão', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/renovacoes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Renovações e gestão' })).toBeVisible();
}

/** Ficha Ativa com término daqui a `dias` (o 12º mês já começou). */
async function inscricao(n: number, resp: string, dias = 20) {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', ((${HOJE}::date + ${dias}::int) - interval '12 months')::date,
      ${HOJE}::date + ${dias}::int, ${resp})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`${NOME} ${n}`}, ${`mentorado ficticio renovacao ${n}`})`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, ${HOJE}::date)`;
  return i!.id;
}

async function limpar() {
  await owner`delete from mentoria_inscricoes where id in (
    select inscricao_id from mentoria_pessoas where nome like ${`${NOME}%`})`;
}

test.beforeAll(async () => {
  HOJE = (
    await owner<{ d: string }[]>`select (now() at time zone 'America/Sao_Paulo')::date::text as d`
  )[0]!.d;
  carla = (await owner<{ id: string }[]>`select id from "user" where username = 'carla'`)[0]!.id;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await limpar();
});
test.afterAll(async () => {
  await limpar();
  // Carla volta a ser "Acompanhamento sem perfil", como no seed.
  await owner`delete from mentoria_perfis where user_id = ${carla}`;
  await closeTestConnections();
});

test('a Duda abre a aba, renova pela ficha e vê "Renovou" na lista', async ({ page }) => {
  const duda = (await owner<{ id: string }[]>`select id from "user" where username = 'duda'`)[0]!
    .id;
  await inscricao(1, duda);
  await entrar(page, 'duda');
  await abrirAba(page);

  const linha = linhaDe(page, 1);
  await expect(linha).toContainText('Mês 12 de 12');
  await expect(linha).toContainText('Sem reunião');
  await expect(page.getByLabel('Situação da conversa')).toBeVisible();
  await expect(page.getByLabel('Responsável', { exact: true })).toBeVisible();

  await linha.click();
  await page.waitForURL(/\/acompanhamento\/ficha\/.+aba=jornada/);
  await expect(page.getByText('Mês 12 de 12', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Registrar renovação', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Registrar renovação' });
  await expect(dlg.getByRole('radio', { name: 'RDV' })).toBeChecked();
  await expect(dlg.getByLabel('Data da renovação')).toHaveValue(HOJE);
  await dlg.getByText('2M', { exact: true }).click();
  await expect(dlg.getByText('Meses 13 a 24')).toBeVisible();
  await dlg.getByRole('button', { name: 'Registrar renovação', exact: true }).click();
  await expect(dlg).toBeHidden();

  // Ficha: continua Ativo, com o selo, "Mês 12 de 24" e o "Desfazer" (Admin). Renovou no mês 12: a faixa
  // continua no 1º ano (1 a 12) e só passa a 13–24, com "2º ano", no mês 13.
  await expect(page.getByText(`Renovado em ${diaMes(HOJE)}`)).toBeVisible();
  await expect(page.getByText('Mês 12 de 24', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('2º ano', { exact: true })).toHaveCount(0);
  const faixa = page.getByRole('tabpanel', { name: 'Jornada' }).locator('.rail');
  await expect(faixa).toContainText('12');
  await expect(faixa).not.toContainText('13');
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeVisible();
  const status = page.getByRole('complementary', { name: 'Inscrição' }).getByLabel('Status', {
    exact: true,
  });
  await expect(status).toHaveValue('ATIVO');
  await expect(status.locator('option[value="RENOVADO"]')).toHaveCount(0);

  await abrirAba(page);
  await expect(linhaDe(page, 1)).toContainText(`Renovou para 2M em ${diaMes(HOJE)}`);
  // O filtro lembra a situação escolhida.
  await page.getByLabel('Situação da conversa').selectOption('SEM_REUNIAO');
  await expect(linhaDe(page, 1)).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Situação da conversa')).toHaveValue('SEM_REUNIAO');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(linhaDe(page, 1)).toBeVisible();

  // O endereço antigo do "Em breve" leva à aba.
  await page.goto('/acompanhamento/em-breve/renovacoes');
  await page.waitForURL(/\/acompanhamento\/renovacoes$/);
});

test('"só a carteira" vê só os dela, sem o filtro de responsável', async ({ page }) => {
  const duda = (await owner<{ id: string }[]>`select id from "user" where username = 'duda'`)[0]!
    .id;
  await owner`delete from mentoria_perfis where user_id = ${carla}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carla}, 'ACOMPANHAMENTO', false)`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${carla} and area = 'ACOMPANHAMENTO'`;
  await inscricao(2, carla);
  await inscricao(3, duda);
  await entrar(page, 'carla');
  await abrirAba(page);
  await expect(linhaDe(page, 2)).toBeVisible();
  await expect(linhaDe(page, 3)).toHaveCount(0);
  await expect(page.getByLabel('Responsável', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Situação da conversa')).toBeVisible();
});

test('a Operação não tem a aba no menu e recebe 404', async ({ page }) => {
  await entrar(page, 'operacao');
  await expect(lateral(page).getByRole('link', { name: 'Fila do dia', exact: true })).toBeVisible();
  await expect(lateral(page).getByRole('link', { name: 'Renovações e gestão' })).toHaveCount(0);
  const r = await page.goto('/acompanhamento/renovacoes');
  expect(r?.status()).toBe(404);
});
