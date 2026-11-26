import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-60, tarefa 6: o card "PME atual" agrupa o cronograma (Acompanhamento marca e a % muda) e a aba
// "Cronograma" da ficha mostra o PME do sistema, o 1º PME da planilha, o RDV (outra inscrição da mesma
// pessoa) e o "Já tinha antes". A Especialista não vê a aba nem os itens.
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOME = 'Mentorado Fictício 163';
const WHATS = 'e2e-cronograma-aba';
const PREFIXO = 'CR Aba';
const LARGURAS = [375, 768, 1024, 1440] as const;
const BLOCOS = ['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP'] as const;
const NOMES = {
  EXPERIENCIA: 'Experiência',
  DESAFIO: 'Desafio',
  FILME: 'Filme',
  LIVRO: 'Livro',
  EAP: 'EAP',
};

test.describe.configure({ mode: 'serial' });

let rdv = '';
let dois = '';
const item: Record<string, string> = {};
const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

async function inscricao(mentoria: string, status: string) {
  const [i] = await owner.unsafe<{ id: string }[]>(
    `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr,
       termino_previsto, responsavel_id)
     select 'INDIVIDUAL', '${mentoria}', '${status}', ${HOJE} - 90, ${HOJE} - 90, ${HOJE} + 275, id
     from "user" where username = 'duda' returning id`,
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx)
    values (${i!.id}, 1, ${NOME}, ${norm(NOME)}, ${WHATS})`;
  return i!.id;
}

async function entrar(page: Page, usuario: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeAll(async ({ browser }) => {
  await owner`truncate rate_limit`;
  await owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO} %`}`;
  for (const b of BLOCOS)
    for (let n = 1; n <= 5; n++) {
      const t = `${PREFIXO} ${NOMES[b]} ${n}${b === 'EAP' ? ` https://www.youtube.com/watch?v=e2e${n}` : ''}`;
      const [r] = await owner<{ id: string }[]>`
        insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem)
        values (${b}, ${t}, ${norm(t)}, ${-800 + n}) returning id`;
      item[`${b}${n}`] = r!.id;
    }
  rdv = await inscricao('RDV', 'CONCLUIDO');
  dois = await inscricao('2M', 'ATIVO');
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
     values ('${dois}', 1, ${HOJE} - 60, ${HOJE} - 31)`,
  );
  // RDV: 3 itens (outra inscrição). 2M: 1º PME da planilha (um "não fez" e um EAP) e um livro "já tinha".
  await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado)
    values (${rdv}, ${item.EXPERIENCIA1!}, 1, 'RECEBIDO'), (${rdv}, ${item.DESAFIO1!}, 2, 'RECEBIDO'),
      (${rdv}, ${item.FILME1!}, 2, 'RECEBIDO'),
      (${dois}, ${item.EXPERIENCIA2!}, 1, 'NAO_FEZ'), (${dois}, ${item.DESAFIO2!}, 1, 'RECEBIDO'),
      (${dois}, ${item.EAP1!}, 1, 'RECEBIDO'), (${dois}, ${item.LIVRO1!}, null, 'JA_TINHA')`;
  // A Especialista conduz uma reunião da 2M (vê a ficha, não o cronograma).
  await owner.unsafe(
    `insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, plataforma, status)
     select '${dois}', 'POSICIONAMENTO', id, now() - interval '3 days', 'MEET', 'REALIZADA'
     from "user" where username = 'manu'`,
  );
  // O 2º PME sai com a sugestão do modelo (8 itens), pela API, como a Duda.
  const page = await browser.newPage();
  await entrar(page, 'duda');
  const r = await page.request.post(`/api/mentoria/inscricoes/${dois}/ciclos`, {
    data: {
      cronograma: [
        { itemId: item.EXPERIENCIA3, bloco: 'EXPERIENCIA' },
        { itemId: item.DESAFIO3, bloco: 'DESAFIO' },
        { itemId: item.FILME2, bloco: 'FILME' },
        { itemId: item.FILME3, bloco: 'FILME' },
        { itemId: item.LIVRO2, bloco: 'LIVRO' },
        { itemId: item.EAP2, bloco: 'EAP' },
        { itemId: item.EAP3, bloco: 'EAP' },
        { itemId: item.EAP4, bloco: 'EAP' },
      ],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  await page.close();
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  for (const id of [rdv, dois])
    if (id) await owner`delete from mentoria_inscricoes where id = ${id}`;
  await owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO} %`}`;
  await closeTestConnections();
});

test('Duda: marca um filme como feito no card e vê a aba Cronograma', async ({ page }) => {
  await entrar(page, 'duda');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/acompanhamento/ficha/${dois}?aba=jornada`);
  const card = page.getByRole('region', { name: 'PME atual' });
  const grupo = card.locator('.cr-grupo-h');
  await expect(grupo).toContainText('0 de 8 feitos');
  const pct = card.getByRole('meter', { name: 'Tarefas do 2º PME' });
  const antes = await pct.getAttribute('aria-valuenow');
  // O comprovante só aparece depois de feito.
  const filme = card.locator('li.pme-tarefa').filter({ hasText: `${PREFIXO} Filme 2` });
  await expect(filme.getByRole('button', { name: 'Anexar comprovante' })).toHaveCount(0);
  await expect(filme.locator('.pme-orig')).toHaveText('Filme');
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/mentoria/tarefas/') && r.request().method() === 'PATCH',
    ),
    filme.getByRole('button', { name: `Marcar feita: ${PREFIXO} Filme 2` }).click(),
  ]);
  await expect(grupo).toContainText('1 de 8 feitos');
  await expect(pct).not.toHaveAttribute('aria-valuenow', antes ?? '');
  await expect(filme.getByRole('button', { name: 'Anexar comprovante' })).toBeVisible();

  await page.getByRole('tab', { name: 'Cronograma' }).click();
  const aba = page.getByRole('tabpanel', { name: 'Cronograma' });
  await expect(aba).toHaveAttribute('aria-busy', 'false');
  await expect(aba.getByText('itens recebidos, contando o RDV. Nada se repete.')).toBeVisible();
  const g2 = aba
    .locator('.cr-grupo')
    .filter({ has: page.getByRole('heading', { name: /^2º PME/ }) });
  await expect(g2.locator('h3')).toContainText('1 de 8 feitos');
  await expect(g2).toContainText('enviado em');
  await expect(g2.locator('.pl-mod').filter({ hasText: `${PREFIXO} Filme 2` })).toContainText(
    'Feita',
  );
  await expect(g2.locator('.pl-mod').filter({ hasText: `${PREFIXO} EAP 2` })).toContainText(
    'EAP · youtube.com',
  );
  const g1 = aba
    .locator('.cr-grupo')
    .filter({ has: page.getByRole('heading', { name: /^1º PME/ }) });
  await expect(g1).toContainText('antes do sistema · da planilha');
  await expect(g1.locator('.pl-mod').filter({ hasText: `${PREFIXO} Experiência 2` })).toContainText(
    'Não fez',
  );
  await expect(g1.getByRole('button', { name: 'e mais 1 EAP' })).toBeVisible();
  const noRdv = aba
    .locator('.cr-grupo')
    .filter({ has: page.getByRole('heading', { name: /^No RDV/ }) });
  await expect(noRdv.locator('h3')).toContainText('3');
  await expect(noRdv).toContainText('outra inscrição');
  await expect(aba.locator('.cr-grupo').filter({ hasText: 'Já tinha antes' })).toContainText(
    `${PREFIXO} Livro 1`,
  );

  // Filtro "Filmes": só os filmes (o do 2º PME e o do RDV).
  await aba
    .getByRole('group', { name: 'Bloco do cronograma' })
    .getByRole('button', { name: /^Filmes/ })
    .click();
  await expect(aba.locator('.pl-mod .t')).toHaveText([
    `${PREFIXO} Filme 2`,
    `${PREFIXO} Filme 3`,
    `${PREFIXO} Filme 1`,
  ]);

  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra, `rolagem lateral em ${largura}px`).toBeLessThanOrEqual(0);
  }
});

test('Especialista: sem a aba nem o cronograma no card; o link cai na Jornada', async ({
  page,
}) => {
  await entrar(page, 'manu');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/acompanhamento/ficha/${dois}?aba=cronograma`);
  await expect(page.getByRole('tab', { name: 'Jornada' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Cronograma' })).toHaveCount(0);
  const card = page.getByRole('region', { name: 'PME atual' });
  await expect(card.getByText('2º PME', { exact: true })).toBeVisible();
  await expect(card.locator('.cr-grupo-h')).toHaveCount(0);
  await expect(card.getByText(`${PREFIXO} Filme 2`)).toHaveCount(0);
  const r = await page.request.get(`/api/mentoria/inscricoes/${dois}/cronograma`);
  expect(r.status()).toBe(404);
});
