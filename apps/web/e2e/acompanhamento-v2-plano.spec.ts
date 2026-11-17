import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

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
const abrirPlano = async (page: Page) => {
  await lateral(page).getByRole('link', { name: 'Plano dos 12 meses', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/plano/);
  await expect(page.getByRole('heading', { name: 'Plano dos 12 meses', level: 1 })).toBeVisible();
};
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;

/** Inscrição ativa com plano gerado; `nome` único por teste. */
async function comPlano(nome: string, mentoria = 'RDV') {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('INDIVIDUAL', '${mentoria}', 'ATIVO', ${HOJE} - 30, ${HOJE} - 30, ${HOJE} + 335)
     returning id`,
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${nome.toLowerCase()})`;
  await owner.unsafe(`select mentoria_gerar_acoes('${i!.id}'::uuid, ${HOJE})`);
  // Tira tudo do caminho: cada teste põe na semana só o que precisa.
  await owner`update mentoria_acoes set data_prevista = '2099-01-01', data_limite = '2099-01-01'
    where inscricao_id = ${i!.id}`;
  return i!.id;
}
const naData = (id: string, mes: number, expressao: string) =>
  owner.unsafe(
    `update mentoria_acoes set data_prevista = ${expressao}, data_limite = ${expressao}
     where inscricao_id = '${id}' and mes = ${mes}`,
  );

test('Duda marca os passos do mês 11 e a ação conclui', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  const id = await comPlano('Mentorado Fictício 70');
  await page.goto(`/acompanhamento/ficha/${id}?aba=jornada`);
  await page.getByRole('button', { name: 'Mês 11', exact: true }).click();
  await page.getByRole('link', { name: /Família e Verdadeira Riqueza/ }).click();
  await page.waitForURL(/\/acompanhamento\/plano\/acao\//);

  for (const passo of ['Foto recebida', 'Presente produzido', 'Enviado', 'Entregue']) {
    await page.getByRole('checkbox', { name: passo, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: passo, exact: true })).toBeChecked();
  }
  await expect(page.getByText('Feita', { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await owner<{ status: string }[]>`
          select status from mentoria_acoes where inscricao_id = ${id} and mes = 11`
        )[0]?.status,
    )
    .toBe('FEITA');
});

test('"vence esta semana" lista as ações certas', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  const nome = 'Mentorado Fictício 71';
  const id = await comPlano(nome);
  await naData(id, 3, HOJE);
  await naData(id, 6, `${HOJE} - 20`);
  await abrirPlano(page);

  const semana = page.getByRole('region', { name: 'Vence esta semana' });
  const atrasadas = page.getByRole('region', { name: 'Atrasadas' });
  await expect(semana.getByText(nome).first()).toBeVisible();
  await expect(semana.getByText('Mês 3, Momento mágico')).toBeVisible();
  await expect(semana.getByText('Mês 6, Conexão e inspiração')).toHaveCount(0);
  await expect(atrasadas.getByText('Mês 6, Conexão e inspiração')).toBeVisible();

  await semana
    .getByRole('button', { name: new RegExp(`Marcar feita: ${nome}, Momento mágico`) })
    .click();
  await expect(semana.getByText('Mês 3, Momento mágico')).toHaveCount(0);
});

test('Configurações edita o plano do 2M', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  const [linha] = await owner<{ id: string; acao: string }[]>`
    select id, acao from mentoria_plano_modelo
    where mentoria = '2M' and mes = 4 and reuniao_tipo = 'TRIMESTRAL_2M'`;
  try {
    await lateral(page).getByRole('link', { name: 'Configurações', exact: true }).click();
    await page.waitForURL(/\/acompanhamento\/configuracoes/);
    await page.getByRole('link', { name: 'Plano-modelo', exact: true }).click();
    await page.waitForURL(/aba=plano/);
    await page.getByRole('link', { name: '2M', exact: true }).click();
    await page.waitForURL(/mentoria=2M/);
    await page
      .getByRole('link', { name: /Reunião trimestral do 2M/ })
      .nth(1)
      .click();
    await page.waitForURL(new RegExp(`/configuracoes/plano/${linha!.id}`));

    await page.getByLabel('Ação', { exact: true }).fill('Reunião fictícia do trimestre');
    await page.getByLabel('Foco', { exact: true }).focus();
    await expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await owner<{ acao: string }[]>`
            select acao from mentoria_plano_modelo where id = ${linha!.id}`
          )[0]?.acao,
      )
      .toBe('Reunião fictícia do trimestre');
  } finally {
    await owner`update mentoria_plano_modelo set acao = ${linha!.acao} where id = ${linha!.id}`;
  }
});

test('Pausar na ficha tira o mentorado do plano da semana', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  const nome = 'Mentorado Fictício 72';
  const id = await comPlano(nome);
  await naData(id, 3, HOJE);
  await abrirPlano(page);
  const semana = page.getByRole('region', { name: 'Vence esta semana' });
  await expect(semana.getByText(nome).first()).toBeVisible();

  await page.goto(`/acompanhamento/ficha/${id}`);
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: 'Pausar' }).click();
  await page.getByRole('dialog').getByLabel('Motivo (opcional)').fill('Viagem fictícia');
  await page.getByRole('dialog').getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByText(/Pausado desde/)).toBeVisible();

  await abrirPlano(page);
  await expect(semana.getByText(nome)).toHaveCount(0);

  await page.goto(`/acompanhamento/ficha/${id}`);
  await page.getByRole('button', { name: 'Retomar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retomar' }).click();
  await expect(page.getByText(/Pausado desde/)).toHaveCount(0);
  await abrirPlano(page);
  await expect(semana.getByText(nome).first()).toBeVisible();
});

test('Operação marca o que é dela e só acompanha o resto', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  const id = await comPlano('Mentorado Fictício 73');
  const [m2] = await owner<{ id: string }[]>`
    select id from mentoria_acoes where inscricao_id = ${id} and mes = 2`;
  await page.goto(`/acompanhamento/plano/acao/${m2!.id}`);
  await expect(page.getByText('Esta ação é de outro perfil')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar feita' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Convites enviados' })).toBeDisabled();

  const [m9] = await owner<{ id: string }[]>`
    select id from mentoria_acoes where inscricao_id = ${id} and mes = 9`;
  await page.goto(`/acompanhamento/plano/acao/${m9!.id}`);
  await page.getByRole('button', { name: 'Marcar feita' }).click();
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();
});

test('importado RDV: informar a IDR na ficha gera o plano', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  const id = '00000000-0000-4000-8000-000000000003';
  await page.goto(`/acompanhamento/ficha/${id}?aba=inscricao`);
  await page.getByRole('button', { name: 'Informar' }).click();
  await page.getByRole('dialog').getByLabel('Data da IDR').fill('2026-02-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('button', { name: 'Corrigir' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await owner<{ n: number }[]>`
          select count(*)::int as n from mentoria_acoes where inscricao_id = ${id}`
        )[0]?.n,
    )
    .toBe(12);
});

test('ação marcada em outra aba aparece ao abrir o Plano pelo menu', async ({ page, context }) => {
  // Sem o `router.refresh()` ao montar (desempenho, T2.3): o dado vem fresco do clique no menu.
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  const nome = 'Mentorado Fictício 77';
  const id = await comPlano(nome);
  await naData(id, 3, HOJE);
  await abrirPlano(page);
  const semana = page.getByRole('region', { name: 'Vence esta semana' });
  await expect(semana.getByText(nome).first()).toBeVisible();
  await lateral(page).getByRole('link', { name: 'Mentorados', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);

  const outra = await context.newPage();
  await outra.goto('/acompanhamento/plano');
  await outra
    .getByRole('region', { name: 'Vence esta semana' })
    .getByRole('button', { name: new RegExp(`Marcar feita: ${nome}, Momento mágico`) })
    .click();
  await expect
    .poll(
      async () =>
        (
          await owner<{ status: string }[]>`
          select status from mentoria_acoes where inscricao_id = ${id} and mes = 3`
        )[0]?.status,
    )
    .toBe('FEITA');
  await outra.close();

  await abrirPlano(page);
  await expect(semana.getByRole('listitem').filter({ hasText: nome })).toHaveCount(0);
});
