import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
const contar = async () =>
  (await owner<{ n: number }[]>`select count(*)::int as n from mentoria_mentorados`)[0]!.n;

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function abrir(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  await page.goto('/acompanhamento/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

const gaveta = (page: Page) => page.getByRole('dialog', { name: 'Importar no Dashboard' });

test('colar 3 linhas mostra "3 entram · 0 já existem"', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Colar planilha' }).click();
  await gaveta(page)
    .getByLabel('Linhas da planilha')
    .fill(
      [
        'Mentorado Fictício 01\tIndividual\tMentoria A\t01/03/2026\tEngajado',
        'Mentorado Fictício 02\tIndividual\tMentoria A\t\tEm risco',
        'Mentorado Fictício 03\tCasal\tMentoria B\t03/2026\tEm atenção',
      ].join('\n'),
    );
  await gaveta(page).getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(gaveta(page).getByText('3 entram · 0 já existem')).toBeVisible();
  expect(await contar()).toBe(0);
});

test('linha sem status tem select obrigatório e "Confirmar" fica desabilitado; confirmar grava e mostra contagens', async ({
  page,
}) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Colar planilha' }).click();
  await gaveta(page)
    .getByLabel('Linhas da planilha')
    .fill(
      [
        'Mentorado Fictício 04\tIndividual\tMentoria A\t\t',
        'Mentorado Fictício 05\tIndividual\tMentoria A\t\tEngajado',
      ].join('\n'),
    );
  await gaveta(page).getByRole('button', { name: 'Pré-visualizar' }).click();
  const confirmar = gaveta(page).getByRole('button', { name: 'Confirmar importação' });
  await expect(confirmar).toBeDisabled();
  await gaveta(page)
    .getByRole('combobox', { name: 'Status da linha 1' })
    .selectOption('EM_ATENCAO');
  await confirmar.click();
  await expect(gaveta(page).getByText('2 gravados · 0 ignorados')).toBeVisible();
  expect(await contar()).toBe(2);
  await gaveta(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome de Mentorado Fictício 04' })).toBeVisible();
});

test('Exportar .json baixa arquivo com nome só de módulo e data', async ({ page }) => {
  await abrir(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar .json' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^acompanhamento-dashboard-\d{4}-\d{2}-\d{2}\.json$/,
  );
});

test('remover pede confirmação; cancelar não grava; "Confirmar exclusão" grava', async ({
  page,
}) => {
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 09', 'mentorado ficticio 09', 'ENGAJADO')`;
  await abrir(page);
  await page.getByRole('button', { name: 'Remover Mentorado Fictício 09' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Remover Mentorado Fictício 09?' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
  expect(await contar()).toBe(1);
  await page.getByRole('button', { name: 'Remover Mentorado Fictício 09' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome de Mentorado Fictício 09' })).toHaveCount(0);
  expect(await contar()).toBe(0);
});

test('importar .json de backup mostra a mesma prévia', async ({ page }) => {
  await abrir(page);
  const arquivo = join(tmpdir(), `backup-ficticio-${Date.now()}.json`);
  writeFileSync(
    arquivo,
    JSON.stringify({
      formato: 'npac-acompanhamento',
      versao: 1,
      modulo: 'dashboard',
      exportadoEm: '2026-11-04T12:00:00.000Z',
      registros: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          nome: 'Mentorado Fictício 20',
          status: 'ENGAJADO',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          nome: 'Mentorado Fictício 21',
          status: 'EM_RISCO',
        },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Importar .json' }).click();
  await gaveta(page).getByLabel('Arquivo .json').setInputFiles(arquivo);
  await gaveta(page).getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(gaveta(page).getByText('2 entram · 0 já existem')).toBeVisible();
  await gaveta(page).getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(gaveta(page).getByText('2 gravados · 0 ignorados')).toBeVisible();
  expect(await contar()).toBe(2);
});

test('coincidência no Dashboard: lista o nome, exige conferir; "mesma pessoa" atualiza a ficha (12C)', async ({
  page,
}) => {
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 30', 'mentorado ficticio 30', 'EM_RISCO')`;
  await abrir(page);
  await page.getByRole('button', { name: 'Colar planilha' }).click();
  await gaveta(page)
    .getByLabel('Linhas da planilha')
    .fill(
      [
        'MENTORADO ficticio 30\tIndividual\tMentoria A\t\tEngajado',
        'Mentorado Fictício 31\tIndividual\tMentoria A\t\tEngajado',
      ].join('\n'),
    );
  await gaveta(page).getByRole('button', { name: 'Pré-visualizar' }).click();
  const lista = gaveta(page).getByRole('region', { name: 'Nomes que já existem' });
  await expect(lista.getByText('MENTORADO ficticio 30')).toBeVisible();
  await expect(lista.getByRole('radio', { name: /Mesma pessoa/ })).toBeChecked();
  const confirmar = gaveta(page).getByRole('button', { name: 'Confirmar importação' });
  await expect(confirmar).toBeDisabled();
  await gaveta(page)
    .getByRole('checkbox', { name: /Conferi/ })
    .check();
  await confirmar.click();
  await expect(gaveta(page).getByText('1 gravados · 0 ignorados · 1 atualizados')).toBeVisible();
  const [m] = await owner<
    { status: string }[]
  >`select status from mentoria_mentorados where nome_norm = 'mentorado ficticio 30'`;
  expect(m?.status).toBe('ENGAJADO');
  expect(await contar()).toBe(2);
});

test('coincidência: "pessoa diferente" pede outro nome e entra como nova', async ({ page }) => {
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 32', 'mentorado ficticio 32', 'EM_RISCO')`;
  await abrir(page);
  await page.getByRole('button', { name: 'Colar planilha' }).click();
  await gaveta(page)
    .getByLabel('Linhas da planilha')
    .fill('Mentorado Fictício 32\tCasal\tMentoria A\t\tEngajado');
  await gaveta(page).getByRole('button', { name: 'Pré-visualizar' }).click();
  const lista = gaveta(page).getByRole('region', { name: 'Nomes que já existem' });
  await lista.getByRole('radio', { name: /Pessoa diferente/ }).check();
  await gaveta(page)
    .getByRole('checkbox', { name: /Conferi/ })
    .check();
  const confirmar = gaveta(page).getByRole('button', { name: 'Confirmar importação' });
  await expect(confirmar).toBeDisabled();
  await lista
    .getByRole('textbox', { name: /Nome da nova ficha/ })
    .fill('Mentorado Fictício 32 Souza');
  await confirmar.click();
  await expect(gaveta(page).getByText('1 gravados · 0 ignorados')).toBeVisible();
  expect(await contar()).toBe(2);
});

test('Linha do tempo: planilha .csv do formulário mostra prévia e grava (12B)', async ({
  page,
}) => {
  await abrir(page);
  await page.goto('/acompanhamento/linha-do-tempo');
  await page.getByRole('button', { name: 'Importar .json' }).click();
  const g = page.getByRole('dialog', { name: 'Importar na Linha do tempo' });
  await g.getByRole('button', { name: 'Planilha .csv do formulário' }).click();
  const csv = join(tmpdir(), `formulario-ficticio-${Date.now()}.csv`);
  writeFileSync(
    csv,
    [
      'Carimbo,Nome,Fé,Saúde,Dinheiro,Relacionamentos,Notas,Tempo,Evolução',
      '25/07/2026 10:00:00,Mentorado Fictício 40,Pouca,,,,"Profissão: fictícia",1 ano,Comprometimento: 8',
    ].join('\n'),
  );
  await g.getByLabel('Arquivo .csv').setInputFiles(csv);
  await g.getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(g.getByText('1 entram · 0 já existem')).toBeVisible();
  await g.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(g.getByText('1 gravados · 0 ignorados')).toBeVisible();
  const [f] = await owner<{ nome: string }[]>`select nome from mentoria_fichas`;
  expect(f?.nome).toBe('Mentorado Fictício 40');
});
