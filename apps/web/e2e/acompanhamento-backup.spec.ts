import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

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
  await page.goto('/acompanhamento/backup');
  await expect(
    page.getByRole('heading', { name: 'Importação, exportação e backup' }),
  ).toBeVisible();
}

const PENDENCIAS = [
  'Reanexar as fotos e vídeos cadastrados antes da correção do armazenamento (não foram recuperados)',
  'Publicar o medidor de espaço de mídia (pronto, aguardando OK)',
  'Verificar o botão Exportar (.json) na página publicada: a plataforma avisou que downloads diretos podem não funcionar para quem acessa pelo link',
  'Confirmar se "Gegê e Hellen" e "João Carlos (Gegê) e Hellen" são o mesmo casal (hoje há duas fichas no RDV)',
];

test('tabela Backup mostra entrada e saída por módulo, e cada Exportar .json baixa', async ({
  page,
}) => {
  await abrir(page);
  for (const [nome, arquivo] of [
    ['do Dashboard', 'dashboard'],
    ['da Linha do tempo', 'linha-do-tempo'],
    ['da Linha do tempo RDV', 'rdv'],
  ]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `Exportar .json ${nome}`, exact: true }).click();
    const nomeArquivo = (await download).suggestedFilename();
    expect(nomeArquivo.startsWith(`acompanhamento-${arquivo}-`)).toBe(true);
    expect(nomeArquivo.slice(-15)).toMatch(/^\d{4}-\d{2}-\d{2}\.json$/);
  }
});

test('lista as quatro pendências do PDF, texto literal; marcar uma não persiste após recarregar (D26)', async ({
  page,
}) => {
  await abrir(page);
  const lista = page.getByRole('list', { name: 'Pendências' });
  await expect(lista.getByRole('listitem')).toHaveText(PENDENCIAS);
  const primeira = lista.getByRole('checkbox').first();
  await primeira.check();
  await expect(primeira).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Pendências' }).getByRole('checkbox').first(),
  ).not.toBeChecked();
});

test('medidor soma o real e os limites aparecem', async ({ page }) => {
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values ('66666666-6666-4666-8666-666666666666', 'Mentorado Fictício 70', 'mentorado ficticio 70')`;
  await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes)
    values ('FICHA_ANTES', '66666666-6666-4666-8666-666666666666', 'PDF', '77777777-7777-4777-8777-777777777777', 'application/pdf', 1572864)`;
  await abrir(page);
  const medidor = page.getByRole('region', { name: 'Medidor de espaço de mídia' });
  await expect(medidor).toContainText('1,5 MB');
  await expect(medidor).toContainText('1 arquivo');
  const limites = page.getByRole('region', { name: 'Limites técnicos' });
  await expect(limites).toContainText('256 KB');
  await expect(limites).toContainText('25.000');
  await expect(limites).toContainText('20 MB por arquivo');
  await expect(limites).toContainText('1 de 25.000');
});

test('mobile: sem overflow horizontal em /acompanhamento/backup', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrir(page);
  await expect(page.getByRole('list', { name: 'Pendências' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
