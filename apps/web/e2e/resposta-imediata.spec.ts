import { expect, test, type Page, type Route } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * Movimento e resposta (NPAC-47, Fase 4): a tela muda no clique, antes da resposta da API; erro
 * desfaz e mostra a mensagem; a entrada de página termina em até 300 ms; movimento reduzido não
 * deixa animação rodando.
 */
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const salvo = (page: Page) => page.getByRole('status').filter({ hasText: 'Salvo' });

/**
 * Segura o método `method` da rota por 1 s e marca quando a resposta sai. `falha`: responde com
 * esse status e corpo em vez de chamar a API.
 */
function atrasar(
  page: Page,
  url: string | RegExp,
  method: string,
  falha?: { status: number; body: object },
) {
  const estado = { respondeu: false };
  void page.route(url, async (route: Route) => {
    if (route.request().method() !== method) return route.continue();
    await new Promise((r) => setTimeout(r, 1000));
    if (falha) await route.fulfill({ status: falha.status, json: falha.body });
    else await route.continue();
    estado.respondeu = true;
  });
  return estado;
}

async function novoLead(page: Page, nome: string) {
  const res = await page.request.post('/api/leads', {
    data: {
      name: nome,
      instagram: `@resposta.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

test.describe('Pipeline', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mover o card: muda de coluna antes da resposta e avisa "Salvo"', async ({ page }) => {
    await entrar(page, 'ale');
    const nome = 'Lead Fictício Otimista';
    const id = await novoLead(page, nome);
    await page.goto('/pipeline');
    const estado = atrasar(page, `**/api/leads/${id}`, 'PATCH');
    const follow = page.getByRole('region', { name: 'Em Follow-up', exact: true });
    await page
      .getByRole('combobox', { name: `Mover ${nome} para`, exact: true })
      .selectOption('EM_FOLLOW');
    await expect(follow.getByRole('link', { name: nome, exact: true })).toBeVisible({
      timeout: 700,
    });
    expect(estado.respondeu).toBe(false);
    await expect(salvo(page)).toBeVisible();
    expect(estado.respondeu).toBe(true);
    const [lead] = await owner<{ key: string }[]>`
      select s.key from leads l join pipeline_stages s on s.id = l.stage_id where l.id = ${id}`;
    expect(lead!.key).toBe('EM_FOLLOW');
  });

  test('mover o card com 409: volta para a coluna de antes com a mensagem', async ({ page }) => {
    await entrar(page, 'ale');
    const nome = 'Lead Fictício Conflito';
    const id = await novoLead(page, nome);
    await page.goto('/pipeline');
    atrasar(page, `**/api/leads/${id}`, 'PATCH', {
      status: 409,
      body: { code: 'VERSION_CONFLICT', message: 'Conflict' },
    });
    const origem = page.getByRole('region', { name: 'Criando Relacionamento', exact: true });
    const follow = page.getByRole('region', { name: 'Em Follow-up', exact: true });
    await page
      .getByRole('combobox', { name: `Mover ${nome} para`, exact: true })
      .selectOption('EM_FOLLOW');
    await expect(follow.getByRole('link', { name: nome, exact: true })).toBeVisible({
      timeout: 700,
    });
    await expect(page.getByText('Outra pessoa alterou este registro.')).toBeVisible();
    await expect(origem.getByRole('link', { name: nome, exact: true })).toBeVisible();
    await expect(follow.getByRole('link', { name: nome, exact: true })).toHaveCount(0);
    await expect(salvo(page)).toHaveCount(0);
  });
});

test.describe('Fila do dia', () => {
  const linha = (page: Page, nome: string) =>
    page.locator('li.fr').filter({ hasText: nome }).filter({ visible: true });

  async function inscricao(page: Page, nome: string) {
    const r = await page.request.post('/api/mentoria/inscricoes', {
      data: { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome }] },
    });
    expect(r.status(), await r.text()).toBe(201);
  }
  async function abrirFila(page: Page) {
    await page.waitForURL(/\/acompanhamento\/fila/);
    await lateral(page).getByRole('link', { name: 'Fila do dia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fila do dia', level: 1 })).toBeVisible();
  }

  test('concluir: o item sai antes da resposta e avisa "Salvo"', async ({ page }) => {
    await entrar(page, 'operacao');
    const nome = 'Mentorado Fictício Otimista';
    await inscricao(page, nome);
    await abrirFila(page);
    const estado = atrasar(page, '**/api/mentoria/onboarding/*', 'PATCH');
    await linha(page, nome).getByRole('button', { name: 'Marcar enviada' }).click();
    await expect(linha(page, nome)).toHaveCount(0, { timeout: 700 });
    expect(estado.respondeu).toBe(false);
    await expect(salvo(page)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fila do dia', level: 1 })).toBeVisible();
    await expect(linha(page, nome)).toHaveCount(0);
  });

  test('concluir com 409: o item volta com a mensagem', async ({ page }) => {
    await entrar(page, 'operacao');
    const nome = 'Mentorado Fictício Conflito';
    await inscricao(page, nome);
    await abrirFila(page);
    atrasar(page, '**/api/mentoria/onboarding/*', 'PATCH', {
      status: 409,
      body: { code: 'VERSION_CONFLICT', message: 'Conflict' },
    });
    await linha(page, nome).getByRole('button', { name: 'Marcar enviada' }).click();
    await expect(linha(page, nome)).toHaveCount(0, { timeout: 700 });
    await expect(page.getByRole('alert').filter({ hasText: 'Outra pessoa alterou' })).toBeVisible();
    await expect(linha(page, nome)).toHaveCount(1);
    await expect(linha(page, nome).getByRole('button', { name: 'Marcar enviada' })).toBeVisible();
  });
});

test.describe('Plano', () => {
  const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
  async function comAcaoHoje(nome: string) {
    const [i] = await owner.unsafe<{ id: string }[]>(
      `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
       values ('INDIVIDUAL', 'RDV', 'ATIVO', ${HOJE} - 30, ${HOJE} - 30, ${HOJE} + 335)
       returning id`,
    );
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 1, ${nome}, ${nome.toLowerCase()})`;
    await owner.unsafe(`select mentoria_gerar_acoes('${i!.id}'::uuid, ${HOJE})`);
    await owner`update mentoria_acoes set data_prevista = '2099-01-01', data_limite = '2099-01-01'
      where inscricao_id = ${i!.id}`;
    await owner.unsafe(
      `update mentoria_acoes set data_prevista = ${HOJE}, data_limite = ${HOJE}
       where inscricao_id = '${i!.id}' and mes = 3`,
    );
  }
  async function abrirPlano(page: Page) {
    await page.waitForURL(/\/acompanhamento\/fila/);
    await lateral(page).getByRole('link', { name: 'Plano dos 12 meses', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plano dos 12 meses', level: 1 })).toBeVisible();
  }

  test('marcar feita: o sinal muda antes da resposta e avisa "Salvo"', async ({ page }) => {
    await entrar(page, 'duda');
    const nome = 'Mentorado Fictício Plano Otimista';
    await comAcaoHoje(nome);
    await abrirPlano(page);
    const estado = atrasar(page, '**/api/mentoria/acoes/*', 'PATCH');
    const semana = page.getByRole('region', { name: 'Vence esta semana' });
    await semana
      .getByRole('button', { name: `Marcar feita: ${nome}, Momento mágico`, exact: true })
      .click();
    await expect(
      semana.getByRole('button', { name: `Reabrir: ${nome}, Momento mágico`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 700 });
    expect(estado.respondeu).toBe(false);
    await expect(salvo(page)).toBeVisible();
  });

  test('marcar feita com erro da API: volta e mostra a mensagem', async ({ page }) => {
    await entrar(page, 'duda');
    const nome = 'Mentorado Fictício Plano Erro';
    await comAcaoHoje(nome);
    await abrirPlano(page);
    atrasar(page, '**/api/mentoria/acoes/*', 'PATCH', {
      status: 400,
      body: { message: 'Ação recusada pelo teste.' },
    });
    const semana = page.getByRole('region', { name: 'Vence esta semana' });
    await semana
      .getByRole('button', { name: `Marcar feita: ${nome}, Momento mágico`, exact: true })
      .click();
    await expect(
      semana.getByRole('button', { name: `Reabrir: ${nome}, Momento mágico`, exact: true }),
    ).toBeVisible({ timeout: 700 });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Ação recusada pelo teste.' }),
    ).toBeVisible();
    await expect(
      semana.getByRole('button', { name: `Marcar feita: ${nome}, Momento mágico`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(salvo(page)).toHaveCount(0);
  });
});

/** Coleta, a cada quadro, as animações de entrada (`reveal`) que aparecem depois do clique. */
async function vigiarEntrada(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __entrada: Map<Animation, [number, number, string]>;
      __parar: boolean;
    };
    w.__entrada = new Map();
    w.__parar = false;
    // Só o que começa depois daqui: a entrada da tela anterior pode ainda estar terminando.
    const desde = Number(document.timeline.currentTime);
    const quadro = () => {
      for (const a of document.getAnimations()) {
        const nome = (a as CSSAnimation).animationName;
        if (nome !== 'reveal' || w.__entrada.has(a) || a.startTime == null) continue;
        if (Number(a.startTime) < desde) continue;
        const fim = Number(a.effect!.getComputedTiming().endTime);
        const alvo = (a.effect as KeyframeEffect).target as Element | null;
        const quem = alvo ? `${alvo.tagName}.${String(alvo.className).slice(0, 40)}` : '?';
        w.__entrada.set(a, [Number(a.startTime), Number(a.startTime) + fim, quem]);
      }
      if (!w.__parar) requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  });
}
async function duracaoDaEntrada(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __entrada: Map<Animation, [number, number, string]>;
      __parar: boolean;
    };
    w.__parar = true;
    const v = [...w.__entrada.values()];
    if (!v.length) return { total: 0, ms: 0, blocos: [] };
    const inicio = Math.min(...v.map((x) => x[0]));
    return {
      total: v.length,
      ms: Math.round(Math.max(...v.map((x) => x[1])) - inicio),
      blocos: v.map((x) => `${x[2]} ${Math.round(x[0] - inicio)}→${Math.round(x[1] - inicio)}`),
    };
  });
}

test.describe('Entrada de página', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Leads, Pipeline e Dashboard terminam a entrada em até 300 ms', async ({ page }) => {
    await entrar(page, 'diretor');
    for (const [href, titulo] of [
      ['/leads', 'Leads'],
      ['/pipeline', 'Pipeline'],
      ['/dashboard', 'Dashboard'],
    ] as const) {
      await vigiarEntrada(page);
      await lateral(page).getByRole('link', { name: titulo, exact: true }).click();
      await page.waitForURL((u) => u.pathname === href);
      await page.waitForTimeout(1500);
      const { total, ms, blocos } = await duracaoDaEntrada(page);
      expect(total, `${titulo}: animações de entrada`).toBeGreaterThan(0);
      expect(ms, `${titulo}: duração da entrada ${JSON.stringify(blocos)}`).toBeLessThanOrEqual(
        300,
      );
    }
  });

  test.describe('movimento reduzido', () => {
    test.use({ reducedMotion: 'reduce' });

    test('nenhuma animação em andamento depois de trocar de tela', async ({ page }) => {
      await entrar(page, 'diretor');
      for (const [href, titulo] of [
        ['/leads', 'Leads'],
        ['/pipeline', 'Pipeline'],
        ['/dashboard', 'Dashboard'],
      ] as const) {
        await lateral(page).getByRole('link', { name: titulo, exact: true }).click();
        await page.waitForURL((u) => u.pathname === href);
        await expect(page.locator('main h1').first()).toBeVisible();
        // 100 ms: o que acabou de montar já terminou (0,001 ms); a entrada normal (220 ms) e os
        // gráficos (1,6 s) ainda estariam rodando.
        const rodando = await page.evaluate(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return document
            .getAnimations()
            .filter((a) => a.playState === 'running')
            .map(
              (a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty,
            );
        });
        expect(rodando, titulo).toEqual([]);
      }
    });
  });
});
