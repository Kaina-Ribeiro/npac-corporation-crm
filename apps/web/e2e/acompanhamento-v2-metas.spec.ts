import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Fase 2, Parte 2: registro da reunião (cobrança, metas, tarefas da semana) e ficha, por perfil.
const owner = ownerSql(E2E_DB);

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  // Sem sobra para as outras specs (a agenda da Manu, por exemplo).
  if (inscricao) await owner`delete from mentoria_inscricoes where id = ${inscricao}`;
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

const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const LARGURAS = [375, 768, 1024, 1440] as const;
const DIA = 86_400_000;
const diaBR = (n: number) =>
  new Date(Date.now() + n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);

let inscricao = '';
let anterior = '';
let atual = '';
let daManu = '';

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
      path: `test-results/metas-${nome}-${largura}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
}

/** Reunião realizada `horas` atrás, conduzida por `usuario`. */
async function reuniao(usuario: string, horas: number) {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, plataforma, status)
    select ${inscricao}, 'POSICIONAMENTO', id, now() - ${`${horas} hours`}::interval, 'MEET',
      'REALIZADA'
    from "user" where username = ${usuario} returning id`;
  return r!.id;
}

test.beforeAll(async () => {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('CASAL', 'RDV', 'ATIVO', ${HOJE} - 40, ${HOJE} - 40, ${HOJE} + 325)
     returning id`,
  );
  inscricao = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm) values
    (${inscricao}, 1, 'Mentorada Fictícia 86', 'mentorada ficticia 86'),
    (${inscricao}, 2, 'Mentorado Fictício 87', 'mentorado ficticio 87')`;
  anterior = await reuniao('duda', 24 * 7);
  atual = await reuniao('duda', 1);
  // A da Manu fica antes: a cobrança da Duda é a da última realizada (spec §4).
  daManu = await reuniao('manu', 24 * 8);
});

test('Duda combina 3 tarefas, define a meta, cobra na reunião seguinte e vê as barras', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'duda');

  // O 1º PME abre o ciclo: as tarefas da reunião entram nele.
  await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
  const card = page.getByRole('region', { name: 'PME atual' });
  await card.getByRole('button', { name: 'Registrar envio do 1º PME' }).click();
  await page.getByRole('button', { name: 'Registrar envio', exact: true }).click();
  await expect(card.getByText('Em andamento')).toBeVisible();

  // Reunião da semana passada: 3 tarefas (a 4ª não cabe) e uma meta.
  await page.goto(`/acompanhamento/reunioes/${anterior}`);
  const semana = page.getByRole('region', { name: 'Tarefas da semana' });
  const nova = semana.getByRole('form', { name: 'Nova tarefa' });
  for (const [k, texto] of ['Anotar os gastos', 'Ler 10 páginas', 'Caminhar 3 vezes'].entries()) {
    await nova.getByLabel('Tarefa', { exact: true }).fill(texto);
    await nova.getByLabel('Prazo', { exact: true }).fill(diaBR(3));
    await nova.getByRole('button', { name: 'Combinar tarefa' }).click();
    await expect(semana.getByText(`${k + 1} de 3`)).toBeVisible();
  }
  await expect(nova).toHaveCount(0);
  await expect(semana.getByText('Limite de 3 tarefas por reunião.')).toBeVisible();

  const metas = page.getByRole('region', { name: 'Metas definidas ou ajustadas' });
  await metas.getByRole('button', { name: 'Nova meta' }).click();
  const form = metas.getByRole('form', { name: 'Nova meta' });
  await form.getByLabel('Meta', { exact: true }).fill('Juntar a reserva de emergência');
  await form.getByLabel('Pilar').selectOption('DINHEIRO');
  await form.getByLabel('Alvo (opcional)').fill('10.000');
  await form.getByLabel('Unidade').fill('R$');
  await form.getByRole('button', { name: 'Adicionar meta' }).click();
  await expect(metas.getByLabel('Meta', { exact: true })).toHaveValue(
    'Juntar a reserva de emergência',
  );
  const atualMeta = metas.getByLabel('Atual', { exact: true });
  await atualMeta.fill('2.500');
  await atualMeta.blur();
  await expect
    .poll(
      async () =>
        (await owner<{ v: string }[]>`select valor_atual::text as v from mentoria_metas`)[0]?.v,
    )
    .toBe('2500.00');

  // Reunião desta semana: cobra as três.
  await page.goto(`/acompanhamento/reunioes/${atual}`);
  const cobranca = page.getByRole('region', { name: 'Cobrança da reunião anterior' });
  await expect(cobranca.getByText('3 a cobrar')).toBeVisible();
  await cobranca.getByRole('button', { name: 'Marcar feita: Anotar os gastos' }).click();
  await expect(cobranca.getByText('2 a cobrar')).toBeVisible();
  await cobranca
    .getByRole('combobox', { name: 'Resultado: Ler 10 páginas' })
    .selectOption('NAO_FEITA');
  const motivo = cobranca.getByLabel('Motivo', { exact: true });
  await motivo.fill('Viajou a trabalho');
  await motivo.blur();
  await expect(cobranca.getByText('1 a cobrar')).toBeVisible();
  await capturar(page, 'registro-duda', async () => {
    await page.goto(`/acompanhamento/reunioes/${atual}`);
    await expect(cobranca.getByText('1 a cobrar')).toBeVisible();
  });

  // Ficha: seções Tarefas e Metas; barra do PME só com tarefas (1 feita de 6), meta em 25 %.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
  await expect(card.getByRole('meter', { name: 'Tarefas do 1º PME' })).toHaveAttribute(
    'aria-valuetext',
    '17%',
  );
  // Sem % de metas agregado (pendente com a Eduarda): a meta mostra a própria barra.
  await expect(card.getByRole('meter', { name: 'Metas do 1º PME' })).toHaveCount(0);
  await expect(
    page.getByRole('meter', { name: 'Progresso da meta: Juntar a reserva de emergência' }),
  ).toHaveAttribute('aria-valuetext', '25%');
  const tarefas = page.getByRole('region', { name: 'Tarefas', exact: true });
  await expect(tarefas.getByText('1 de 3 feitas')).toBeVisible();
  await expect(tarefas.getByText('Meta: Juntar a reserva de emergência')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Metas', exact: true })).toBeVisible();
  await capturar(page, 'ficha-duda', async () => {
    await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
    await expect(tarefas.getByText('1 de 3 feitas')).toBeVisible();
  });
});

test('Operação vê tarefas e metas sem editar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'operacao');
  await page.goto(`/acompanhamento/reunioes/${atual}`);
  const cobranca = page.getByRole('region', { name: 'Cobrança da reunião anterior' });
  await expect(cobranca.getByRole('button', { name: /Marcar feita/ }).first()).toBeDisabled();
  const metas = page.getByRole('region', { name: 'Metas definidas ou ajustadas' });
  await expect(metas.getByText('Juntar a reserva de emergência')).toBeVisible();
  await expect(metas.getByRole('button', { name: 'Nova meta' })).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Nova tarefa' })).toHaveCount(0);
  await capturar(page, 'registro-operacao', async () => {
    await page.goto(`/acompanhamento/reunioes/${atual}`);
    await expect(metas.getByText('Juntar a reserva de emergência')).toBeVisible();
  });
});

test('Manu combina só na reunião dela e não vê metas nem as tarefas da Duda', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'manu');
  await page.goto(`/acompanhamento/reunioes/${daManu}`);
  await expect(page.getByRole('region', { name: /Metas/ })).toHaveCount(0);
  const cobranca = page.getByRole('region', { name: 'Cobrança da reunião anterior' });
  await expect(cobranca.getByText(/Nenhuma tarefa combinada/)).toBeVisible();
  const semana = page.getByRole('region', { name: 'Tarefas da semana' });
  const nova = semana.getByRole('form', { name: 'Nova tarefa' });
  await nova.getByLabel('Tarefa', { exact: true }).fill('Montar o orçamento da casa');
  await nova.getByLabel('Prazo', { exact: true }).fill(diaBR(5));
  await nova.getByRole('button', { name: 'Combinar tarefa' }).click();
  await expect(semana.getByText('1 de 3')).toBeVisible();
  await capturar(page, 'registro-manu', async () => {
    await page.goto(`/acompanhamento/reunioes/${daManu}`);
    await expect(semana.getByText('1 de 3')).toBeVisible();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
  const tarefas = page.getByRole('region', { name: 'Tarefas', exact: true });
  await expect(tarefas.getByText('Montar o orçamento da casa')).toBeVisible();
  await expect(tarefas.getByText('Anotar os gastos')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Metas', exact: true })).toHaveCount(0);
  await capturar(page, 'ficha-manu', async () => {
    await page.goto(`/acompanhamento/ficha/${inscricao}?aba=jornada`);
    await expect(tarefas.getByText('Montar o orçamento da casa')).toBeVisible();
  });
});
