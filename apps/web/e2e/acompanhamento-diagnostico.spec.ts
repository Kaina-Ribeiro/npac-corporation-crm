import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-76: o diagnóstico da planilha da Duda na aba Pessoa(s); a aba Momento inicial saiu.
const owner = ownerSql(E2E_DB);

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});

let individual = '';
let casal = '';

test.beforeAll(async () => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status) values ('INDIVIDUAL', 'RDV', 'ONBOARDING')
    returning id`;
  individual = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${individual}, 1, 'Mentorada Fictícia 76', 'mentorada ficticia 76')`;
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status) values ('CASAL', 'RDV', 'ONBOARDING')
    returning id`;
  casal = c!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm) values
    (${casal}, 1, 'Mentorada Fictícia 77', 'mentorada ficticia 77'),
    (${casal}, 2, 'Mentorado Fictício 78', 'mentorado ficticio 78')`;
});

test.afterAll(async () => {
  await owner`delete from mentoria_inscricoes where id in (${individual}, ${casal})`;
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

const salvo = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' }));
const painel = (page: Page) => page.getByRole('tabpanel', { name: /^Pessoas?$/ });

async function responder(page: Page, rotulo: string, texto: string) {
  const campo = painel(page).getByLabel(rotulo, { exact: true });
  await campo.fill(texto);
  await campo.blur();
}

test('Duda preenche o diagnóstico, vê o total das dívidas e conclui', async ({ page }) => {
  await entrar(page, 'duda');
  await page.goto(`/acompanhamento/ficha/${individual}`);
  await expect(page.getByRole('tab', { name: 'Momento inicial' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Pessoa', exact: true }).click();

  // As 20 perguntas, na ordem da planilha.
  const rotulos = await painel(page).locator('.dg-r').allTextContents();
  expect(rotulos).toEqual([
    'Nome',
    'Cidade',
    'Idade',
    'Nome do parceiro(a)',
    'Filho 1',
    'Filho 2',
    'Trabalho',
    'Renda atual',
    'Dinheiro guardado',
    'Bem 1',
    'Bem 2',
    'Investimento 1',
    'Investimento 2',
    'Custo médio mensal',
    'Dívida 1',
    'Dívida 2',
    'Dívida 3',
    'Sonhos e objetivos',
    'Já buscou ajuda?',
    'Anotações e percepções',
  ]);
  // O que saiu da tela não aparece mais.
  for (const fora of ['Como prefere', 'Instagram', 'Nascimento', 'Principal dor', 'Veio de'])
    await expect(painel(page).getByText(fora, { exact: true })).toHaveCount(0);

  await responder(page, 'Idade', '41');
  await responder(page, 'Nome do parceiro(a)', 'Parceiro Fictício');
  await responder(page, 'Renda atual', '5.000,00');
  await responder(page, 'Dívida 1', 'Cartão fictício');
  await responder(page, 'Dívida 1: valor', '3.000,00');
  await responder(page, 'Dívida 2: valor', '1500');
  await responder(page, 'Já buscou ajuda?', 'Nunca buscou ajuda fictícia.');
  await salvo(page).toBeVisible();
  await expect(painel(page).getByText('Total das dívidas: R$ 4.500,00')).toBeVisible();

  await page.reload();
  await expect(painel(page).getByLabel('Idade', { exact: true })).toHaveValue('41');
  await expect(painel(page).getByLabel('Renda atual', { exact: true })).toHaveValue(
    /^R\$\s5\.000,00$/,
  );
  await expect(painel(page).getByLabel('Dívida 1', { exact: true })).toHaveValue('Cartão fictício');
  await expect(painel(page).getByLabel('Já buscou ajuda?', { exact: true })).toHaveValue(
    'Nunca buscou ajuda fictícia.',
  );
  // No banco, cifrado; o total é a soma.
  const [m] = await owner<{ linha: string; total: string }[]>`
    select row_to_json(m)::text as linha, dividas_centavos::text as total
    from mentoria_momento_inicial m where inscricao_id = ${individual}`;
  expect(m!.linha).not.toMatch(/fict/i);
  expect(m!.total).toBe('450000');

  await painel(page).getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluir' }).click();
  await expect(painel(page).getByText(/Concluído em/)).toBeVisible();
  await expect(painel(page).getByLabel('Trabalho', { exact: true })).not.toBeEditable();
  await expect(painel(page).getByLabel('Dívida 1: valor', { exact: true })).not.toBeEditable();
  // Nome e cidade não travam: são da pessoa.
  await expect(painel(page).getByLabel('Cidade', { exact: true })).toBeEditable();
  await expect(painel(page).getByRole('button', { name: 'Destravar' })).toBeVisible();
});

test('casal: uma aba só, parceiro é a pessoa 2 e o contato de cada um', async ({ page }) => {
  await entrar(page, 'duda');
  await page.goto(`/acompanhamento/ficha/${casal}?aba=pessoas`);
  await expect(page.getByRole('group', { name: 'Pessoa do casal' })).toHaveCount(0);
  await expect(painel(page).getByLabel('Nome', { exact: true })).toHaveValue(
    'Mentorada Fictícia 77',
  );
  await expect(painel(page).getByLabel('Nome do parceiro(a)', { exact: true })).toHaveValue(
    'Mentorado Fictício 78',
  );
  for (const n of ['Mentorada', 'Mentorado']) {
    await expect(painel(page).getByLabel(`WhatsApp (${n})`, { exact: true })).toBeVisible();
    await expect(painel(page).getByLabel(`Pulseira (${n})`, { exact: true })).toBeVisible();
  }
  await expect(painel(page).getByLabel('Endereço', { exact: true })).toBeVisible();
});

test('Operação vê o diagnóstico sem editar; o contato continua com ela', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.goto(`/acompanhamento/ficha/${casal}?aba=momento`);
  await expect(page.getByRole('tab', { name: 'Pessoas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(painel(page).getByRole('button', { name: 'Concluir' })).toHaveCount(0);
  await expect(painel(page).getByLabel('Idade', { exact: true })).not.toBeEditable();
  await expect(painel(page).getByLabel('WhatsApp (Mentorada)', { exact: true })).toBeEditable();
});
