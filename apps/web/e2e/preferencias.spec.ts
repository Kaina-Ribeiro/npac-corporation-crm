import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { userCookieName } from '../lib/user-cookie';
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

/** Cria um lead pela API (a liderança informa o SDR responsável) e devolve o ID. */
async function createLead(page: Page, name: string, sdrId: string) {
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      sdrId,
      instagram: `@pref.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

const userId = async (email: string) =>
  (await owner<{ id: string }[]>`select id from "user" where email = ${email}`)[0]!.id;

test('pipeline lembra as colunas marcadas ao voltar', async ({ page, context }) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/pipeline');
  const column = page.getByRole('region', { name: 'Criando Relacionamento' });
  await expect(column).toBeVisible();
  await page.getByText('Colunas visíveis').click();
  const box = page.getByRole('checkbox', { name: 'Criando Relacionamento' });
  // O clique só vale depois da hidratação; logo após carregar ele pode se perder.
  await expect(async () => {
    await box.setChecked(false);
    await expect(column).toHaveCount(0, { timeout: 500 });
  }).toPass();

  // Só chaves de etapa no cookie, restrito ao /pipeline.
  const saved = (await context.cookies()).find((c) => c.name.startsWith('npac_pipe_'));
  expect(saved?.value).toBe('SONDAGEM');
  expect(saved?.path).toBe('/pipeline');

  await page.goto('/hoje');
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'Pipeline' }).first()).toBeVisible();
  await expect(column).toHaveCount(0);
  await page.getByText('Colunas visíveis').click();
  await expect(box).not.toBeChecked();

  // Tudo marcado de novo: o cookie some.
  await expect(async () => {
    await box.setChecked(true);
    await expect(column).toBeVisible({ timeout: 500 });
  }).toPass();
  expect((await context.cookies()).some((c) => c.name.startsWith('npac_pipe_'))).toBe(false);
});

test('hoje lembra o filtro de SDR e closer ao voltar', async ({ page, context }) => {
  await login(page, 'ana@npac.com.br');
  const [aleId, muriloId] = [await userId('ale@npac.com.br'), await userId('murilo@npac.com.br')];
  const doAle = await createLead(page, 'Filtro do Ale', aleId);
  const doMurilo = await createLead(page, 'Filtro do Murilo', muriloId);
  await owner`update leads set next_contact_at = now() - interval '1 hour' where id in ${owner([doAle, doMurilo])}`;

  await page.goto('/hoje');
  const sdr = page.getByLabel('SDR', { exact: true });
  const overdue = page.locator('section', {
    has: page.getByRole('heading', { name: /^Atrasados/ }),
  });
  await expect(overdue.getByText('Filtro do Murilo')).toBeVisible();
  // Filtro vale ao escolher (NPAC-46): sem botão.
  await expect(page.getByRole('button', { name: 'Filtrar Hoje' })).toHaveCount(0);
  await expect(async () => {
    await sdr.selectOption(aleId);
    await expect(overdue.getByText('Filtro do Murilo')).toHaveCount(0, { timeout: 1000 });
  }).toPass();

  const saved = (await context.cookies()).find((c) => c.name.startsWith('npac_hoje_'));
  expect(saved?.path).toBe('/hoje');

  await page.goto('/leads');
  await page.goto('/hoje');
  await expect(sdr).toHaveValue(aleId);
  await expect(overdue.getByText('Filtro do Ale')).toBeVisible();
  await expect(overdue.getByText('Filtro do Murilo')).toHaveCount(0);

  // Voltar para "Todos" apaga o filtro salvo.
  await expect(async () => {
    await sdr.selectOption('');
    await expect(overdue.getByText('Filtro do Murilo')).toBeVisible({ timeout: 1000 });
  }).toPass();
  expect((await context.cookies()).some((c) => c.name.startsWith('npac_hoje_'))).toBe(false);
});

test('hoje: liderança que atende vê de quem é cada reunião', async ({ browser }) => {
  const ana = await browser.newPage();
  await login(ana, 'ana@npac.com.br');
  const aleId = await userId('ale@npac.com.br');
  const minha = await createLead(ana, 'Selo do Ronaldo', aleId);
  const dela = await createLead(ana, 'Selo da Sonia', aleId);
  const [ronaldoId, soniaId, anaId] = [
    await userId('ronaldo@npac.com.br'),
    await userId('sonia@npac.com.br'),
    await userId('ana@npac.com.br'),
  ];
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by) values
    (${minha}, ${ronaldoId}, now() - interval '1 minute', 'DIRETO', ${anaId}),
    (${dela}, ${soniaId}, now() - interval '1 minute', 'DIRETO', ${anaId})`;

  const ronaldo = await browser.newPage();
  await login(ronaldo, 'ronaldo@npac.com.br');
  await ronaldo.goto('/hoje');
  const row = (name: string) => ronaldo.locator('article', { hasText: name });
  await expect(row('Selo do Ronaldo').getByRole('img', { name: 'Sua reunião' })).toBeVisible();
  await expect(row('Selo da Sonia').getByRole('img', { name: /^Reunião de S/ })).toBeVisible();
  await ronaldo.screenshot({ path: 'test-results/hoje-selo-closer.png', fullPage: true });

  // Quem não atende não precisa do selo.
  await ana.goto('/hoje');
  await expect(ana.locator('article', { hasText: 'Selo do Ronaldo' })).toBeVisible();
  await expect(ana.getByRole('img', { name: 'Sua reunião' })).toHaveCount(0);
  await expect(ana.getByRole('img', { name: /^Reunião de / })).toHaveCount(0);
  await ana.close();
  await ronaldo.close();
});

// ---------------------------------------------------------------------------------------------
// NPAC-46: filtros lembrados por tela (cookie da pessoa) e busca só na memória da aba.

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const menu = (page: Page, name: string) =>
  lateral(page).getByRole('link', { name, exact: true }).click();
const rid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Lead da própria pessoa logada (SDR), com o Instagram informado. */
async function ownLead(page: Page, name: string, incomeBand: string, instagram = `@pref.${rid()}`) {
  const res = await page.request.post('/api/leads', {
    data: { name, instagram, incomeBand, source: 'BIO' },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Abre o painel de filtros (fica fechado sem filtro) e escolhe o valor, depois da hidratação. */
async function pickFilter(page: Page, label: string, value: string, check: () => Promise<void>) {
  const select = page.getByLabel(label, { exact: true });
  if (!(await select.isVisible()))
    await page.getByText('Filtrar e ordenar', { exact: true }).click();
  await expect(async () => {
    await select.selectOption(value);
    await check();
  }).toPass();
}

const visible = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).filter({ visible: true });

test.describe('filtros lembrados: leads', () => {
  test('leads lembra o filtro ao trocar de tela e no F5', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    await ownLead(page, `Rico ${id}`, 'R15_50K');
    await ownLead(page, `Medio ${id}`, 'R8_15K');
    await page.goto('/leads');
    await expect(visible(page, `Medio ${id}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toHaveCount(0);
    await pickFilter(page, 'Perfil do lead', 'P0', () =>
      expect(visible(page, `Medio ${id}`)).toHaveCount(0, { timeout: 1500 }),
    );
    await expect(visible(page, `Rico ${id}`)).toBeVisible();

    await menu(page, 'Pipeline');
    await page.waitForURL(/\/pipeline/);
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');
    await expect(visible(page, `Rico ${id}`)).toBeVisible();
    await expect(visible(page, `Medio ${id}`)).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');
    await expect(visible(page, `Rico ${id}`)).toBeVisible();
    await expect(visible(page, `Medio ${id}`)).toHaveCount(0);
  });

  test('leads aberto pelo menu (página carregada em outra tela) lembra ao voltar', async ({
    page,
  }) => {
    // O navegador só deixa o JS ler cookies do caminho em que a página foi carregada.
    await login(page, 'ale@npac.com.br');
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await pickFilter(page, 'Perfil do lead', 'P0', () => Promise.resolve());
    await menu(page, 'Pipeline');
    await page.waitForURL(/\/pipeline/);
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');
  });

  test('limpar filtros vale também ao voltar', async ({ page, context }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    await ownLead(page, `Medio ${id}`, 'R8_15K');
    await page.goto('/leads');
    await pickFilter(page, 'Perfil do lead', 'P0', () =>
      expect(visible(page, `Medio ${id}`)).toHaveCount(0, { timeout: 1500 }),
    );
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(visible(page, `Medio ${id}`)).toBeVisible();
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name.startsWith('npac_f_leads_')))
      .toBe(false);

    await menu(page, 'Pipeline');
    await page.waitForURL(/\/pipeline/);
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await expect(visible(page, `Medio ${id}`)).toBeVisible();
    await page.getByText('Filtrar e ordenar', { exact: true }).click();
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('');
  });

  test('busca volta ao trocar de tela, some no F5 e nunca vai para cookie ou URL', async ({
    page,
    context,
  }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    const term = `@pref.busca.${id}`;
    await ownLead(page, `Buscado ${id}`, 'R8_15K', term);
    await ownLead(page, `Outro ${id}`, 'R8_15K');
    await page.goto('/leads');
    const box = page.getByLabel('Buscar por nome, WhatsApp, Instagram ou e-mail');
    await expect(async () => {
      await box.fill(term);
      await box.press('Enter');
      await expect(page.getByText('1 lead', { exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass();
    await expect(visible(page, `Buscado ${id}`)).toBeVisible();

    await menu(page, 'Hoje');
    await page.waitForURL(/\/hoje/);
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await expect(box).toHaveValue(term);
    await expect(page.getByText('1 lead', { exact: true })).toBeVisible();
    await expect(visible(page, `Outro ${id}`)).toHaveCount(0);

    const jar = JSON.stringify(await context.cookies());
    expect(jar).not.toContain(`pref.busca.${id}`);
    expect(page.url()).not.toContain('pref.busca');

    await page.reload();
    await expect(box).toHaveValue('');
    await expect(visible(page, `Outro ${id}`)).toBeVisible();
  });

  test('filtro salvo aberto pela barra lateral fica lembrado', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    const name = `Visao ${rid()}`;
    const res = await page.request.post('/api/views', { data: { name, filters: { tier: 'P0' } } });
    expect(res.ok()).toBe(true);
    const { id } = (await res.json()) as { id: string };
    await page.goto(`/leads?view=${id}`);
    await expect(page.getByRole('button', { name, pressed: true })).toBeVisible();

    await menu(page, 'Hoje');
    await page.waitForURL(/\/hoje/);
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads/);
    await expect(page.getByRole('button', { name, pressed: true })).toBeVisible();
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');
    await page.request.delete(`/api/views/${id}`);
  });

  test('voltar do navegador mostra o filtro mais recente', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    await ownLead(page, `Rico ${id}`, 'R15_50K');
    await ownLead(page, `Medio ${id}`, 'R8_15K');
    await page.goto('/leads');
    await pickFilter(page, 'Perfil do lead', 'P0', () =>
      expect(visible(page, `Medio ${id}`)).toHaveCount(0, { timeout: 1500 }),
    );
    await visible(page, `Rico ${id}`).click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}/);
    await page.goBack();
    await page.waitForURL(/\/leads$/);
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');

    await pickFilter(page, 'Perfil do lead', 'P1', () =>
      expect(visible(page, `Rico ${id}`)).toHaveCount(0, { timeout: 1500 }),
    );
    await visible(page, `Medio ${id}`).click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}/);
    await page.goBack();
    await page.waitForURL(/\/leads$/);
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P1');
    await expect(visible(page, `Rico ${id}`)).toHaveCount(0);
    await expect(visible(page, `Medio ${id}`)).toBeVisible();
  });

  test('outra pessoa no mesmo navegador não herda', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    await page.goto('/leads');
    await pickFilter(page, 'Perfil do lead', 'P0', () =>
      expect(page.getByRole('button', { name: 'Limpar filtros' })).toBeVisible({ timeout: 1500 }),
    );
    const box = page.getByLabel('Buscar por nome, WhatsApp, Instagram ou e-mail');
    await box.fill('Lead do Ale');
    await box.press('Enter');
    await expect(visible(page, 'Lead do Ale')).toHaveCount(0);
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/login/);

    await login(page, 'murilo@npac.com.br');
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await expect(box).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0);
    await page.getByText('Filtrar e ordenar', { exact: true }).click();
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('');
  });

  test('filtro inválido no cookie abre sem filtro e é limpo', async ({ page, context }) => {
    await login(page, 'ale@npac.com.br');
    const name = userCookieName('npac_f_leads', await userId('ale@npac.com.br'));
    await context.addCookies([
      { name, value: 'period=RANGE&from=2026-11-01', domain: 'localhost', path: '/leads' },
    ]);
    const lead = `Sem data ${rid()}`;
    await ownLead(page, lead, 'R8_15K');
    await page.goto('/leads');
    await expect(visible(page, lead)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0);
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === name))
      .toBe(false);
  });

  test('seleção em massa não volta', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    await ownLead(page, `Massa A ${id}`, 'R8_15K');
    await ownLead(page, `Massa B ${id}`, 'R8_15K');
    await page.goto('/leads');
    const bar = page.getByRole('region', { name: 'Ações em massa' });
    await expect(async () => {
      await page.getByLabel(`Selecionar Massa A ${id}`).filter({ visible: true }).check();
      await expect(bar).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByLabel(`Selecionar Massa B ${id}`).filter({ visible: true }).check();
    await expect(bar.getByText('2 selecionados')).toBeVisible();

    await menu(page, 'Hoje');
    await page.waitForURL(/\/hoje/);
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads$/);
    await expect(visible(page, `Massa A ${id}`)).toBeVisible();
    await expect(bar).toHaveCount(0);
  });
});

test.describe('filtros lembrados: pipeline', () => {
  const card = (page: Page, name: string) =>
    page.locator('article').getByRole('link', { name, exact: true }).filter({ visible: true });

  test('pipeline lembra filtro e coluna do celular', async ({ page }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    await ownLead(page, `Rico ${id}`, 'R15_50K');
    await ownLead(page, `Medio ${id}`, 'R8_15K');
    await page.goto('/pipeline');
    await expect(card(page, `Medio ${id}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buscar', exact: true })).toHaveCount(0);
    await pickFilter(page, 'Perfil do lead', 'P0', () =>
      expect(card(page, `Medio ${id}`)).toHaveCount(0, { timeout: 1500 }),
    );
    await expect(card(page, `Rico ${id}`)).toBeVisible();

    await menu(page, 'Leads');
    await page.waitForURL(/\/leads/);
    await menu(page, 'Pipeline');
    await page.waitForURL(/\/pipeline/);
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');
    await expect(card(page, `Rico ${id}`)).toBeVisible();
    await expect(card(page, `Medio ${id}`)).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    const tabs = page.getByRole('navigation', { name: 'Etapas do Pipeline' });
    const follow = tabs.getByRole('button', { name: /^Em Follow-up/ });
    await expect(async () => {
      await follow.click();
      await expect(follow).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass();
    await page.reload();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Perfil do lead', { exact: true })).toHaveValue('P0');
  });

  test('pipeline busca no Enter e lembra o termo ao voltar', async ({ page, context }) => {
    await login(page, 'ale@npac.com.br');
    const id = rid();
    const term = `@pref.pipe.${id}`;
    await ownLead(page, `Buscado ${id}`, 'R8_15K', term);
    await ownLead(page, `Outro ${id}`, 'R8_15K');
    await page.goto('/pipeline');
    const box = page.getByLabel('Buscar no Pipeline');
    await expect(async () => {
      await box.fill(term);
      await box.press('Enter');
      await expect(card(page, `Outro ${id}`)).toHaveCount(0, { timeout: 1500 });
    }).toPass();
    await expect(card(page, `Buscado ${id}`)).toBeVisible();

    await menu(page, 'Hoje');
    await page.waitForURL(/\/hoje/);
    await menu(page, 'Pipeline');
    await page.waitForURL(/\/pipeline/);
    await expect(box).toHaveValue(term);
    await expect(card(page, `Buscado ${id}`)).toBeVisible();
    await expect(card(page, `Outro ${id}`)).toHaveCount(0);
    expect(JSON.stringify(await context.cookies())).not.toContain(`pref.pipe.${id}`);
    expect(page.url()).not.toContain('pref.pipe');
  });
});

test.describe('filtros lembrados: dashboard e relatórios', () => {
  test('dashboard lembra período e SDR', async ({ page }) => {
    await login(page, 'ana@npac.com.br');
    const aleId = await userId('ale@npac.com.br');
    const week = page
      .getByRole('group', { name: 'Período' })
      .getByRole('button', { name: '7 dias' });
    const sdr = page.getByRole('combobox', { name: 'SDR', exact: true });
    await expect(async () => {
      await week.click();
      await expect(week).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass();
    await expect(week).toBeEnabled();
    await sdr.selectOption(aleId);
    await expect(sdr).toBeEnabled();

    await menu(page, 'Leads');
    await page.waitForURL(/\/leads/);
    await menu(page, 'Dashboard');
    await page.waitForURL(/\/dashboard/);
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await expect(sdr).toHaveValue(aleId);
    await page.reload();
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await expect(sdr).toHaveValue(aleId);
  });

  test('relatórios aplicam ao mudar e lembram', async ({ page, context }) => {
    await login(page, 'ana@npac.com.br');
    await page.goto('/relatorios');
    const tier = page.getByLabel('Perfil do relatório', { exact: true });
    const p1Rows = page.locator('li', { hasText: '· P1' });
    await expect(p1Rows.first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atualizar relatório' })).toHaveCount(0);
    await expect(async () => {
      await tier.selectOption('P0');
      await expect(p1Rows).toHaveCount(0, { timeout: 1500 });
    }).toPass();

    await menu(page, 'Leads');
    await page.waitForURL(/\/leads/);
    await menu(page, 'Relatórios');
    await page.waitForURL(/\/relatorios/);
    await expect(tier).toHaveValue('P0');
    await expect(p1Rows).toHaveCount(0);
    await page.reload();
    await expect(tier).toHaveValue('P0');
    await expect(p1Rows).toHaveCount(0);

    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(tier).toHaveValue('');
    await expect(p1Rows.first()).toBeVisible();
    expect((await context.cookies()).some((c) => c.name.startsWith('npac_f_rel_'))).toBe(false);
  });

  test('relatório ignora produto excluído no cookie', async ({ page, context }) => {
    await login(page, 'ale@npac.com.br');
    const name = userCookieName('npac_f_rel', await userId('ale@npac.com.br'));
    await context.addCookies([
      {
        name,
        value: 'productId=00000000-0000-4000-8000-000000000000&tier=P0',
        domain: 'localhost',
        path: '/relatorios',
      },
    ]);
    await page.goto('/relatorios');
    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
    await expect(page.getByLabel('Produto do relatório', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Perfil do relatório', { exact: true })).toHaveValue('P0');
  });
});

test.describe('filtros lembrados: admin, chat e playbook', () => {
  test('admin lembra a aba', async ({ page }) => {
    await login(page, 'ana@npac.com.br');
    await page.goto('/admin');
    const tab = page.getByRole('tab', { name: 'Etapas' });
    await expect(async () => {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
    }).toPass();
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads/);
    await menu(page, 'Admin');
    await page.waitForURL(/\/admin/);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('chat lembra a conversa aberta', async ({ page }) => {
    await login(page, 'ana@npac.com.br');
    await page.goto('/chat');
    await expect(async () => {
      await page.getByLabel('Nova conversa').selectOption({ label: 'Ale' });
      await expect(
        page.getByRole('navigation', { name: 'Conversas' }).getByRole('button', { name: /^Ale/ }),
      ).toHaveAttribute('aria-current', 'true', { timeout: 1500 });
    }).toPass();
    await menu(page, 'Leads');
    await page.waitForURL(/\/leads/);
    await menu(page, 'Chat');
    await page.waitForURL(/\/chat/);
    await expect(
      page.getByRole('navigation', { name: 'Conversas' }).getByRole('button', { name: /^Ale/ }),
    ).toHaveAttribute('aria-current', 'true');
  });

  test('playbook lembra a busca ao trocar de tela', async ({ page }) => {
    await login(page, 'ana@npac.com.br');
    await page.goto('/playbook');
    const box = page.getByLabel('Buscar no playbook');
    await expect(async () => {
      await box.fill('caro');
      await menu(page, 'Leads');
      await page.waitForURL(/\/leads/);
      await menu(page, 'Playbook');
      await page.waitForURL(/\/playbook/);
      await expect(box).toHaveValue('caro', { timeout: 1500 });
    }).toPass();
    await page.reload();
    await expect(box).toHaveValue('');
  });
});
