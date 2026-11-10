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

test('lista: perfil só pela faixa e move vários leads de uma vez', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const r = await page.request.post('/api/leads', {
      data: {
        name: `Massa ${n}`,
        instagram: `@massa.${n}.e2e`,
        incomeBand: 'R5_8K',
        source: 'BIO',
      },
    });
    expect(r.status()).toBe(201);
    ids.push(((await r.json()) as { id: string }).id);
  }
  await page.goto('/leads');

  // Perfil vem da faixa (5–8 mil = P2): a célula só mostra, sem troca à mão.
  await expect(page.getByLabel('Perfil de Massa 1')).toHaveCount(0);
  const [m1] = await owner<{ tier: string }[]>`select tier from leads where id = ${ids[0]!}`;
  expect(m1!.tier).toBe('P2');

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
  // SDR não vê troca de responsável na barra (só Head); perfil não se troca em massa.
  await expect(bar.getByLabel('Trocar SDR')).toHaveCount(0);
  await expect(bar.getByLabel('Mudar perfil')).toHaveCount(0);
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
  await expect(page.getByRole('option', { name: 'Meus P1' })).toBeVisible();
  await expect(page.getByRole('listbox').getByText('Filtros salvos')).toBeVisible();
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

test('pipeline tem botão Novo lead que abre o formulário', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/pipeline');
  await page
    .getByRole('link', { name: 'Novo lead', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/leads\/new$/);
});

test('closer não vê Novo lead no pipeline', async ({ page }) => {
  await login(page, 'sonia@npac.com.br');
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'Pipeline' }).first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Novo lead', exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
});

test('hoje tem botão Novo lead que abre o formulário', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/hoje');
  await page
    .getByRole('link', { name: 'Novo lead', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/leads\/new$/);
});

test('closer não vê Novo lead no Hoje', async ({ page }) => {
  await login(page, 'sonia@npac.com.br');
  await page.goto('/hoje');
  await expect(page.getByRole('heading', { name: 'Hoje' }).first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Novo lead', exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
});

test('leads: liderança exporta CSV; SDR não vê a opção', async ({ page }) => {
  await login(page, 'ana@npac.com.br');
  await page.goto('/leads');
  await page.getByText('Exportar', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Todos os leads', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('npac-leads.csv');
  // Por período manda as datas de criação.
  await page.getByLabel('Criados de', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Criados até', { exact: true }).fill('2026-12-31');
  const request = page.waitForRequest(
    (r) => r.url().endsWith('/api/leads/csv') && r.postDataJSON()?.createdFrom === '2026-01-01',
  );
  await page.getByRole('button', { name: 'Exportar período', exact: true }).click();
  await request;
  await page.context().clearCookies();
  await login(page, 'ale@npac.com.br');
  await page.goto('/leads');
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  await expect(page.getByText('Exportar', { exact: true })).toHaveCount(0);
});

test('hoje: ação rápida de chamado, remarcado e próxima ação', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const ids: string[] = [];
  for (const name of ['Rápido Chamado', 'Rápido Remarcado', 'Rápido Próxima']) {
    const res = await page.request.post('/api/leads', {
      data: {
        name,
        instagram: `@rapido.${Date.now()}.${ids.length}`,
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
      },
    });
    ids.push(((await res.json()) as { id: string }).id);
  }
  await owner`update leads set next_contact_at = now() - interval '2 hours' where id in ${owner(ids)}`;
  await page.goto('/hoje');
  const overdue = page.locator('section', {
    has: page.getByRole('heading', { name: /^Atrasados/ }),
  });
  const row = (name: string) => overdue.locator('[data-lead-row]', { hasText: name });

  await row('Rápido Chamado').getByRole('button', { name: 'Ação rápida' }).click();
  await row('Rápido Chamado').getByRole('button', { name: 'Chamado', exact: true }).click();
  await expect(row('Rápido Chamado')).toHaveCount(0);

  await row('Rápido Remarcado').getByRole('button', { name: 'Ação rápida' }).click();
  await row('Rápido Remarcado').getByRole('button', { name: 'Remarcado', exact: true }).click();
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + 86_400_000),
  );
  await row('Rápido Remarcado').getByLabel('Nova data').fill(`${tomorrow}T10:00`);
  await row('Rápido Remarcado').getByRole('button', { name: 'Salvar' }).click();
  await expect(row('Rápido Remarcado')).toHaveCount(0);

  await row('Rápido Próxima').getByRole('button', { name: 'Ação rápida' }).click();
  await row('Rápido Próxima').getByRole('button', { name: 'Próxima ação', exact: true }).click();
  await row('Rápido Próxima').getByLabel('O que fazer').fill('Enviar proposta e2e');
  await row('Rápido Próxima').getByLabel('Prazo').fill(`${tomorrow}T09:00`);
  await row('Rápido Próxima').getByRole('button', { name: 'Salvar' }).click();
  await expect(row('Rápido Próxima')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/hoje-acao-rapida.png', fullPage: true });
});

test('hoje: ação rápida da reunião marca realizada e remarca', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const ids: string[] = [];
  for (const name of ['Reunião Feita', 'Reunião Remarcar']) {
    const res = await page.request.post('/api/leads', {
      data: {
        name,
        instagram: `@reuniao.${Date.now()}.${ids.length}`,
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P0',
      },
    });
    ids.push(((await res.json()) as { id: string }).id);
  }
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    select l.id, c.id, now() - interval '1 minute', 'DIRETO', s.id
    from leads l, "user" c, "user" s
    where l.id in ${owner(ids)} and c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'`;
  await page.goto('/hoje');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: /^Reuniões de hoje/ }),
  });
  const row = (name: string) => section.locator('article', { hasText: name });
  await expect(row('Reunião Feita').getByRole('link', { name: 'Abrir ficha' })).toBeVisible();

  await row('Reunião Feita').getByRole('button', { name: 'Ação rápida' }).click();
  await row('Reunião Feita').getByRole('button', { name: 'Realizada', exact: true }).click();
  await expect(row('Reunião Feita').getByText('Realizada', { exact: true })).toBeVisible();
  await expect(row('Reunião Feita').getByRole('button', { name: 'Ação rápida' })).toHaveCount(0);

  await row('Reunião Remarcar').getByRole('button', { name: 'Ação rápida' }).click();
  await row('Reunião Remarcar').getByRole('button', { name: 'Remarcar', exact: true }).click();
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() + 86_400_000),
  );
  await row('Reunião Remarcar').getByLabel('Novo horário').fill(`${tomorrow}T10:00`);
  await row('Reunião Remarcar').getByRole('button', { name: 'Salvar' }).click();
  await expect(row('Reunião Remarcar')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/hoje-reuniao-acao.png', fullPage: true });
});

test('hoje: reunião futura mostra Realizada/No-show bloqueados e libera no horário', async ({
  page,
}) => {
  const now = Date.now();
  const end = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)}T23:59:00-03:00`,
  ).getTime();
  test.skip(now + 5 * 60_000 > end, 'perto da meia-noite de Brasília');
  await page.clock.install({ time: now });
  await login(page, 'ale@npac.com.br');
  const res = await page.request.post('/api/leads', {
    data: {
      name: 'Reunião Logo',
      instagram: `@logo.${now}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
      tier: 'P0',
    },
  });
  const { id } = (await res.json()) as { id: string };
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    select ${id}, c.id, ${new Date(now + 90_000)}, 'DIRETO', s.id
    from "user" c, "user" s
    where c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'`;
  await page.goto('/hoje');
  const row = page
    .locator('section', { has: page.getByRole('heading', { name: /^Reuniões de hoje/ }) })
    .locator('article', { hasText: 'Reunião Logo' });
  await row.getByRole('button', { name: 'Ação rápida' }).click();
  const done = row.getByRole('button', { name: 'Realizada', exact: true });
  const noShow = row.getByRole('button', { name: 'No-show', exact: true });
  await expect(done).toBeDisabled();
  await expect(noShow).toBeDisabled();
  await expect(row.getByText(/liberam às \d{2}:\d{2}/)).toBeVisible();
  await page.screenshot({ path: 'test-results/hoje-reuniao-futura.png', fullPage: true });
  // Relógio do navegador passa do horário com a tela aberta: os botões liberam sozinhos.
  await page.clock.fastForward('03:00');
  await expect(done).toBeEnabled();
  await expect(noShow).toBeEnabled();
});

test('hoje: contato que vence com a página aberta vai para atrasados pelo navegador', async ({
  page,
}) => {
  const now = Date.now();
  const end = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)}T23:59:00-03:00`,
  ).getTime();
  test.skip(now + 5 * 60_000 > end, 'perto da meia-noite de Brasília');
  await page.clock.install({ time: now });
  await login(page, 'ale@npac.com.br');
  const res = await page.request.post('/api/leads', {
    data: {
      name: 'Vence já',
      instagram: `@vence.${now}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
      tier: 'P1',
    },
  });
  const { id } = (await res.json()) as { id: string };
  await owner`update leads set next_contact_at = ${new Date(now + 90_000)} where id = ${id}`;
  await page.goto('/hoje');
  const section = (title: RegExp) =>
    page.locator('section', { has: page.getByRole('heading', { name: title }) });
  await expect(section(/^Contatos de hoje/).getByText('Vence já')).toBeVisible();
  // O relógio do servidor é o real (vence só daqui a ~90 s): se o lead mudar de lista agora,
  // foi o navegador. Um recarregamento pelo SSE (ready/invalidate) depois do avanço do relógio
  // passa pela mesma regra e não devolve o lead a "Contatos de hoje".
  await page.clock.fastForward('03:00');
  await expect(section(/^Atrasados/).getByText('Vence já')).toBeVisible();
  await expect(section(/^Contatos de hoje/).getByText('Vence já')).toHaveCount(0);
  // Recarrega como o SSE faria: o servidor (relógio real) ainda chama de "hoje", o navegador não.
  const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/today/search'));
  await page.evaluate(() => window.dispatchEvent(new Event('crm:invalidate')));
  await reloaded;
  await expect(section(/^Atrasados/).getByText('Vence já')).toBeVisible();
  await expect(section(/^Contatos de hoje/).getByText('Vence já')).toHaveCount(0);
});
