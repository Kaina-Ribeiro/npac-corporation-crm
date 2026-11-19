import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas da Fase 3B (NPAC-54, desenho A): "Acessos" com as tags "Carteira" / "Todos os mentorados"
// na aba Perfis (linha, Convidar e pedido de acesso), a tag "Carteira" ao lado do cargo em Admin →
// Usuários e no quadro "Acessos" da Diretoria, e as telas de quem tem a carteira (Fila, Mentorados,
// Nova inscrição), em 375 / 768 / 1024 / 1440. Confere também que nada passa da largura da tela.
// Só roda com CAPTURAS=<pasta>.
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];
const USUARIO = 'carteira.captura';

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  await owner`delete from "user" where id in ('cap-carteira', 'cap-todos')`;
  await owner`delete from access_requests where username = 'pedido.captura'`;
  for (const [id, nome, usuario] of [
    ['cap-carteira', 'Maria Carteira', USUARIO],
    ['cap-todos', 'Paula Todos', 'todos.captura'],
  ] as const) {
    await owner`insert into "user" (id, name, email, username, display_username, role, can_prospect,
        can_close, must_change_password)
      values (${id}, ${nome}, ${`${usuario}@cap3b.test`}, ${usuario}, ${usuario},
        'ACOMPANHAMENTO', false, false, false)`;
    await owner`insert into account (id, account_id, provider_id, user_id, password)
      select ${`${id}-acc`}, ${id}, 'credential', ${id}, a.password
      from account a join "user" u on u.id = a.user_id where u.username = 'duda'`;
    await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${id}, 'ACOMPANHAMENTO', false)`;
  }
  // A Diretoria põe a carteira pela função (fica no quadro "Acessos" com a tag).
  await owner.begin(async (t) => {
    await t`select set_config('app.user_id', (select id from "user" where username = 'diretor'), true)`;
    await t`select area_definir_membro('cap-carteira', 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false, 'CARTEIRA')`;
  });
  await owner`insert into audit_log (actor_id, action, entity_type, entity_id, data)
    select id, 'area.membro.definido', 'user', 'cap-carteira',
      '{"area":"ACOMPANHAMENTO","cargo":"ACOMPANHAMENTO","head":false,"alcance":"CARTEIRA",
        "antes":{"cargo":"ACOMPANHAMENTO","head":false,"alcance":"TODOS"}}'::jsonb
    from "user" where username = 'diretor'`;
  await owner`insert into access_requests (name, username, email, password_hash, area)
    values ('Pedido Captura', 'pedido.captura', 'pedido.captura@cap3b.test', 'x', 'ACOMPANHAMENTO')`;
  for (const n of [1, 2]) {
    const [i] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
      values ('INDIVIDUAL', 'RDV', 'ATIVO', current_date - 40, current_date + 325, 'cap-carteira')
      returning id`;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 1, ${`Mentorado Fictício Captura ${n}`}, ${`mentorado ficticio captura ${n}`})`;
  }
});
test.afterAll(async () => {
  await owner`delete from mentoria_inscricoes where id in (
    select inscricao_id from mentoria_pessoas where nome like 'Mentorado Fictício Captura%')`;
  await owner`delete from access_requests where username = 'pedido.captura'`;
  await owner`delete from audit_log where entity_id in ('cap-carteira', 'cap-todos')`;
  await owner`delete from session where user_id in ('cap-carteira', 'cap-todos')`;
  await owner`delete from "user" where id in ('cap-carteira', 'cap-todos')`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string, tela = '/login/acompanhamento') {
  await page.goto(tela);
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function foto(page: Page, nome: string, largura: number) {
  const larga = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(larga, `${nome} em ${largura}: rolagem lateral`).toBeLessThanOrEqual(0);
  // A entrada da página anima por 280 ms (opacidade): espera terminar.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${PASTA}/${nome}-${largura}.png`, fullPage: true });
}

const CARTEIRA_DICA =
  'Vê e cuida só dos mentorados em que é a responsável. Cadastra mentorados novos, que já entram na carteira dela.';
const TODOS_DICA = 'Vê e cuida de todos os mentorados do Acompanhamento.';

/** Passa o mouse no alvo, confere a dica inteira dentro da tela e fotografa a tela visível. */
async function fotoDica(page: Page, alvo: Locator, texto: string, nome: string, largura: number) {
  await alvo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await alvo.hover();
  const dica = page.getByRole('tooltip').filter({ hasText: texto });
  await expect(dica).toBeVisible();
  const caixa = (await dica.boundingBox())!;
  expect(caixa.x, `${nome} em ${largura}: dica cortada à esquerda`).toBeGreaterThanOrEqual(0);
  expect(
    caixa.x + caixa.width,
    `${nome} em ${largura}: dica cortada à direita`,
  ).toBeLessThanOrEqual(largura);
  expect(caixa.y, `${nome} em ${largura}: dica cortada em cima`).toBeGreaterThanOrEqual(0);
  await expect(alvo).toHaveAttribute('aria-describedby', (await dica.getAttribute('id'))!);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${PASTA}/${nome}-${largura}.png` });
}

for (const largura of LARGURAS) {
  test(`Fase 3B em ${largura}`, async ({ browser }) => {
    const viewport = { width: largura, height: 900 };
    // Duda: aba Perfis (uma linha com Carteira, outra com Todos), Convidar e pedido de acesso.
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await entrar(page, 'duda');
    await page.goto('/acompanhamento/configuracoes');
    await page.locator('.tabs').getByRole('link', { name: 'Perfis', exact: true }).click();
    const carteira = page.getByRole('radiogroup', { name: 'Acessos de Maria Carteira' });
    await expect(carteira.getByRole('radio', { name: 'Carteira' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const todos = page.getByRole('radiogroup', { name: 'Acessos de Paula Todos' });
    await expect(todos.getByRole('radio', { name: 'Todos os mentorados' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await foto(page, 'perfis', largura);
    await fotoDica(
      page,
      carteira.getByRole('radio', { name: 'Carteira' }),
      CARTEIRA_DICA,
      'dica-perfis',
      largura,
    );
    const pedido = page.locator('.pf-pedido').filter({ hasText: 'Pedido Captura' });
    await pedido.getByLabel('Perfil de Pedido Captura').selectOption('ACOMPANHAMENTO');
    await expect(
      pedido.getByRole('radiogroup', { name: 'Acessos de Pedido Captura' }),
    ).toBeVisible();
    await pedido.scrollIntoViewIfNeeded();
    await foto(page, 'pedido', largura);
    await fotoDica(
      page,
      pedido.getByRole('radio', { name: 'Todos os mentorados' }),
      TODOS_DICA,
      'dica-pedido',
      largura,
    );
    await page.getByRole('button', { name: 'Convidar', exact: true }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Convidar' });
    await dlg.getByLabel('Perfil', { exact: true }).selectOption('ACOMPANHAMENTO');
    await dlg
      .getByRole('radiogroup', { name: 'Acessos' })
      .getByRole('radio', { name: 'Carteira' })
      .click();
    await foto(page, 'convidar', largura);
    // A dica fica acima da janelinha (camada de cima do navegador).
    await fotoDica(
      page,
      dlg.getByRole('radio', { name: 'Carteira' }),
      CARTEIRA_DICA,
      'dica-convidar',
      largura,
    );
    await ctx.close();

    // Diretoria: Admin → Usuários com a tag "Carteira" e o quadro "Acessos".
    const ctxD = await browser.newContext({ viewport });
    const d = await ctxD.newPage();
    await entrar(d, 'diretor', '/login');
    await d.goto('/admin');
    // A linha da lista (o usuário só aparece nela; o quadro "Acessos" também usa <li>).
    const linha = d.locator('li').filter({ hasText: USUARIO }).first();
    await expect(linha.locator('.role-TAG')).toHaveText('Carteira');
    await expect(
      d.locator('li').filter({ hasText: 'todos.captura' }).first().locator('.role-TAG'),
    ).toHaveCount(0);
    await foto(d, 'admin-usuarios', largura);
    await fotoDica(d, linha.locator('.role-TAG'), CARTEIRA_DICA, 'dica-admin-tag', largura);
    const quadro = d.locator('section').filter({ hasText: 'Ver tudo' }).first();
    await fotoDica(d, quadro.locator('.role-TAG').first(), CARTEIRA_DICA, 'dica-quadro', largura);
    await ctxD.close();

    // Quem tem a carteira: Fila, Mentorados e Nova inscrição.
    const ctx2 = await browser.newContext({ viewport });
    const p = await ctx2.newPage();
    await entrar(p, USUARIO);
    await p.waitForURL(/\/acompanhamento\/fila/);
    await foto(p, 'fila-carteira', largura);
    await p.goto('/acompanhamento/mentorados');
    await expect(p.getByText('Mentorado Fictício Captura 1').first()).toBeVisible();
    await foto(p, 'mentorados-carteira', largura);
    await p.goto('/acompanhamento/mentorados/nova');
    await foto(p, 'nova-carteira', largura);
    await ctx2.close();
  });
}
