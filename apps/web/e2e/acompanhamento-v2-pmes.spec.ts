import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Fase 2, Parte 1: Configurações > PMEs e o card "PME atual" da ficha, por perfil.
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await owner`update mentoria_pmes set titulo = null where numero = 1`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const LARGURAS = [375, 768, 1024, 1440] as const;

/** Inscrição ativa, sem ciclo; `manu` põe uma reunião dela (é o que dá acesso à Especialista). */
async function ativa(nome: string, manu = false) {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('INDIVIDUAL', 'RDV', 'ATIVO', ${HOJE} - 40, ${HOJE} - 40, ${HOJE} + 325)
     returning id`,
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${nome.toLowerCase()})`;
  if (manu)
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, plataforma)
      select ${i!.id}, 'POSICIONAMENTO', id, now() + interval '2 days', 'MEET'
      from "user" where username = 'manu'`;
  return i!.id;
}

async function semOverflow(page: Page) {
  const sobra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sobra).toBeLessThanOrEqual(0);
}

async function capturar(page: Page, nome: string, alvo: () => Promise<void>) {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await alvo();
    await semOverflow(page);
    await page.screenshot({
      path: `test-results/pme-${nome}-${largura}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test('Duda edita o catálogo em Configurações > PMEs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'duda');
  await lateral(page).getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.getByRole('link', { name: 'PMEs', exact: true }).click();
  await page.waitForURL(/aba=pmes/);
  await expect(page.getByText('PME de Aquecimento', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cadastrar o 3º PME' })).toBeVisible();
  await capturar(page, 'configuracoes', async () => {
    await expect(page.getByRole('link', { name: /1º PME/ })).toBeVisible();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: /1º PME/ }).click();
  await page.waitForURL(/\/configuracoes\/pmes\//);
  await expect(page.getByText(/Millionaire Book/)).toBeVisible();
  const titulo = page.getByLabel('Título', { exact: true });
  await titulo.fill('Primeiros passos');
  await titulo.blur();
  await expect
    .poll(
      async () =>
        (
          await owner<
            { t: string | null }[]
          >`select titulo as t from mentoria_pmes where numero = 1`
        )[0]!.t,
    )
    .toBe('Primeiros passos');
  await page.screenshot({
    path: 'test-results/pme-catalogo-1440.png',
    fullPage: true,
    animations: 'disabled',
  });
  await owner`update mentoria_pmes set titulo = null where numero = 1`;
});

test('Operação registra o envio, Duda fecha pelo encerramento, Manu só vê', async ({ page }) => {
  const id = await ativa('Mentorado Fictício 81', true);
  const ficha = `/acompanhamento/ficha/${id}?aba=jornada`;
  const card = page.getByRole('region', { name: 'PME atual' });

  // Operação: registra o envio; não marca tarefas.
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'operacao');
  await page.goto(ficha);
  await expect(card.getByText('Nenhum PME enviado ainda.')).toBeVisible();
  await card.getByRole('button', { name: 'Registrar envio do 1º PME' }).click();
  await page.getByRole('button', { name: 'Registrar envio', exact: true }).click();
  await expect(card.getByText('Em andamento')).toBeVisible();
  await expect(card.getByText('0 de 3 feitas')).toBeVisible();
  await expect(card.getByRole('button', { name: /^Marcar feita: Arrancar/ })).toBeDisabled();
  await capturar(page, 'operacao', async () => {
    await page.goto(ficha);
    await expect(card.getByText('Em andamento')).toBeVisible();
  });

  // Duda: marca uma extra como parcial com motivo e fecha o ciclo pelo encerramento.
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'duda');
  await page.goto(ficha);
  await card.getByRole('combobox', { name: /^Resultado: Listar/ }).selectOption('PARCIAL');
  const motivo = card.getByLabel('Motivo', { exact: true });
  await expect(motivo).toBeVisible();
  await motivo.fill('Fez 6 dos 10 erros');
  await motivo.blur();
  await card.getByRole('button', { name: /^Marcar feita: Arrancar/ }).click();
  await expect(card.getByText('Concluído', { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await owner<{ c: string | null }[]>`
            select concluido_em::text as c from mentoria_ciclos where inscricao_id = ${id}`
        )[0]!.c,
    )
    .not.toBeNull();
  await expect(card.getByRole('button', { name: 'Registrar envio do 2º PME' })).toBeVisible();
  await capturar(page, 'duda', async () => {
    await page.goto(ficha);
    await expect(card.getByText('Concluído', { exact: true }).first()).toBeVisible();
  });

  // Manu: vê o PME da inscrição em que conduz reunião, sem as tarefas e sem ações.
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'manu');
  await page.goto(ficha);
  await expect(card.getByText('1º PME', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: /Marcar feita/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /Registrar envio/ })).toHaveCount(0);
  await capturar(page, 'manu', async () => {
    await page.goto(ficha);
    await expect(card.getByText('1º PME', { exact: true })).toBeVisible();
  });
});

test('Operação não abre Configurações > PMEs', async ({ page }) => {
  await entrar(page, 'operacao');
  const r = await page.goto('/acompanhamento/configuracoes?aba=pmes');
  expect(r?.status()).toBe(404);
});
