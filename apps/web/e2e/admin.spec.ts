import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

async function headLogin(page: Page) {
  // Outros specs podem ter deixado o autenticador da Ana ativo.
  await owner`update "user" set two_factor_enabled=false where email='ana@npac.com.br'`;
  await owner`delete from two_factor where user_id=(select id from "user" where email='ana@npac.com.br')`;
  await login(page, 'ana@npac.com.br');
  await page.waitForURL(/\/dashboard/);
}

test('HEAD convida usuário, vê auditoria e registra pedido LGPD', async ({ page }) => {
  await headLogin(page);
  await page
    .getByRole('navigation', { name: 'Navegação lateral' })
    .getByRole('link', { name: 'Admin' })
    .click();
  await page.waitForURL(/\/admin/);
  await page.getByLabel('Nome', { exact: true }).fill('Pessoa Convidada');
  await page.getByLabel('E-mail', { exact: true }).fill('convidada@npac.test');
  await page.getByLabel('Usuário', { exact: true }).fill('convidada');
  await page.getByLabel('Prospecta', { exact: true }).check();
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Senha temporária' })).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'convidada@npac.test' }).locator('.role-SDR'),
  ).toBeVisible();
  // Head gerencia SDR/closer, mas não promove a Head nem mexe na conta de outro Head.
  await expect(page.getByLabel('Papel').locator('option')).toHaveText(['SDR', 'Closer']);
  await page.getByLabel('Cargo de Ale').selectOption('CLOSER');
  await expect(page.getByText('Ale agora é Closer')).toBeVisible();
  await page.getByLabel('Cargo de Ale').selectOption('SDR');
  await expect(page.getByText('Ale agora é SDR')).toBeVisible();
  // Função é dado à parte do cargo: a flag liga e desliga na própria linha.
  await expect(page.getByLabel('Ale fecha')).not.toBeChecked();
  await page.getByLabel('Ale fecha').check();
  await expect(page.getByText('Ale agora fecha')).toBeVisible();
  await expect(page.getByLabel('Ale fecha')).toBeChecked();
  await page.getByLabel('Ale fecha').uncheck();
  await expect(page.getByText('Ale não fecha mais')).toBeVisible();
  await expect(page.getByLabel('Ale fecha')).not.toBeChecked();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'ronaldo@npac.com.br' })
      .getByText('Só a Diretoria altera esta conta'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/admin.png', fullPage: true });

  await page.getByRole('tab', { name: 'Auditoria' }).click();
  await expect(page.getByText('admin.user.invite').first()).toBeVisible();

  const [lead] = await owner<{ id: string }[]>`select id from leads where name='Lead do Murilo'`;
  await page.getByRole('tab', { name: 'LGPD' }).click();
  await page.getByLabel('ID do lead (copie da ficha)').fill(lead!.id);
  await page.getByLabel('Descrição (sem telefone ou documentos)').fill('Pediu cópia dos dados');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Pediu cópia dos dados')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar dados' })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-lgpd.png', fullPage: true });
});

test('SDR não acessa o Admin', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação lateral' })
      .getByRole('link', { name: 'Admin' }),
  ).toHaveCount(0);
  const res = await page.goto('/admin');
  expect(res?.status()).toBe(404);
});

test.describe('colunas do pipeline', () => {
  test.afterEach(async () => {
    await owner`delete from pipeline_stages where not system and not exists (select 1 from leads where stage_id = pipeline_stages.id)`;
    for (const [i, key] of [
      'SONDAGEM',
      'AGENDADO_DIRETO',
      'EM_FOLLOW',
      'AGENDADO_FOLLOW',
      'AGENDOU_PAGAMENTO',
      'NO_SHOW',
      'VENDA',
      'PERDIDO',
    ].entries())
      await owner`update pipeline_stages set position = ${i + 1} where key = ${key}`;
  });

  test('head cria, renomeia, move e exclui coluna no pipeline', async ({ page }) => {
    await headLogin(page);
    await page.goto('/pipeline');
    await page.getByRole('button', { name: 'Editar colunas' }).click();
    const editor = page.getByRole('region', { name: 'Editar colunas' });
    await editor.getByLabel('Nova coluna').fill('Reativação e2e');
    await editor.getByRole('button', { name: 'Adicionar coluna' }).click();
    const row = editor.locator('li[data-label="Reativação e2e"]');
    await expect(row).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reativação e2e' }).first()).toBeVisible();
    await row.getByLabel('Nome da coluna').fill('Reativar e2e');
    await row.getByLabel('Nome da coluna').blur();
    await expect(page.getByRole('heading', { name: 'Reativar e2e' }).first()).toBeVisible();
    const renamed = editor.locator('li[data-label="Reativar e2e"]');
    await renamed.getByRole('button', { name: 'Mover para cima' }).click();
    await expect
      .poll(() =>
        editor
          .getByLabel('Nome da coluna')
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value).at(-2)),
      )
      .toBe('Reativar e2e');
    // Coluna de sistema não exclui.
    const system = editor.locator('li[data-system]').first();
    await expect(system.getByRole('button', { name: /Excluir/ })).toBeDisabled();
    page.once('dialog', (d) => void d.accept());
    await renamed.getByRole('button', { name: 'Excluir coluna' }).click();
    await expect(editor.locator('li[data-label="Reativar e2e"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/pipeline-colunas.png', fullPage: true });
  });

  test('SDR não edita colunas', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    await page.waitForURL(/\/dashboard/);
    await page.goto('/pipeline');
    await expect(page.getByRole('heading', { name: 'Pipeline', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar colunas' })).toHaveCount(0);
  });
});
