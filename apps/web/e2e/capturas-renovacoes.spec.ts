import { test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-79: capturas da aba "Renovações e gestão", da janelinha e da ficha renovada em 375, 768, 1024 e 1440, claro e
// escuro. Só roda com CAPTURAS=<pasta>: CAPTURAS=<pasta> pnpm --filter @npac/web e2e e2e/capturas-renovacoes.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];
const ids: string[] = [];
let renovada = '';
let aRenovar = '';

// Nomes fictícios. [nomes, mentoria, variante, término em dias, reunião de Renovação: status, dia, "Quer renovar?"]
type Reuniao = [string, number, boolean | null];
const PESSOAS: [string[], string, string | null, number, Reuniao | null][] = [
  [['Bruno Saldanha'], 'RDV', null, 20, ['REALIZADA', -3, true]],
  [['Patrícia Moura', 'Leandro Moura'], '2M', '2 encontros', 45, ['AGENDADA', 6, null]],
  [['Henrique Vasconcelos'], '6M', null, 12, ['REALIZADA', -6, false]],
  [['Vanessa Toledo'], '2M', null, 75, null],
  [['Rogério Pacheco'], 'RDV', null, -5, ['FALTOU', -12, null]],
  [['Juliana Prado', 'Otávio Prado'], 'RDV', null, 26, ['REALIZADA', -1, null]],
  [['Márcia Peixoto'], 'RDV', null, 58, ['CONFIRMADA', 9, null]],
];

async function entrar(page: Page, tema: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
  await page.goto('/login/acompanhamento');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  const hoje = (
    await owner<{ d: string }[]>`select (now() at time zone 'America/Sao_Paulo')::date::text as d`
  )[0]!.d;
  const duda = (await owner<{ id: string }[]>`select id from "user" where username = 'duda'`)[0]!
    .id;
  for (const [nomes, mentoria, variante, dias, r] of PESSOAS) {
    const [i] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, mentoria_variante, status, inicio_jornada, termino_previsto,
        responsavel_id)
      values (${nomes.length > 1 ? 'CASAL' : 'INDIVIDUAL'}, ${mentoria}, ${variante}, 'ATIVO',
        ((${hoje}::date + ${dias}::int) - interval '12 months')::date, ${hoje}::date + ${dias}::int, ${duda})
      returning id`;
    for (const [k, n] of nomes.entries())
      await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
        values (${i!.id}, ${k + 1}, ${n}, ${n.toLowerCase()})`;
    if (r)
      await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status, interesse_renovar)
        values (${i!.id}, 'RENOVACAO', ${duda}, (${hoje}::date + ${r[1]}::int)::timestamp + interval '14 hours',
          ${r[0]}, ${r[2]})`;
    ids.push(i!.id);
  }
  aRenovar = ids[0]!;
  // Renovou há 8 dias (RDV → 2M): está no mês 13 de 24.
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', '2M', 'ATIVO', (${hoje}::date - interval '12 months' - interval '10 days')::date,
      (${hoje}::date + interval '12 months' - interval '10 days')::date, ${duda})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, 'Adriana Lopes', 'adriana lopes')`;
  await owner`insert into mentoria_renovacoes (inscricao_id, ano, data, mentoria_anterior, mentoria_nova,
      termino_anterior, termino_novo, status_anterior)
    values (${i!.id}, 2, ${hoje}::date - 8, 'RDV', '2M', (${hoje}::date - 10), (${hoje}::date + interval '12 months'
      - interval '10 days')::date, 'ATIVO')`;
  renovada = i!.id;
  ids.push(i!.id);
});
test.afterAll(async () => {
  for (const id of ids) await owner`delete from mentoria_inscricoes where id = ${id}`;
  await closeTestConnections();
});

for (const tema of ['light', 'dark'] as const) {
  const sufixo = tema === 'dark' ? '-escuro' : '';
  for (const largura of LARGURAS) {
    test(`renovações em ${largura} (${tema})`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 1000 });
      await entrar(page, tema);
      await page.goto('/acompanhamento/renovacoes');
      await page.getByRole('heading', { level: 1, name: 'Renovações e gestão' }).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${PASTA}/aba-${largura}${sufixo}.png`, fullPage: true });

      await page.goto(`/acompanhamento/ficha/${aRenovar}?aba=jornada`);
      await page.getByRole('button', { name: 'Registrar renovação', exact: true }).click();
      await page.getByRole('dialog', { name: 'Registrar renovação' }).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${PASTA}/janela-${largura}${sufixo}.png` });

      await page.goto(`/acompanhamento/ficha/${renovada}?aba=jornada`);
      await page.getByText('Renovado em', { exact: false }).first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${PASTA}/ficha-${largura}${sufixo}.png` });
    });
  }
}
