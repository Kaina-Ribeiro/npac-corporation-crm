import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Fase 2, Parte 4: os itens novos da Fila (cobrança, semáforo, próximo PME e atraso do PME) e a aba 7
// "PMEs e ciclos", por perfil e pelo caminho real (login → menu). A entrada no ar (E13) recua 30 dias
// para o semáforo contar; volta ao valor da migration no fim.
const owner = ownerSql(E2E_DB);

test.describe.configure({ mode: 'serial' });

const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const LARGURAS = [375, 768, 1024, 1440] as const;
const ATRASADA = 'Mentorada Fictícia 94';
const FECHOU = 'Mentorado Fictício 95';

let atrasada = '';
let fechou = '';
let desdeOriginal = '';

async function inscricao(nome: string, norm: string) {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr,
       termino_previsto, responsavel_id)
     select 'INDIVIDUAL', 'RDV', 'ATIVO', ${HOJE} - 60, ${HOJE} - 60, ${HOJE} + 305, id
     from "user" where username = 'duda' returning id`,
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${norm})`;
  return i!.id;
}

/** Tarefa da reunião com prazo hoje, numa reunião conduzida por `quem`. */
async function cobranca(insc: string, quem: string) {
  await owner.unsafe(
    `with r as (
       insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, plataforma, status)
       select '${insc}', 'POSICIONAMENTO', id, now() - interval '3 days', 'MEET', 'REALIZADA'
       from "user" where username = '${quem}' returning id)
     insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, prazo)
     select '${insc}', 'REUNIAO', r.id, ${HOJE} from r`,
  );
}

test.beforeAll(async () => {
  const [d] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = d!.desde;
  await owner.unsafe(`update mentoria_semaforo_inicio set desde = ${HOJE} - 30`);
  // Sem check-in: vermelho. PME 1 com prazo há 10 dias: degrau "Avaliar segunda chance".
  atrasada = await inscricao(ATRASADA, 'mentorada ficticia 94');
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em) values ('${atrasada}', 1, ${HOJE} - 40)`,
  );
  await cobranca(atrasada, 'duda');
  await cobranca(atrasada, 'manu');
  // PME 1 encerrado: a Operação envia o 2º.
  fechou = await inscricao(FECHOU, 'mentorado ficticio 95');
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
     values ('${fechou}', 1, ${HOJE} - 30, ${HOJE} - 2)`,
  );
  await owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
    select ${fechou}, d, true, d + interval '1 hour'
    from unnest(array[now() - interval '7 days', now() - interval '14 days']) d`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  for (const id of [atrasada, fechou])
    if (id) await owner`delete from mentoria_inscricoes where id = ${id}`;
  if (desdeOriginal) await owner`update mentoria_semaforo_inicio set desde = ${desdeOriginal}`;
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

async function menu(page: Page, nome: string, url: RegExp) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: nome, exact: true }).filter({ visible: true }).click();
  await page.waitForURL(url);
}

async function capturar(page: Page, nome: string) {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(150);
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: `test-results/fila-cobranca-${nome}-${largura}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** A linha da Fila daquele mentorado com aquele texto. */
const linha = (page: Page, nome: string, texto: string | RegExp) =>
  page.locator('li.fr').filter({ hasText: nome }).filter({ hasText: texto });

test('Duda: cobrança, semáforo e degrau do PME na Fila, e a aba 7', async ({ page }) => {
  await entrar(page, 'duda');
  await menu(page, 'Fila do dia', /\/acompanhamento\/fila/);
  await page.getByRole('button', { name: /Cobrança e PMEs/ }).click();
  await expect(linha(page, ATRASADA, 'Avaliar segunda chance (1º PME)')).toBeVisible();
  await expect(linha(page, ATRASADA, /Semáforo vermelho/)).toBeVisible();
  await expect(linha(page, ATRASADA, 'Cobrar a tarefa combinada')).toHaveCount(1);
  await capturar(page, 'duda');

  await linha(page, ATRASADA, 'Avaliar segunda chance')
    .getByRole('button', { name: 'Registrar contato' })
    .click();
  await expect(linha(page, ATRASADA, 'Avaliar segunda chance')).toHaveCount(0);
  await linha(page, ATRASADA, /Semáforo vermelho/)
    .getByRole('button', { name: 'Visto nesta semana' })
    .click();
  await expect(linha(page, ATRASADA, /Semáforo vermelho/)).toHaveCount(0);
  await linha(page, ATRASADA, 'Cobrar a tarefa combinada')
    .getByRole('button', { name: 'Marcar feita' })
    .click();
  await expect(linha(page, ATRASADA, 'Cobrar a tarefa combinada')).toHaveCount(0);
  await page.reload();
  await expect(linha(page, ATRASADA, /Avaliar segunda chance|Semáforo|Cobrar/)).toHaveCount(0);

  await menu(page, 'PMEs e ciclos', /\/acompanhamento\/pmes/);
  await expect(page.getByRole('heading', { name: 'PMEs e ciclos' })).toBeVisible();
  const fechouLinha = page.locator('.pc-row').filter({ hasText: FECHOU });
  await expect(fechouLinha).toContainText('Concluído');
  await expect(fechouLinha.locator('.pc-prox')).toHaveText('2º PME');
  await expect(page.locator('.pc-row').filter({ hasText: ATRASADA })).toContainText(
    '10 dias de atraso',
  );
  await page.getByRole('combobox', { name: 'Status do PME' }).selectOption('CONCLUIDO');
  await expect(page.locator('.pc-row').filter({ hasText: ATRASADA })).toHaveCount(0);
  await expect(page.locator('.pc-row').filter({ hasText: FECHOU })).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Status do PME' }).selectOption('');
  await capturar(page, 'duda-aba7');
});

test('Operação: envia o próximo PME pela Fila e vê a aba 7', async ({ page }) => {
  await entrar(page, 'operacao');
  await menu(page, 'Fila do dia', /\/acompanhamento\/fila/);
  const item = linha(page, FECHOU, 'Enviar o 2º PME');
  await expect(item).toBeVisible();
  await expect(linha(page, ATRASADA, 'Cobrar a tarefa combinada')).toHaveCount(0);
  await capturar(page, 'operacao');
  await item.getByRole('button', { name: 'Registrar envio' }).click();
  await expect(item).toHaveCount(0);
  await menu(page, 'PMEs e ciclos', /\/acompanhamento\/pmes/);
  await expect(page.locator('.pc-row').filter({ hasText: FECHOU })).toContainText('2º PME');
  await capturar(page, 'operacao-aba7');
});

test('Manu: só a cobrança das reuniões dela, sem semáforo e sem a aba 7', async ({ page }) => {
  await entrar(page, 'manu');
  await menu(page, 'Fila do dia', /\/acompanhamento\/fila/);
  await expect(linha(page, ATRASADA, 'Cobrar a tarefa combinada')).toHaveCount(1);
  await expect(linha(page, ATRASADA, /Semáforo|segunda chance/)).toHaveCount(0);
  await capturar(page, 'manu');
  await expect(
    page.getByRole('link', { name: 'PMEs e ciclos', exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  const r = await page.goto('/acompanhamento/pmes');
  expect(r?.status()).toBe(404);
});
