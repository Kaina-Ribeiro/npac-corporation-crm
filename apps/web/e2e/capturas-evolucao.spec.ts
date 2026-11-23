import { test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas da aba Evolução (NPAC-57) e do PDF, claro e escuro, para comparar com o protótipo na mesma largura.
// Só roda com CAPTURAS=<pasta>: CAPTURAS=<pasta> pnpm --filter @npac/web e2e e2e/capturas-evolucao.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
let cheia = '';
let vazia = '';

/** Quadro de cor simples em PNG (foto de exemplo), gerado no navegador. */
async function foto(page: Page, a: string, b: string): Promise<Buffer> {
  const dados = await page.evaluate(
    async ([c1, c2]) => {
      const cv = document.createElement('canvas');
      cv.width = 480;
      cv.height = 360;
      const x = cv.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 480, 360);
      g.addColorStop(0, c1!);
      g.addColorStop(1, c2!);
      x.fillStyle = g;
      x.fillRect(0, 0, 480, 360);
      x.fillStyle = 'rgba(255,255,255,.45)';
      x.beginPath();
      x.arc(240, 150, 70, 0, 7);
      x.fill();
      return cv.toDataURL('image/png').split(',')[1]!;
    },
    [a, b],
  );
  return Buffer.from(dados, 'base64');
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function nova(nome1: string, nome2: string) {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('CASAL', 'RDV', 'ATIVO', ${HOJE} - 300, ${HOJE} - 300, ${HOJE} + 65) returning id`,
  );
  const ps = await owner<{ id: string }[]>`insert into mentoria_pessoas
    (inscricao_id, ordem, nome, nome_norm) values
    (${i!.id}, 1, ${nome1}, ${nome1.toLowerCase()}), (${i!.id}, 2, ${nome2}, ${nome2.toLowerCase()})
    returning id`;
  return { id: i!.id, pessoas: ps.map((p) => p.id) };
}

test.beforeAll(async ({ browser }) => {
  await owner`truncate rate_limit`;
  const c = await nova('Vitor Campos', 'Aline Campos');
  const v = await nova('Bruno Lima', 'Carla Lima');
  cheia = c.id;
  vazia = v.id;
  await owner`insert into mentoria_avaliacoes (pessoa_id, tipo, momento, nota_fe, nota_saude,
      nota_dinheiro, nota_relacionamentos)
    values (${c.pessoas[0]!}, 'PILARES', 'INICIAL', 8, 6, 3, 7),
      (${c.pessoas[1]!}, 'PILARES', 'INICIAL', 6, 8, 4, 9)`;
  const page = await browser.newPage();
  await entrar(page);
  const api = `/api/mentoria/inscricoes/${cheia}`;
  await page.request.put(`${api}/momento`, {
    data: {
      version: 0,
      dor: 'Trabalham muito e nunca sobra nada no fim do mês.',
      sonho: 'Comprar a casa da família sem depender de ninguém.',
      meta: 'Quitar as dívidas e guardar seis meses de custo.',
      recebeCentavos: 1_200_000,
      custoCentavos: 950_000,
      dividasCentavos: 3_800_000,
      guardadoCentavos: 420_000,
    },
  });
  await page.request.put(`${api}/evolucao`, {
    data: {
      version: 0,
      reservaAntes: 'R$ 4.200 guardados, sem reserva de emergência.',
      reservaHoje: 'R$ 48.000 na reserva: seis meses de custo.',
      renda: 'De R$ 12 mil para R$ 21 mil por mês com o consultório novo.',
      saude: 'Vitor perdeu 9 kg. Os dois treinam quatro vezes por semana.',
      investimentos: 'Tesouro IPCA e um terreno em Campo Largo (R$ 85 mil).',
      inicialNotas:
        'Buscavam direção para transformar conhecimento em ação.\nComeçavam e desistiam com frequência.',
      atualNotas:
        'Quitaram a dívida de R$ 38 mil do cartão em junho.\nReserva de seis meses de custo guardada.\nCom o consultório novo da Aline, a renda da casa subiu 75%.\nPilares: o dinheiro foi o que mais mudou; fé e família seguem firmes.',
    },
  });
  await page.request.post(`/api/mentoria/evolucao-atual/${cheia}/midia`, {
    multipart: {
      arquivo: {
        name: 'a.png',
        mimeType: 'image/png',
        buffer: await foto(page, '#d9c39a', '#8f7a55'),
      },
    },
  });
  for (const [data, descricao, a, b] of [
    ['2026-03-12', 'Quitaram o cartão de crédito', '#c9d6c4', '#6f8a6a'],
    ['2026-06-20', 'Primeira viagem em família sem parcelar', '#cfd9e6', '#6d84a3'],
    ['2026-09-05', 'Escritura do terreno em Campo Largo', '#e6d6b8', '#a3855a'],
  ] as const) {
    const r = await page.request.post(`${api}/conquistas`, { data: { data, descricao } });
    const { id } = (await r.json()) as { id: string };
    await page.request.post(`/api/mentoria/conquista/${id}/midia`, {
      multipart: {
        arquivo: { name: 'c.png', mimeType: 'image/png', buffer: await foto(page, a, b) },
      },
    });
  }
  await page.close();
});
test.afterAll(async () => {
  await owner`delete from mentoria_inscricoes where id in (${cheia}, ${vazia})`;
  await closeTestConnections();
});

for (const tema of ['light', 'dark'] as const) {
  test(`aba Evolução, ${tema}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
    await entrar(page);
    for (const [nome, id] of [
      ['cheia', cheia],
      ['vazia', vazia],
    ] as const)
      for (const largura of LARGURAS) {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.goto(`/acompanhamento/ficha/${id}?aba=evolucao`);
        await page
          .getByRole('tabpanel', { name: 'Evolução' })
          .and(page.locator('[aria-busy=false]'))
          .waitFor();
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `${PASTA}/evolucao-${nome}-${tema}-${largura}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/acompanhamento/ficha/${cheia}?aba=evolucao`);
    await page.getByRole('button', { name: 'Linha do tempo' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${PASTA}/evolucao-linha-${tema}-1440.png`, fullPage: true });
    await page.getByRole('button', { name: 'Lado a lado' }).click();
  });
}

test('PDF', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await entrar(page);
  await page.setViewportSize({ width: 1000, height: 1200 });
  await page.goto(`/acompanhamento/ficha/${cheia}/evolucao/pdf`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${PASTA}/evolucao-pdf-tela.png`, fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${PASTA}/evolucao.pdf`, preferCSSPageSize: true, printBackground: true });
});
