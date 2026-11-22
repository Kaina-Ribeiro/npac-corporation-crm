import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-57: aba Evolução na ficha do mentorado (spec 2026-11-21, §5) e o PDF (§5.7), por perfil.
const owner = ownerSql(E2E_DB);

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
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
/** PNG 1×1 válido (o servidor confere a assinatura e limpa os metadados). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let inscricao = '';
const ficha = () => `/acompanhamento/ficha/${inscricao}`;
const aba = (page: Page) => page.getByRole('tabpanel', { name: 'Evolução' });

async function abrir(page: Page) {
  await page.goto(`${ficha()}?aba=evolucao`);
  // A aba busca a evolução ao abrir: espera os cartões.
  await expect(aba(page).getByText('Como chegaram e como estão agora')).toBeVisible();
  await expect(aba(page)).toHaveAttribute('aria-busy', 'false');
}

test.beforeAll(async ({ browser }) => {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
     values ('CASAL', 'RDV', 'ATIVO', ${HOJE} - 40, ${HOJE} - 40, ${HOJE} + 325)
     returning id`,
  );
  inscricao = i!.id;
  const pessoas = await owner<{ id: string }[]>`insert into mentoria_pessoas
    (inscricao_id, ordem, nome, nome_norm) values
    (${inscricao}, 1, 'Mentorada Fictícia 57', 'mentorada ficticia 57'),
    (${inscricao}, 2, 'Mentorado Fictício 58', 'mentorado ficticio 58')
    returning id`;
  await owner`insert into mentoria_avaliacoes (pessoa_id, tipo, momento, nota_fe, nota_saude,
      nota_dinheiro, nota_relacionamentos)
    values (${pessoas[0]!.id}, 'PILARES', 'INICIAL', 8, 6, 3, 7),
      (${pessoas[1]!.id}, 'PILARES', 'INICIAL', 6, 8, 4, 9)`;
  // Dor, sonho e meta são cifrados: entram pela API, como a equipe faria na aba Momento inicial.
  const page = await browser.newPage();
  await entrar(page, 'duda');
  const r = await page.request.put(`/api/mentoria/inscricoes/${inscricao}/momento`, {
    data: {
      version: 0,
      dor: 'Trabalham muito e nunca sobra nada.',
      sonho: 'Casa da família.',
      meta: 'Quitar as dívidas.',
      recebeCentavos: 1_200_000,
      dividasCentavos: 3_800_000,
    },
  });
  expect(r.ok()).toBe(true);
  await page.close();
});

test('duda edita um cartão só pelo teclado e o texto fica depois de recarregar', async ({
  page,
}) => {
  await entrar(page, 'duda');
  await abrir(page);
  const cartao = aba(page).getByRole('button', { name: 'Editar evolução de renda' });
  await cartao.focus();
  await page.keyboard.press('Enter');
  const caixa = aba(page).getByRole('textbox', { name: 'Evolução de renda' });
  await expect(caixa).toBeFocused();
  await page.keyboard.type('De R$ 12 mil para R$ 21 mil por mês.');
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast-region')).toContainText('Salvo');
  await expect(aba(page).getByText('De R$ 12 mil para R$ 21 mil por mês.')).toBeVisible();
  await page.reload();
  await expect(aba(page).getByText('De R$ 12 mil para R$ 21 mil por mês.')).toBeVisible();
  // Da aba Momento inicial, só leitura; os pontos de partida vêm dos valores e notas de lá.
  await expect(aba(page).getByText('Trabalham muito e nunca sobra nada.')).toBeVisible();
  await expect(aba(page).getByText('Pontos de partida')).toBeVisible();
  await expect(aba(page).getByText('R$ 12.000')).toBeVisible();
});

test('duda escreve o momento atual com rótulo em negrito e vê quem atualizou', async ({ page }) => {
  await entrar(page, 'duda');
  await abrir(page);
  await aba(page).getByRole('button', { name: 'Editar momento atual' }).click();
  const caixa = aba(page).getByRole('textbox', { name: 'Tópicos do momento atual' });
  await caixa.fill('Reserva: seis meses de custo guardados\nQuitaram o cartão em junho.');
  await aba(page).getByRole('button', { name: 'Pronto' }).click();
  await expect(aba(page).locator('.mc.atual .tp b', { hasText: 'Reserva:' })).toBeVisible();
  await expect(aba(page).getByText('Quitaram o cartão em junho.')).toBeVisible();
  await expect(aba(page).getByText(/^Atualizado em \d{2}\/\d{2}\/\d{4} por Duda$/)).toBeVisible();
  // A foto sobe a version: o próximo texto salvo não pode dar conflito.
  await aba(page).getByLabel('Foto do momento atual').setInputFiles({
    name: 'atual.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(
    aba(page).getByRole('img', { name: 'Foto do casal no momento atual' }),
  ).toBeVisible();
  await aba(page).getByRole('button', { name: 'Editar evolução na saúde' }).click();
  await aba(page)
    .getByRole('textbox', { name: 'Evolução na saúde' })
    .fill('Treinam 4x por semana.');
  await aba(page).getByRole('button', { name: 'Editar momento inicial' }).click();
  await expect(page.locator('.saved')).toHaveText('Tudo salvo');
  await page.reload();
  await expect(aba(page).getByText('Treinam 4x por semana.')).toBeVisible();
});

test('duda adiciona uma conquista com foto e remove com a confirmação', async ({ page }) => {
  await entrar(page, 'duda');
  await abrir(page);
  await expect(aba(page).getByText('Nenhuma conquista ainda.')).toBeVisible();
  await aba(page).getByRole('button', { name: 'Adicionar conquista' }).click();
  const dlg = page.getByRole('dialog', { name: 'Adicionar conquista' });
  await expect(dlg.getByRole('button', { name: 'Adicionar' })).toBeDisabled();
  await dlg.getByLabel('Foto ou vídeo').setInputFiles({
    name: 'conquista.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await dlg.getByLabel('Descrição').fill('Quitaram o cartão de crédito');
  await dlg.getByRole('button', { name: 'Adicionar' }).click();
  await expect(dlg).toBeHidden();
  await expect(aba(page).getByText('1 · da mais antiga à mais recente')).toBeVisible();
  await expect(aba(page).getByRole('img', { name: 'Quitaram o cartão de crédito' })).toBeVisible();

  page.once('dialog', (d) => {
    expect(d.message()).toBe('Remover essa conquista?');
    void d.accept();
  });
  await aba(page).getByRole('button', { name: 'Remover' }).click();
  await expect(aba(page).getByText('Nenhuma conquista ainda.')).toBeVisible();
  const [linha] = await owner<{ n: number }[]>`
    select count(*)::int as n from mentoria_conquistas where inscricao_id = ${inscricao}`;
  expect(linha!.n).toBe(0);
});

test('a vista "Linha do tempo" fica lembrada depois de recarregar', async ({ page }) => {
  await entrar(page, 'duda');
  await abrir(page);
  const vistas = aba(page).getByRole('group', { name: 'Como ver os dois momentos' });
  await vistas.getByRole('button', { name: 'Linha do tempo' }).click();
  await expect(aba(page).locator('.mom')).toHaveClass(/linha/);
  await page.reload();
  await expect(vistas.getByRole('button', { name: 'Linha do tempo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(aba(page).locator('.mom')).toHaveClass(/linha/);
  // Abrindo pelo menu (sem `?aba=`), a aba lembrada é a Evolução.
  await page.goto(ficha());
  await expect(aba(page)).toBeVisible();
  await vistas.getByRole('button', { name: 'Lado a lado' }).click();
});

test('operacao vê a aba só para ler: sem editar, sem adicionar e sem cartão vazio', async ({
  page,
}) => {
  await entrar(page, 'operacao');
  await abrir(page);
  await expect(aba(page).getByText('De R$ 12 mil para R$ 21 mil por mês.')).toBeVisible();
  await expect(aba(page).getByRole('button', { name: /^Editar/ })).toHaveCount(0);
  await expect(aba(page).getByRole('button', { name: 'Adicionar conquista' })).toHaveCount(0);
  await expect(aba(page).getByLabel('Foto do momento atual')).toHaveCount(0);
  // Reserva e área de atuação ficaram vazias: para quem só lê, o cartão some.
  await expect(aba(page).getByText('Reserva financeira')).toHaveCount(0);
  await expect(aba(page).getByText('não informado')).toHaveCount(0);
  await expect(aba(page).getByText('Clique num texto para editar.')).toHaveCount(0);
  await expect(aba(page).getByRole('link', { name: 'Baixar PDF' })).toBeVisible();
});

test('manu (Especialista) não vê a aba; o link com ?aba=evolucao abre a Jornada', async ({
  page,
}) => {
  await owner`update mentoria_inscricoes set responsavel_id = null where id = ${inscricao}`;
  // A Especialista só vê inscrições de reuniões que conduz: uma reunião dela abre a ficha.
  await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, plataforma, status)
    select ${inscricao}, 'POSICIONAMENTO', id, now() - interval '2 hours', 'MEET', 'REALIZADA'
    from "user" where username = 'manu'`;
  await entrar(page, 'manu');
  await page.goto(`${ficha()}?aba=evolucao`);
  await expect(page.getByRole('tabpanel', { name: 'Jornada' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Evolução' })).toHaveCount(0);
  const r = await page.request.get(`/api/mentoria/inscricoes/${inscricao}/evolucao`);
  expect(r.status()).toBe(404);
});

test('duas abas editando campos diferentes do mesmo mentorado não perdem nenhum', async ({
  browser,
}) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  await entrar(a, 'duda');
  // Mesma sessão nas duas abas (cookies do mesmo contexto não se repetem entre páginas novas).
  await b.context().addCookies(await a.context().cookies());
  await abrir(a);
  await abrir(b);
  await aba(a).getByRole('button', { name: 'Editar área de atuação' }).click();
  await aba(a).getByRole('textbox', { name: 'Área de atuação' }).fill('Consultório próprio.');
  await aba(a).getByText('Como chegaram e como estão agora').click();
  await expect(a.locator('.saved')).toHaveText('Tudo salvo');
  // A segunda aba ainda tem a version de antes: o 409 recarrega e reaplica o campo dela.
  await aba(b).getByRole('button', { name: 'Editar investimentos feitos na mentoria' }).click();
  await aba(b)
    .getByRole('textbox', { name: 'Investimentos feitos na mentoria' })
    .fill('Tesouro IPCA.');
  await aba(b).getByText('Como chegaram e como estão agora').click();
  await expect(b.locator('.saved')).toHaveText('Tudo salvo');
  await a.reload();
  await expect(aba(a).getByText('Consultório próprio.')).toBeVisible();
  await expect(aba(a).getByText('Tesouro IPCA.')).toBeVisible();
  await a.close();
  await b.close();
});
