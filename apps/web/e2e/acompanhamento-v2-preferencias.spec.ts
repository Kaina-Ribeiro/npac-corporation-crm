import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/** Filtros lembrados no Acompanhamento (NPAC-46, PR 2): trocar de tela e voltar não perde nada. */
const owner = ownerSql(E2E_DB);

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
async function menu(page: Page, nome: string, url: RegExp, titulo = nome) {
  await lateral(page).getByRole('link', { name: nome, exact: true }).click();
  await page.waitForURL(url);
  await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible();
}
const fila = (page: Page) => menu(page, 'Fila do dia', /\/acompanhamento\/fila/);
const reunioes = (page: Page) => menu(page, 'Reuniões', /\/acompanhamento\/reunioes/);

/** Cookie da tela (nome com o hash da pessoa). */
async function cookieDe(context: BrowserContext, prefixo: string) {
  return (await context.cookies()).find((c) => c.name.startsWith(`${prefixo}_`));
}

const abas = (page: Page) => page.locator('.tabs');
const aba = (page: Page, nome: string) => abas(page).getByRole('link', { name: nome, exact: true });
const mentoria = (page: Page, nome: string) =>
  page.getByRole('group', { name: 'Mentoria' }).getByRole('link', { name: nome, exact: true });

test.describe('filtros lembrados: reuniões', () => {
  test('reuniões lembram a aba e o filtro de cada aba', async ({ page, context }) => {
    await entrar(page, 'duda');
    await reunioes(page);
    await aba(page, 'Controle mensal').click();
    await page.waitForURL(/aba=controle/);
    await mentoria(page, 'RDV').click();
    await page.waitForURL(/mentoria=RDV/);

    // Outra tela pelo menu e volta pelo menu: Controle mensal com RDV.
    await fila(page);
    await reunioes(page);
    await expect(aba(page, 'Controle mensal')).toHaveClass(/on/);
    await expect(mentoria(page, 'RDV')).toHaveClass(/on/);

    // Agenda e de volta ao Controle pela aba: o filtro da aba continua.
    await aba(page, 'Agenda').click();
    await expect(aba(page, 'Agenda')).toHaveClass(/on/);
    await aba(page, 'Controle mensal').click();
    await expect(aba(page, 'Controle mensal')).toHaveClass(/on/);
    await expect(mentoria(page, 'RDV')).toHaveClass(/on/);

    // F5 no endereço do menu: igual.
    await page.goto('/acompanhamento/reunioes');
    await expect(mentoria(page, 'RDV')).toHaveClass(/on/);

    // Nada pessoal no cookie: só chaves e valores da tela.
    const c = await cookieDe(context, 'npac_f_ac_reun');
    expect(decodeURIComponent(c!.value)).toMatch(/controle/);
    expect(c!.path).toBe('/acompanhamento/reunioes');
  });

  test('semana da agenda de ontem não volta hoje', async ({ page, context }) => {
    await entrar(page, 'duda');
    await reunioes(page);
    await aba(page, 'Agenda').click();
    await page.getByRole('link', { name: 'Próxima semana' }).click();
    await expect(page.getByRole('link', { name: 'Esta semana' })).toBeVisible();

    // Hoje mesmo, a semana escolhida volta.
    await fila(page);
    await reunioes(page);
    await expect(page.getByRole('link', { name: 'Esta semana' })).toBeVisible();

    // Gravada ontem: abre na semana atual.
    const c = (await cookieDe(context, 'npac_f_ac_reun'))!;
    const [ontem] = await owner<{ d: string }[]>`
      select to_char((now() at time zone 'America/Sao_Paulo')::date - 1, 'YYYY-MM-DD') as d`;
    const valor = decodeURIComponent(c.value).replace(/(^|&)d=[^&]*/, `$1d=${ontem!.d}`);
    await context.addCookies([{ ...c, value: encodeURIComponent(valor) }]);
    // Dia seguinte = página carregada de novo (a memória da aba guarda o que ela mesma gravou).
    await page.goto('/acompanhamento/fila');
    await reunioes(page);
    await expect(aba(page, 'Agenda')).toHaveClass(/on/);
    await expect(page.getByRole('link', { name: 'Próxima semana' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Esta semana' })).toBeHidden();
  });
});

test.describe('filtros lembrados: plano e configurações', () => {
  test('plano lembra aba e mês', async ({ page }) => {
    await entrar(page, 'duda');
    await menu(page, 'Plano dos 12 meses', /\/acompanhamento\/plano/);
    await aba(page, 'Por mês').click();
    await page.getByRole('link', { name: 'Mês 3', exact: true }).click();
    await page.waitForURL(/mes=3/);

    await fila(page);
    await menu(page, 'Plano dos 12 meses', /\/acompanhamento\/plano/);
    await expect(aba(page, 'Por mês')).toHaveClass(/on/);
    const mes3 = page.getByRole('link', { name: 'Mês 3', exact: true });
    await expect(mes3).toHaveAttribute('aria-current', 'true');
    // A aba Esta semana e de volta: o mês da aba Por mês continua.
    await aba(page, 'Esta semana').click();
    await expect(aba(page, 'Esta semana')).toHaveClass(/on/);
    await aba(page, 'Por mês').click();
    await expect(mes3).toHaveAttribute('aria-current', 'true');
  });

  test('configurações lembram a aba e a mentoria do plano-modelo', async ({ page }) => {
    await entrar(page, 'duda');
    await menu(page, 'Configurações', /\/acompanhamento\/configuracoes/);
    await aba(page, 'Plano-modelo').click();
    await page.waitForURL(/aba=plano/);
    await page.getByRole('link', { name: '2M', exact: true }).click();
    await page.waitForURL(/mentoria=2M/);
    await aba(page, 'Mensagens-modelo').click();
    await page.waitForURL(/aba=mensagens/);

    await fila(page);
    await menu(page, 'Configurações', /\/acompanhamento\/configuracoes/);
    await expect(aba(page, 'Mensagens-modelo')).toHaveClass(/on/);
    await aba(page, 'Plano-modelo').click();
    await expect(page).toHaveURL(/mentoria=2M/);
    // Perfis tem endereço próprio: não volta para a última aba.
    await aba(page, 'Perfis').click();
    await expect(aba(page, 'Perfis')).toHaveClass(/on/);
  });
});

test.describe('filtros lembrados: fila e mentorados', () => {
  test('fila lembra Equipe e grupo', async ({ page, context }) => {
    await entrar(page, 'duda');
    await fila(page);
    const escopo = page.getByRole('group', { name: 'De quem é a fila' });
    const equipe = escopo.getByRole('link', { name: 'Equipe', exact: true });
    const minha = escopo.getByRole('link', { name: 'Minha fila', exact: true });
    const plano = page.getByRole('group', { name: 'Tipo de item' }).getByRole('button', {
      name: /^Plano/,
    });
    await equipe.click();
    await page.waitForURL(/ver=equipe/);
    await plano.click();
    await expect(plano).toHaveAttribute('aria-pressed', 'true');

    await reunioes(page);
    await fila(page);
    await expect(equipe).toHaveAttribute('aria-current', 'true');
    await expect(plano).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(plano).toHaveAttribute('aria-pressed', 'true');
    expect((await cookieDe(context, 'npac_f_ac_fila'))!.value).toMatch(/grupo=PLANO/);

    // Minha fila pelo botão: vira a lembrada.
    await minha.click();
    await page.waitForURL(/ver=minha/);
    await reunioes(page);
    await fila(page);
    await expect(minha).toHaveAttribute('aria-current', 'true');
  });

  test('mentorados lembram os filtros e limpam', async ({ page }) => {
    await entrar(page, 'duda');
    const mentorados = () => menu(page, 'Mentorados', /\/acompanhamento\/mentorados/);
    await mentorados();
    const filtros = page.locator('.filters');
    const status = filtros.getByLabel('Status');
    const mes = filtros.getByLabel('Mês da jornada');
    await status.selectOption('PAUSADO');
    await mes.selectOption('4');

    await fila(page);
    await mentorados();
    await expect(status).toHaveValue('PAUSADO');
    await expect(mes).toHaveValue('4');
    await page.reload();
    await expect(status).toHaveValue('PAUSADO');

    await filtros.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(status).toHaveValue('');
    await fila(page);
    await mentorados();
    await expect(status).toHaveValue('');
    await expect(mes).toHaveValue('');
    await expect(filtros.getByRole('button', { name: 'Limpar filtros' })).toBeHidden();
  });
});

/** Como `nome_norm`: a busca compara sem acento. */
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
async function inscricao(nome: string) {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', current_date - 40, current_date + 325)
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${semAcento(nome)})`;
  return i!.id;
}

test.describe('filtros lembrados: onboarding', () => {
  // As abas do painel só existem abaixo de 1280 px; acima, as listas ficam ao lado do funil.
  test.use({ viewport: { width: 1024, height: 800 } });
  test('onboarding lembra etapa e painel', async ({ page, context }) => {
    await entrar(page, 'duda');
    const onboarding = () => menu(page, 'Onboarding', /\/acompanhamento\/onboarding/);
    await onboarding();
    const grupos = page.getByRole('button', { name: /Grupos de WhatsApp/ });
    const caixas = page.getByRole('tab', { name: /^Caixas em trânsito/ });
    await grupos.click();
    await caixas.click();

    await fila(page);
    await onboarding();
    await expect(caixas).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Funil', exact: true }).click();
    await expect(grupos).toHaveAttribute('aria-pressed', 'true');
    const c = await cookieDe(context, 'npac_f_ac_onb');
    expect(decodeURIComponent(c!.value)).toMatch(/etapa=GRUPOS/);
  });
});

test.describe('filtros lembrados: ficha', () => {
  test('ficha abre na última aba, em qualquer mentorado; link com ?aba= vence', async ({
    page,
  }) => {
    const a = await inscricao('Mentorado Fictício Pref A');
    const b = await inscricao('Mentorado Fictício Pref B');
    await entrar(page, 'duda');
    await page.goto(`/acompanhamento/ficha/${a}`);
    const momento = page.getByRole('tab', { name: 'Momento inicial' });
    const pessoa = page.getByRole('tab', { name: 'Pessoa', exact: true });
    await momento.click();
    await page.goto(`/acompanhamento/ficha/${b}`);
    await expect(momento).toHaveAttribute('aria-selected', 'true');

    // Link com ?aba= (Fila, Ctrl+K) vence e passa a ser o lembrado.
    await page.goto(`/acompanhamento/ficha/${b}?aba=pessoas`);
    await expect(pessoa).toHaveAttribute('aria-selected', 'true');
    await page.goto(`/acompanhamento/ficha/${a}`);
    await expect(pessoa).toHaveAttribute('aria-selected', 'true');
  });

  test('histórico lembra o filtro', async ({ page }) => {
    const a = await inscricao('Mentorado Fictício Pref C');
    const b = await inscricao('Mentorado Fictício Pref D');
    await entrar(page, 'duda');
    await page.goto(`/acompanhamento/ficha/${a}?aba=historico`);
    const anotacoes = page
      .getByRole('group', { name: 'Filtrar o histórico' })
      .getByRole('button', { name: 'Anotações', exact: true });
    await anotacoes.click();
    await expect(anotacoes).toHaveAttribute('aria-pressed', 'true');
    await page.goto(`/acompanhamento/ficha/${b}`);
    await expect(page.getByRole('tab', { name: 'Histórico' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(anotacoes).toHaveAttribute('aria-pressed', 'true');
  });
});
