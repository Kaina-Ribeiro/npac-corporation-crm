import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD, WEB_ORIGIN } from './env.js';
import { totp } from './totp.js';

const owner = ownerSql(E2E_DB);

// O rate limit de login é real (5/min por IP); zera entre testes para não vazar de um para outro.
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

const errorAlert = (page: Page) =>
  page.getByRole('alert').and(page.getByText('Usuário ou senha inválidos'));

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('SDR cadastra lead, escreve nota e conclui tarefa na ficha', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/leads');
  await page.getByRole('link', { name: 'Novo lead', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Lead e2e CRM');
  await page.getByLabel('WhatsApp', { exact: true }).fill('11966665555');
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R5_8K');
  await page.getByRole('button', { name: 'Cadastrar lead' }).click();
  await expect(page.getByRole('heading', { name: 'Lead e2e CRM', exact: true })).toBeVisible();
  await page.getByLabel('Nova nota', { exact: true }).fill('Retornar após a reunião');
  await page.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(page.getByText('Retornar após a reunião', { exact: true })).toBeVisible();
  await page.getByLabel('Nova tarefa', { exact: true }).fill('Enviar apresentação');
  await page.getByRole('button', { name: 'Adicionar tarefa' }).click();
  await page.getByRole('button', { name: 'Concluir Enviar apresentação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reabrir Enviar apresentação' })).toBeVisible();
  await page.screenshot({ path: 'test-results/ficha.png', fullPage: true });
  await page.goto('/pipeline');
  await page
    .getByRole('combobox', { name: 'Mover Lead e2e CRM para', exact: true })
    .selectOption('EM_FOLLOW');
  await expect(
    page
      .getByRole('region', { name: 'Em Follow-up', exact: true })
      .getByText('Lead e2e CRM', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/pipeline.png', fullPage: true });
  await page.goto('/leads');
  await page.getByText('Filtrar e ordenar', { exact: true }).click();
  await page.getByLabel('Perfil do lead', { exact: true }).selectOption('P0');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.getByText('Lead e2e CRM', { exact: true })).toHaveCount(0);
});

test('SDR registra venda parcial, recebe saldo e vê o relatório', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  const response = await page.request.post('/api/leads', {
    data: { name: 'Lead venda e2e', instagram: '@sale.e2e', incomeBand: 'R5_8K', tier: 'P1' },
  });
  const { id } = (await response.json()) as { id: string };
  const products = (await (await page.request.get('/api/finance/products')).json()) as {
    id: string;
    name: string;
  }[];
  const product = products.find((p) => p.name === 'Nação Promocional')!;
  await page.goto(`/leads/${id}`);
  await page.getByRole('button', { name: 'Registrar venda', exact: true }).click();
  await page.getByLabel('Produto da venda', { exact: true }).selectOption(product.id);
  await page.getByRole('button', { name: 'Continuar venda' }).click();
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('PARTIAL');
  await page.getByLabel('Entrada recebida (R$)', { exact: true }).fill('1000,00');
  await page.getByLabel('Parcela 1 (R$)', { exact: true }).fill('1500,00');
  await page.getByLabel('Vencimento 1 (Brasília)', { exact: true }).fill('2030-01-01T12:00');
  await page.getByRole('button', { name: 'Continuar venda' }).click();
  await page.getByRole('button', { name: 'Confirmar venda', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Registrar recebimento', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/venda.png', fullPage: true });
  await page.getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Registrar recebimento', exact: true }),
  ).toHaveCount(0);
  await page.goto('/relatorios');
  await expect(page.getByRole('heading', { name: 'Relatórios', exact: true })).toBeVisible();
  await expect(page.getByText(/2\.500,00/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV com contatos', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/relatorios.png', fullPage: true });
});

test('SDR entra e vê só os próprios leads', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Pré-vendas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atividade da equipe' })).toHaveCount(0);
  await page.goto('/leads');
  await expect(page.getByText('Lead do Ale').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Lead do Murilo')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/leads-desktop.png', fullPage: true });
});

test('Hoje permite criar e concluir uma tarefa pessoal', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/hoje');
  await page.getByLabel('Nova tarefa pessoal', { exact: true }).fill('Planejar contatos');
  await page.getByRole('button', { name: 'Criar tarefa pessoal' }).click();
  const finish = page.getByRole('button', { name: 'Concluir Planejar contatos', exact: true });
  await expect(finish).toBeVisible();
  await page.screenshot({ path: 'test-results/hoje.png', fullPage: true });
  await finish.click();
  await expect(finish).toHaveCount(0);
});

test('senha errada mostra erro genérico', async ({ page }) => {
  await login(page, 'ale@npac.com.br', 'senha-errada-123');
  await expect(errorAlert(page)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('usuário inexistente mostra o mesmo erro', async ({ page }) => {
  await login(page, 'ninguem@npac.com.br', 'senha-errada-123');
  await expect(errorAlert(page)).toBeVisible();
});

test('sem sessão redireciona para /login', async ({ page }) => {
  await page.goto('/leads');
  await expect(page).toHaveURL(/\/login/);
});

test('HEAD sem MFA é levado para configurar o autenticador', async ({ page }) => {
  await owner`update "user" set two_factor_enabled=false where email='ana@npac.com.br'`;
  await owner`delete from two_factor where user_id=(select id from "user" where email='ana@npac.com.br')`;
  await login(page, 'ana@npac.com.br');
  await expect(page).toHaveURL(/\/conta\/mfa/);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/conta/mfa');
  await expect(page).toHaveURL(/\/login/);
});

test('mobile mostra barra inferior', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  const nav = page.getByRole('navigation', { name: 'Navegação inferior' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('link').first()).toHaveAccessibleName('Dashboard');
  await expect(page.getByRole('navigation', { name: 'Navegação lateral' })).toBeHidden();
  await page.goto('/leads');
  await page.screenshot({ path: 'test-results/leads-mobile.png', fullPage: true });
  await page.goto('/pipeline');
  const tabs = page.getByRole('navigation', { name: 'Etapas do Pipeline' });
  await expect(tabs).toBeVisible();
  await tabs.getByRole('button', { name: /^Em Follow-up/ }).click();
  await page
    .getByRole('combobox', { name: 'Mover Lead e2e CRM para', exact: true })
    .selectOption('AGENDADO_FOLLOW');
  await tabs.getByRole('button', { name: /^Agendado do Follow/ }).click();
  await expect(page.getByText('Lead e2e CRM', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/pipeline-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Mais', exact: true }).click();
  await page.getByRole('link', { name: /^Relatórios/ }).click();
  await expect(page.getByRole('heading', { name: 'Relatórios', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/relatorios-mobile.png', fullPage: true });
});

test('nada de dado pessoal no localStorage', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/leads');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/\d{8,}|@/);
});

test('página responde com CSP e sem cabeçalho do Next', async ({ page }) => {
  const res = await page.goto('/login');
  const headers = res?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toMatch(/nonce-/);
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['referrer-policy']).toBe('no-referrer');
  await page.screenshot({ path: 'test-results/login.png', fullPage: true });
});

test('busca mantém contato fora da URL e alterna o tema', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/leads');
  await page.getByRole('textbox').fill('@lead.do.ale');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByText('Lead do Ale').filter({ visible: true })).toBeVisible();
  expect(page.url()).not.toContain('lead.do.ale');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('lead.do.ale');
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

for (const head of ['ana', 'ronaldo']) {
  test(`${head}: configura MFA e próximo login exige TOTP`, async ({ page }) => {
    const email = `${head}@npac.com.br`;
    await owner`update "user" set two_factor_enabled=false where email=${email}`;
    await owner`delete from two_factor where user_id=(select id from "user" where email=${email})`;
    await login(page, email);
    await expect(page).toHaveURL(/\/conta\/mfa/);
    await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Continuar' }).click();
    const secret = await page.locator('code').innerText();
    await page.getByLabel('Código', { exact: true }).fill(totp(secret));
    await page.waitForURL(/\/dashboard/);
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/login/);
    await login(page, `${head}@npac.com.br`);
    await expect(page.getByRole('heading', { name: 'Confirme que é você' })).toBeVisible();
    await page.getByLabel('Código', { exact: true }).fill(totp(secret));
    await page.waitForURL(/\/dashboard/);
  });
}

test('HEAD estorna pela ficha preservando recebimento', async ({ page }) => {
  await owner`update "user" set two_factor_enabled=false where email='ronaldo@npac.com.br'`;
  await owner`delete from two_factor where user_id=(select id from "user" where email='ronaldo@npac.com.br')`;
  await login(page, 'ronaldo@npac.com.br');
  await page.waitForURL(/\/conta\/mfa/);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const secret = await page.locator('code').innerText();
  await page.getByLabel('Código', { exact: true }).fill(totp(secret));
  await page.waitForURL(/\/dashboard/);
  const [sdr] = await owner<{ id: string }[]>`select id from "user" where email='ale@npac.com.br'`;
  const lead = await page.request.post('/api/leads', {
    data: {
      name: 'Venda para estorno',
      instagram: '@sale.reverse.e2e',
      incomeBand: 'R5_8K',
      tier: 'P1',
      sdrId: sdr!.id,
    },
  });
  const { id } = (await lead.json()) as { id: string };
  const ps = (await (await page.request.get('/api/finance/products')).json()) as {
    id: string;
    closerId: string;
  }[];
  const d = await page.request.post('/api/finance/deals', {
    data: {
      leadId: id,
      productId: ps[0]!.id,
      closerId: ps[0]!.closerId,
      version: 1,
      totalCents: 250000,
      method: 'PIX',
      requestKey: crypto.randomUUID(),
    },
  });
  expect(d.status()).toBe(201);
  const deal = (await d.json()) as { id: string };
  await page.goto(`/leads/${id}`);
  await page.getByText('Estornar venda', { exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar estorno', exact: true }).click();
  await expect(page.getByText('Estornada — histórico preservado', { exact: true })).toBeVisible();
  const rows =
    await owner`select id from payments where deal_id=${deal.id} and paid_at is not null`;
  expect(rows).toHaveLength(1);
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mesa dos closers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pré-vendas' })).toBeVisible();
  // O feed do Head mostra o estorno que acabou de acontecer, com link para a ficha.
  await expect(page.getByRole('heading', { name: 'Atividade da equipe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Venda para estorno' }).first()).toHaveAttribute(
    'href',
    `/leads/${id}`,
  );
  await expect(page.getByText('estornou a venda de').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
});

test('primeiro acesso exige trocar a senha', async ({ page }) => {
  await owner`update "user" set must_change_password = true where email = 'igor@npac.com.br'`;
  await login(page, 'igor@npac.com.br');
  await expect(page).toHaveURL(/\/conta\/senha/);
  // Sair no meio do primeiro acesso não pode prender a pessoa: volta ao login e entra de novo.
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await login(page, 'igor@npac.com.br');
  await expect(page).toHaveURL(/\/conta\/senha/);
  await page.getByLabel('Senha atual', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-do-igor-123');
  await page.getByLabel('Confirme a nova senha').fill('nova-senha-do-igor-123');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await page.waitForURL(/\/dashboard/);
});

test('troca a senha quando quiser, pelo menu', async ({ page }) => {
  const [before] = await owner<{ password: string }[]>`
    select a.password from account a join "user" u on u.id = a.user_id
    where u.email = 'murilo@npac.com.br'`;
  await login(page, 'murilo@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Trocar senha' }).click();
  await expect(page.getByRole('heading', { name: 'Trocar senha' })).toBeVisible();
  await page.getByLabel('Senha atual', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Nova senha', { exact: true }).fill('murilo-nova-1');
  await page.getByLabel('Confirme a nova senha').fill('murilo-nova-1');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
  await login(page, 'murilo@npac.com.br', 'murilo-nova-1');
  await page.waitForURL(/\/dashboard/);
  await owner`
    update account set password = ${before!.password}
    where user_id = (select id from "user" where email = 'murilo@npac.com.br')`;
});

test('primeira carga de /leads fica abaixo de 150 KB de JS (gzip)', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  const sizes: Promise<number>[] = [];
  page.on('response', (res) => {
    if (res.request().resourceType() === 'script') {
      sizes.push(res.body().then((b) => gzipSync(b).length));
    }
  });
  await page.goto('/leads', { waitUntil: 'load' });
  const total = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  console.log(`JS de /leads (gzip): ${(total / 1024).toFixed(1)} KB`);
  expect(total).toBeLessThan(150 * 1024);
  expect(total).toBeGreaterThan(50 * 1024);
});

test('sair encerra a sessão', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/leads');
  await expect(page).toHaveURL(/\/login/);
});

test('duas sessões recebem notas em tempo real e revogam acesso sem recarregar', async ({
  browser,
}) => {
  const a = await browser.newContext({ baseURL: WEB_ORIGIN });
  const s = await browser.newContext({ baseURL: WEB_ORIGIN });
  try {
    const ale = await a.newPage();
    const sonia = await s.newPage();
    await login(ale, 'ale@npac.com.br');
    await ale.waitForURL(/\/dashboard/);
    const response = await a.request.post('/api/leads', {
      data: { name: 'Lead tempo real', instagram: '@lead.live', incomeBand: 'R5_8K', tier: 'P1' },
    });
    expect(response.status()).toBe(201);
    const { id } = (await response.json()) as { id: string };
    const [closer] = await owner<
      { id: string }[]
    >`select id from "user" where email = 'sonia@npac.com.br'`;
    const meeting = await a.request.post('/api/meetings', {
      data: {
        leadId: id,
        closerId: closer!.id,
        scheduledAt: '2030-01-01T10:00:00-03:00',
        origin: 'DIRETO',
      },
    });
    expect(meeting.status()).toBe(201);
    const { id: meetingId } = (await meeting.json()) as { id: string };
    await login(sonia, 'sonia@npac.com.br');
    await sonia.waitForURL(/\/dashboard/);
    await sonia.goto(`/leads/${id}`);
    await expect(
      sonia.getByRole('heading', { name: 'Lead tempo real', exact: true }),
    ).toBeVisible();
    await a.request.post(`/api/leads/${id}/notes`, {
      data: { body: 'Nota sincronizada entre sessões' },
    });
    await expect(sonia.getByText('Nota sincronizada entre sessões', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await owner`update meetings set closer_id = (select id from "user" where email = 'ronaldo@npac.com.br'), version = version + 1 where id = ${meetingId}`;
    await expect(sonia.getByRole('heading', { name: 'Lead indisponível' })).toBeVisible({
      timeout: 10_000,
    });
    await owner`update "user" set active = false where email = 'sonia@npac.com.br'`;
    await expect(sonia).toHaveURL(/\/login/, { timeout: 10_000 });
  } finally {
    await a.close();
    await s.close();
  }
});

test('rascunho não usa versão nova recebida por SSE para sobrescrever outra edição', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  const created = await page.request.post('/api/leads', {
    data: {
      name: 'Lead versão',
      instagram: '@lead.version.draft',
      incomeBand: 'R5_8K',
      tier: 'P1',
    },
  });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/leads/${id}`);
  await page.getByText('Editar dados do lead', { exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Meu rascunho');
  await page.request.patch(`/api/leads/${id}`, { data: { version: 1, name: 'Mudança remota' } });
  await expect(page.getByRole('heading', { name: 'Mudança remota', exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Meu rascunho');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(
    page.getByText('Outra pessoa alterou este registro.', { exact: false }),
  ).toBeVisible();
  expect((await (await page.request.get(`/api/leads/${id}`)).json()).name).toBe('Mudança remota');
});

test('tema automático segue o sistema', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/mais');
  await page.getByRole('radio', { name: 'Automático' }).click();
  await expect(page.getByRole('radio', { name: 'Automático' })).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('radio', { name: 'Claro' }).click();
});

test('primeiro acesso da liderança: cria a senha e vai direto ao QR, sem pedir a senha de novo', async ({
  page,
}) => {
  const [before] = await owner<{ password: string }[]>`
    select a.password from account a join "user" u on u.id = a.user_id where u.email = 'ronaldo@npac.com.br'`;
  await owner`update "user" set must_change_password = true, two_factor_enabled = false where email = 'ronaldo@npac.com.br'`;
  await owner`delete from two_factor where user_id = (select id from "user" where email = 'ronaldo@npac.com.br')`;
  try {
    await login(page, 'ronaldo@npac.com.br');
    await expect(page).toHaveURL(/\/conta\/senha/);
    await page.getByLabel('Senha atual').fill(E2E_PASSWORD);
    await page.getByLabel('Nova senha', { exact: true }).fill('ronaldo-nova-1');
    await page.getByLabel('Confirme a nova senha').fill('ronaldo-nova-1');
    await page.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(page).toHaveURL(/\/conta\/mfa/);
    await expect(page.getByRole('heading', { name: 'Escaneie o QR' })).toBeVisible();
    await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
  } finally {
    await owner`update account set password = ${before!.password} where user_id = (select id from "user" where email = 'ronaldo@npac.com.br')`;
    await owner`update "user" set must_change_password = false where email = 'ronaldo@npac.com.br'`;
  }
});
