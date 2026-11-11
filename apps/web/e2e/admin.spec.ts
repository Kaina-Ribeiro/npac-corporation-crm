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
  // Head só dá SDR e Closer, sem o grupo do Acompanhamento; SDR não tem caixa (o cargo define).
  const cargo = page.getByLabel('Cargo', { exact: true });
  await expect(cargo.locator('option')).toHaveText(['SDR', 'Closer']);
  await expect(cargo.locator('optgroup')).toHaveAttribute('label', 'Comercial');
  await expect(page.getByText('Não vê valores de venda.')).toBeVisible();
  await expect(page.getByLabel('Atua como SDR', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Senha temporária' })).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'convidada@npac.test' }).locator('.role-SDR'),
  ).toBeVisible();
  // Head gerencia SDR/closer, mas não promove a Head nem mexe na conta de outro Head.
  // Trocar o cargo de quem tem leads só lembra de passá-los (regra 8 do spec).
  page.on('dialog', (d) => void d.accept());
  await page.getByLabel('Cargo de Ale').selectOption('CLOSER');
  await expect(page.getByText('Ale agora é Closer')).toBeVisible();
  await page.getByLabel('Cargo de Ale').selectOption('SDR');
  await expect(page.getByText('Ale agora é SDR')).toBeVisible();
  // SDR e Closer não têm caixa: o cargo define.
  await expect(page.getByLabel('Atua como Closer para Ale')).toHaveCount(0);
  for (const email of ['ronaldo@npac.com.br', 'carla@npac.com.br'])
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: email })
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

test('Diretoria convida Operação, que entra direto no módulo; caixas só na liderança', async ({
  page,
  browser,
}) => {
  await login(page, 'diretor@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/admin');
  page.on('dialog', (d) => void d.accept());
  // "Atua como…" só em Head e Diretoria; Ronaldo é Head.
  const ronaldo = page.getByLabel('Atua como SDR para Ronaldo');
  await expect(ronaldo).not.toBeChecked();
  await ronaldo.check();
  await expect(page.getByText('Ronaldo agora atua como SDR')).toBeVisible();
  await ronaldo.uncheck();
  await expect(page.getByText('Ronaldo não atua mais como SDR')).toBeVisible();
  await expect(page.getByLabel('Atua como SDR para Ale')).toHaveCount(0);
  // Carla é conta antiga do Acompanhamento sem perfil.
  await expect(
    page.getByRole('listitem').filter({ hasText: 'carla@npac.com.br' }).getByText('falta perfil'),
  ).toBeVisible();

  const usuario = `op${Date.now().toString(36)}`;
  await page.getByLabel('Nome', { exact: true }).fill('Operação Nova');
  await page.getByLabel('E-mail', { exact: true }).fill(`${usuario}@npac.test`);
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  const cargo = page.getByLabel('Cargo', { exact: true });
  await expect(cargo.locator('optgroup')).toHaveCount(2);
  await cargo.selectOption('HEAD');
  await expect(page.getByLabel('Atua como SDR', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Atua como Closer', { exact: true })).toBeVisible();
  await cargo.selectOption('OPERACAO');
  await expect(
    page.getByText('Cadastra inscrições, onboarding, Caixa e agenda de reuniões.'),
  ).toBeVisible();
  await expect(page.getByLabel('Atua como SDR', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('switch', { name: 'Admin do Acompanhamento', exact: true }),
  ).not.toBeChecked();
  await page.screenshot({ path: 'test-results/admin-convidar-operacao.png', fullPage: true });
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  const aviso = page.getByRole('status').filter({ hasText: 'Senha temporária' });
  await expect(aviso).toBeVisible();
  const senha = (await aviso.textContent())!.split(': ').at(-1)!.trim();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: `${usuario}@npac.test` })
      .locator('.role-ACOMPANHAMENTO'),
  ).toHaveText('Operação');

  const ctx = await browser.newContext();
  const nova = await ctx.newPage();
  await nova.goto('/login');
  await nova.getByLabel('Usuário', { exact: true }).fill(usuario);
  await nova.getByLabel('Senha').fill(senha);
  await nova.getByRole('button', { name: 'Login', exact: true }).click();
  await nova.waitForURL(/\/conta\/senha/);
  await nova.getByLabel('Senha atual', { exact: true }).fill(senha);
  await nova.getByLabel('Nova senha', { exact: true }).fill('operacao-nova-1');
  await nova.getByLabel('Confirme a nova senha').fill('operacao-nova-1');
  await nova.getByRole('button', { name: 'Salvar senha' }).click();
  await nova.waitForURL(/\/acompanhamento\/fila/);
  await expect(
    nova.getByRole('heading', { name: 'Peça ao Admin para definir seu perfil' }),
  ).toHaveCount(0);
  await ctx.close();
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
