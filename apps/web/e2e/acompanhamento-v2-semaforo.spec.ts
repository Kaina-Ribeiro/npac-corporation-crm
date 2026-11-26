import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Fase 2, Parte 3: semáforo, check-ins, segunda chance, status da meta e colunas de Mentorados, por
// perfil e pelo caminho real (login → menu → linha). A entrada no ar (E13) recua 30 dias para que
// as semanas contem; volta ao valor da migration no fim.
const owner = ownerSql(E2E_DB);

test.describe.configure({ mode: 'serial' });

const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const LARGURAS = [375, 768, 1024, 1440] as const;
const DIA = 86_400_000;
const diaBR = (n: number) =>
  new Date(Date.now() + n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);
const NOME = 'Mentorada Fictícia 93';

let inscricao = '';
let desdeOriginal = '';

test.beforeAll(async () => {
  const [d] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = d!.desde;
  await owner.unsafe(`update mentoria_semaforo_inicio set desde = ${HOJE} - 30`);
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('INDIVIDUAL', 'RDV', 'ATIVO', ${HOJE} - 60, ${HOJE} - 60, ${HOJE} + 305)
     returning id`,
  );
  inscricao = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${inscricao}, 1, ${NOME}, 'mentorada ficticia 93')`;
  // A Manu conduziu uma reunião: vê a inscrição, mas não o semáforo nem os check-ins (§2).
  await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, plataforma, status)
    select ${inscricao}, 'POSICIONAMENTO', id, now() - interval '3 days', 'MEET', 'REALIZADA'
    from "user" where username = 'manu'`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  if (inscricao) await owner`delete from mentoria_inscricoes where id = ${inscricao}`;
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

/** Pelo menu: Mentorados → a linha da inscrição → aba Jornada. */
async function abrirFicha(page: Page) {
  await page
    .getByRole('link', { name: 'Mentorados', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page
    .getByRole('link', { name: new RegExp(NOME) })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/ficha\//);
  await page.getByRole('tab', { name: 'Jornada' }).filter({ visible: true }).first().click();
}

async function semOverflow(page: Page) {
  const sobra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sobra).toBeLessThanOrEqual(0);
}

async function capturar(page: Page, nome: string) {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(150);
    await semOverflow(page);
    await page.screenshot({
      path: `test-results/semaforo-${nome}-${largura}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test('Duda: vermelho sem check-in, lança o check-in, dá segunda chance e marca a meta', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'duda');

  // Mentorados: colunas e filtro por semáforo.
  await page
    .getByRole('link', { name: 'Mentorados', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(page.getByText('Semáforo', { exact: true }).filter({ visible: true })).toBeVisible();
  await page
    .getByLabel('Semáforo', { exact: true })
    .filter({ visible: true })
    .selectOption('VERMELHO');
  const linha = page.getByRole('link', { name: new RegExp(NOME) }).filter({ visible: true });
  await expect(linha).toBeVisible();
  await expect(
    linha.getByLabel(/Semáforo vermelho: 2 semanas sem resposta/).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByLabel('Semáforo', { exact: true })
    .filter({ visible: true })
    .selectOption('VERDE');
  await expect(linha).toHaveCount(0);
  await page.getByLabel('Semáforo', { exact: true }).filter({ visible: true }).selectOption('');

  await abrirFicha(page);
  const sem = page.getByRole('region', { name: 'Semáforo e check-ins' });
  const motivos = sem.getByRole('list', { name: 'Motivos do semáforo' });
  await expect(motivos.getByText('2 semanas sem resposta')).toBeVisible();

  // PME enviado há 45 dias: 15 dias de atraso desde a entrada no ar = vermelho.
  const pme = page.getByRole('region', { name: 'PME atual' });
  await pme.getByRole('button', { name: 'Registrar envio do 1º PME' }).click();
  await page.getByLabel('Data do envio').fill(diaBR(-45));
  await page.getByRole('button', { name: 'Enviar o 1º PME', exact: true }).click();
  await expect(motivos.getByText('15 dias de atraso no PME')).toBeVisible();

  // Check-in da semana passada, respondido.
  await sem.getByRole('button', { name: 'Lançar check-in' }).click();
  await page.getByLabel('Enviado em').fill(`${diaBR(-7)}T09:00`);
  await page.getByLabel('Respondeu').check();
  await page.getByLabel('Respondido em').fill(`${diaBR(-7)}T18:30`);
  await page.getByLabel('Avanço').fill('Anotou os gastos da semana');
  await page.getByLabel('Próximo passo').fill('Montar a planilha');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(sem.getByText('Anotou os gastos da semana')).toBeVisible();
  await expect(motivos.getByText('2 semanas sem resposta')).toHaveCount(0);

  // Segunda chance: sugestão de 7 dias; o status mostra até quando.
  await pme.getByRole('button', { name: 'Dar segunda chance no 1º PME' }).click();
  await expect(page.getByLabel('Novo prazo')).toHaveValue(diaBR(7));
  await page.getByRole('button', { name: 'Dar segunda chance', exact: true }).click();
  const [, m, d] = diaBR(7).split('-');
  await expect(pme.getByText(`Segunda chance até ${d}/${m}`)).toBeVisible();
  await expect(motivos.getByText('15 dias de atraso no PME')).toHaveCount(0);

  // Meta marcada como atingida (E10).
  const metas = page.getByRole('region', { name: 'Metas' });
  await metas.getByRole('button', { name: 'Nova meta' }).click();
  await metas.getByLabel('Meta', { exact: true }).fill('Ler um livro por mês');
  await metas.getByRole('button', { name: 'Adicionar meta' }).click();
  await metas.getByRole('button', { name: /Editar a meta Ler um livro/ }).click();
  await metas.getByLabel('Status').selectOption('ATINGIDA');
  await metas.getByLabel('Status').blur();
  await page.waitForTimeout(400);
  await metas.getByRole('button', { name: /Fechar a edição da meta/ }).click();
  await expect(metas.getByText('Atingida', { exact: true })).toBeVisible();

  await capturar(page, 'ficha-duda');
  await page
    .getByRole('link', { name: 'Mentorados', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await capturar(page, 'mentorados-duda');
});

test('Operação vê o semáforo e os check-ins, sem lançar nem dar segunda chance', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'operacao');
  await abrirFicha(page);
  const sem = page.getByRole('region', { name: 'Semáforo e check-ins' });
  await expect(sem.getByText('Anotou os gastos da semana')).toBeVisible();
  await expect(sem.getByRole('button', { name: 'Lançar check-in' })).toHaveCount(0);
  await expect(sem.getByRole('button', { name: /Editar o check-in/ })).toHaveCount(0);
  const pme = page.getByRole('region', { name: 'PME atual' });
  await expect(pme.getByText(/Segunda chance até/)).toBeVisible();
  await expect(pme.getByRole('button', { name: /segunda chance/ })).toHaveCount(0);
  await capturar(page, 'ficha-operacao');
});

test('Manu não vê semáforo nem check-ins', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'manu');
  await page
    .getByRole('link', { name: 'Mentorados', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const linha = page.getByRole('link', { name: new RegExp(NOME) }).filter({ visible: true });
  await expect(linha).toBeVisible();
  await expect(linha.getByLabel(/^Semáforo/)).toHaveCount(0);
  await capturar(page, 'mentorados-manu');
  await abrirFicha(page);
  await expect(page.getByRole('region', { name: 'Semáforo e check-ins' })).toHaveCount(0);
  await expect(page.getByText('Anotou os gastos da semana')).toHaveCount(0);
  await capturar(page, 'ficha-manu');
});
