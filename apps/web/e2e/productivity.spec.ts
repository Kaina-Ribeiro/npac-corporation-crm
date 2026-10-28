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
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/dashboard/);
}

test('Ctrl+K busca lead e navega sem mouse', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const box = page.getByRole('combobox', { name: 'Buscar leads ou ir para…' });
  // O atalho só existe depois da hidratação; logo após o login a tecla pode chegar antes.
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(box).toBeFocused({ timeout: 500 });
  }).toPass();
  await box.fill('Lead do');
  await expect(page.getByRole('option', { name: /Lead do Ale/ })).toBeVisible();
  // Escopo vale também na busca rápida.
  await expect(page.getByRole('option', { name: /Lead do Murilo/ })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lead do Ale' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await box.fill('pipe');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/pipeline$/);

  await page.keyboard.press('Control+k');
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
});

test('avisos: SDR vê o lead que o Head passou para ele e marca como lido', async ({ page }) => {
  await owner`update "user" set two_factor_enabled=true where email='ronaldo@npac.com.br'`;
  const [ale] = await owner<{ id: string }[]>`select id from "user" where email='ale@npac.com.br'`;
  const [head] = await owner<
    { id: string }[]
  >`select id from "user" where email='ronaldo@npac.com.br'`;
  // Simula o Head cadastrando para o Ale (o gatilho do banco gera o aviso).
  const [lead] = await owner<{ id: string }[]>`
    insert into leads (name, instagram, income_band, source, tier, stage_id, sdr_id, created_by)
    select 'Lead do aviso', 'lead.do.aviso', 'R5_8K', 'INSTAGRAM', 'P1', s.id, ${ale!.id}, ${head!.id}
    from pipeline_stages s where s.key = 'SONDAGEM' returning id`;
  await owner`insert into lead_timeline (lead_id, actor_id, kind) values (${lead!.id}, ${head!.id}, 'lead.created')`;

  await login(page, 'ale@npac.com.br');
  const link = page.getByRole('link', { name: /^Avisos, \d+ novos?$/ });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/avisos$/);
  await expect(page.getByText('cadastrou', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Lead do aviso/ })).toBeVisible();
  await page.getByRole('button', { name: 'Marcar tudo como lido' }).click();
  await expect(page.getByText('Tudo em dia', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Avisos', exact: true })).toBeVisible();
});

test('lista: edita perfil direto na célula e move vários leads de uma vez', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const r = await page.request.post('/api/leads', {
      data: { name: `Massa ${n}`, instagram: `@massa.${n}.e2e`, incomeBand: 'R5_8K', tier: 'P2' },
    });
    expect(r.status()).toBe(201);
    ids.push(((await r.json()) as { id: string }).id);
  }
  await page.goto('/leads');

  // Edição na própria linha, sem abrir a ficha.
  await page.getByLabel('Perfil de Massa 1').filter({ visible: true }).selectOption('P0');
  await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
  const [m1] = await owner<{ tier: string }[]>`select tier from leads where id = ${ids[0]!}`;
  expect(m1!.tier).toBe('P0');

  // Seleção múltipla + barra de ações.
  await page.getByLabel('Selecionar Massa 1').filter({ visible: true }).check();
  await page.getByLabel('Selecionar Massa 2').filter({ visible: true }).check();
  const bar = page.getByRole('region', { name: 'Ações em massa' });
  await expect(bar.getByText('2 selecionados')).toBeVisible();
  await bar.getByLabel('Mover para etapa').selectOption({ label: 'Em Follow-up' });
  await expect(bar.getByText('2 leads atualizados')).toBeVisible();
  const rows = await owner<{ key: string }[]>`
    select s.key from leads l join pipeline_stages s on s.id = l.stage_id where l.id in ${owner(ids)}`;
  expect(rows.map((r) => r.key)).toEqual(['EM_FOLLOW', 'EM_FOLLOW']);
  // SDR não vê troca de responsável na barra (só Head).
  await expect(bar.getByLabel('Trocar SDR')).toHaveCount(0);
});

test('filtro salvo aparece na sidebar e reabre a lista já filtrada', async ({ page }) => {
  await login(page, 'murilo@npac.com.br');
  await page.goto('/leads');
  await page.getByText('Filtrar e ordenar').click();
  await page.getByLabel('Perfil do lead').selectOption('P1');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await page.getByRole('button', { name: '+ Salvar este filtro' }).click();
  await page.getByLabel('Nome do filtro').fill('Meus P1');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Meus P1', pressed: true })).toBeVisible();
  await expect(page).toHaveURL(/\/leads\?view=[0-9a-f-]{36}$/);

  await page.goto('/dashboard');
  await page
    .getByRole('navigation', { name: 'Filtros salvos' })
    .getByRole('link', { name: 'Meus P1' })
    .click();
  await page.waitForURL(/\/leads\?view=/);
  await expect(page.getByText('Lead do Murilo').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel('Perfil do lead')).toHaveValue('P1');

  // Também pelo Ctrl+K.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Buscar leads ou ir para…' }).fill('Meus P1');
  await expect(page.getByRole('option', { name: /Meus P1.*Filtro salvo/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Apagar filtro Meus P1' }).click();
  await expect(page.getByRole('navigation', { name: 'Filtros salvos' })).toHaveCount(0);
});

test('login sugere o último usuário ao clicar no campo, sem usar localStorage', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/mais');
  await page.getByRole('button', { name: 'Sair' }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/login/);
  const field = page.getByLabel('Usuário', { exact: true });
  await expect(field).toHaveValue('');
  await field.click();
  await page.getByRole('option', { name: 'ale' }).click();
  await expect(field).toHaveValue('ale');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('ale');

  await field.fill('');
  await field.click();
  await page.getByRole('button', { name: 'Esquecer' }).click();
  await page.reload();
  await page.getByLabel('Usuário', { exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(0);
});
