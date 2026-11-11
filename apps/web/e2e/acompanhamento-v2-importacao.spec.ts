import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
// O exceljs é dependência só da API: o teste o pega de lá, para não pesar o web.
const doApi = createRequire(fileURLToPath(new URL('../../api/package.json', import.meta.url)));
const ExcelJS = doApi('exceljs') as {
  Workbook: new () => {
    addWorksheet(nome: string): { addRow(linha: unknown[]): void };
    xlsx: { writeBuffer(): Promise<ArrayBuffer> };
  };
};

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

const json = (name: string, dados: unknown) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(dados)),
});

async function xlsx() {
  const wb = new ExcelJS.Workbook();
  const forms = wb.addWorksheet('RESPOSTASFORMS');
  forms.addRow(['Nome completo', 'CPF', 'Telefone']);
  forms.addRow(['Mentorada Fictícia 71', '987.654.321-00', '11900000071']);
  const proc = wb.addWorksheet('PROCESSOS 2M6M');
  proc.addRow(['Nome', 'Mentoria', 'Data de início']);
  proc.addRow(['Mentorada Fictícia 71', 'NOVO FORMATO', new Date(Date.UTC(2026, 1, 3))]);
  return {
    name: 'equipe.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}

test('Duda importa o gerenciador e a planilha pela prévia, sem duplicar', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await lateral(page).getByRole('link', { name: 'Configurações' }).click();
  await page.waitForURL(/\/acompanhamento\/configuracoes/);
  await page.getByRole('link', { name: 'Importação', exact: true }).click();
  await page.waitForURL(/aba=importacao/);

  const arquivos = [
    json('dashboard.json', [
      {
        nome: 'Mentorado Fictício 70',
        tipoMentoria: 'RDV',
        status: 'engajado',
        dataEntrada: '2026-03',
      },
    ]),
    json('rdv.json', [
      { nome: 'Mentorado Fictício 70', diagnostico: { rendaAtual: 'uns 8 ou 10' } },
    ]),
    await xlsx(),
  ];
  await page.getByLabel('Escolher arquivos').setInputFiles(arquivos);
  await expect(page.getByText('equipe.xlsx')).toBeVisible();
  await page.getByRole('button', { name: 'Ver prévia' }).click();

  await expect(page.getByRole('heading', { name: 'Prévia' })).toBeVisible();
  const importar = page.getByRole('button', { name: /^Importar 2 inscrições/ });
  await expect(importar).toBeDisabled();
  await page.getByLabel('Mentoria de NOVO FORMATO').selectOption('6M');
  await expect(importar).toBeEnabled();
  await importar.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 inscrições importadas' })).toBeVisible();

  const [q] = await owner<{ n: number; etapas: number }[]>`
    select count(*)::int as n,
      (select count(*)::int from mentoria_onboarding_etapas e
       join mentoria_inscricoes x on x.id = e.inscricao_id
       where x.importacao_chave is not null and e.status <> 'ANTERIOR_AO_SISTEMA') as etapas
    from mentoria_inscricoes where importacao_chave is not null`;
  expect(q).toEqual({ n: 2, etapas: 0 });

  // Reimportar: ninguém novo, botão não oferece gravar.
  await page.reload();
  await page.getByLabel('Escolher arquivos').setInputFiles(arquivos);
  await page.getByRole('button', { name: 'Ver prévia' }).click();
  await expect(page.getByRole('heading', { name: 'Prévia' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Importar 0/ })).toBeDisabled();
});

test('Operação não vê a importação', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const res = await page.goto('/acompanhamento/configuracoes?aba=importacao');
  expect(res?.status()).toBe(404);
});
