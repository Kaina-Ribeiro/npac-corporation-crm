import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-60, tarefa 5: a Operação monta o 2º PME pela Fila (a mesma janela do card da ficha). A pessoa
// fez o RDV e está na 2M (mesmo WhatsApp): o desafio do RDV vem apagado e não clica; o filme que a
// planilha guardou para este PME vem marcado; um EAP "só para ele" entra; o card mostra o grupo.
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOME = 'Mentorado Fictício 161';
const WHATS = 'e2e-cronograma-envio';
const PREFIXO = 'CR Envio';
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
const texto = (b: (typeof BLOCOS)[number], n: number) =>
  `${PREFIXO} ${NOMES[b]} ${n}${b === 'EAP' ? ` https://www.youtube.com/watch?v=e2e${n}` : ''}`;
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
     select 'INDIVIDUAL', '${mentoria}', '${status}', ${HOJE} - 60, ${HOJE} - 60, ${HOJE} + 305, id
     from "user" where username = 'duda' returning id`,
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx)
    values (${i!.id}, 1, ${NOME}, ${norm(NOME)}, ${WHATS})`;
  return i!.id;
}

const limpar = async () => {
  for (const id of [rdv, dois])
    if (id) await owner`delete from mentoria_inscricoes where id = ${id}`;
  await owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO} %`}`;
};

test.beforeAll(async () => {
  await owner`delete from mentoria_cronograma_itens where texto like ${`${PREFIXO} %`}`;
  // 4 itens por bloco, antes de qualquer outro do banco (ordem negativa).
  for (const b of BLOCOS)
    for (let n = 1; n <= 4; n++) {
      const t = texto(b, n);
      const [r] = await owner<{ id: string }[]>`
        insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem)
        values (${b}, ${t}, ${norm(t)}, ${-1000 + n}) returning id`;
      item[`${b}${n}`] = r!.id;
    }
  rdv = await inscricao('RDV', 'CONCLUIDO');
  dois = await inscricao('2M', 'ATIVO');
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
     values ('${dois}', 1, ${HOJE} - 30, ${HOJE} - 2)`,
  );
  // O desafio 1 foi no RDV; o filme 3 estava na planilha para o 2º PME da 2M.
  await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado)
    values (${rdv}, ${item.DESAFIO1!}, 3, 'RECEBIDO'), (${dois}, ${item.FILME3!}, 2, 'PLANEJADO')`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await limpar();
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

test('Operação: monta o 2º PME pela Fila, troca o desafio e envia com um EAP só para ele', async ({
  page,
}) => {
  await entrar(page, 'operacao');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole('link', { name: 'Fila do dia', exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/fila/);
  const linha = page
    .locator('li.fr')
    .filter({ hasText: NOME })
    .filter({ hasText: 'Enviar o 2º PME' });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: 'Registrar envio' }).click();

  const janela = page.getByRole('dialog', { name: 'Enviar o 2º PME' });
  await expect(janela.getByText('8 itens do cronograma')).toBeVisible();
  await expect(
    janela.getByText(`Já vem com o que ${NOME} ainda não recebeu, nem no RDV.`),
  ).toBeVisible();
  const planejado = janela.getByRole('button', { name: `Trocar: ${PREFIXO} Filme 3` });
  await expect(planejado).toContainText('Estava na planilha para este PME');
  await expect(janela.getByRole('button', { name: `Trocar: ${PREFIXO} Desafio 1` })).toHaveCount(0);
  await expect(janela.getByRole('button', { name: `Trocar: ${PREFIXO} EAP 1` })).toContainText(
    'Vídeo · youtube.com',
  );

  // Trocar o desafio: caixa suspensa com a busca primeiro; o do RDV vem apagado e não escolhe.
  await janela.getByRole('button', { name: `Trocar: ${PREFIXO} Desafio 2` }).click();
  const troca = page.getByRole('dialog', { name: 'Trocar desafio' });
  await expect(troca.getByRole('searchbox', { name: 'Trocar por outro desafio' })).toBeFocused();
  await expect(troca.getByText('Já recebeu · não dá para repetir')).toBeVisible();
  const doRdv = troca.locator('.cr-op.off').filter({ hasText: `${PREFIXO} Desafio 1` });
  await expect(doRdv).toContainText('RDV');
  await expect(doRdv).toHaveAttribute('aria-disabled', 'true');
  await expect(troca.getByRole('button', { name: `${PREFIXO} Desafio 1` })).toHaveCount(0);
  await troca.getByRole('searchbox').fill('desafio 3');
  await troca.getByRole('button', { name: `${PREFIXO} Desafio 3` }).click();
  await expect(troca).toBeHidden();
  await expect(janela.getByRole('button', { name: `Trocar: ${PREFIXO} Desafio 3` })).toBeVisible();
  await expect(janela.getByRole('button', { name: `Trocar: ${PREFIXO} Desafio 2` })).toHaveCount(0);

  // Um EAP escrito só para ele.
  await janela.getByRole('button', { name: 'Adicionar EAP' }).click();
  const add = page.getByRole('dialog', { name: 'Adicionar EAP' });
  await add.getByRole('button', { name: 'Escrever só para ele' }).click();
  await add.getByLabel(/Item só desta pessoa/).fill(`${PREFIXO} vídeo só dele`);
  await add.getByRole('button', { name: 'Incluir no PME' }).click();
  await expect(janela.getByText('9 itens do cronograma')).toBeVisible();
  await expect(
    janela.getByRole('button', { name: `Trocar: ${PREFIXO} vídeo só dele` }),
  ).toContainText('Só desta pessoa');

  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra, `rolagem lateral em ${largura}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/api/mentoria/inscricoes/${dois}/ciclos`) && r.status() === 201,
    ),
    janela.getByRole('button', { name: 'Enviar o 2º PME' }).click(),
  ]);
  await expect(janela).toBeHidden();
  await expect(linha).toHaveCount(0);

  const [t] = await owner<{ n: number; planejado: string | null }[]>`
    select count(*)::int as n,
      (select tarefa_id::text from mentoria_cronograma_anteriores
        where inscricao_id = ${dois} and item_id = ${item.FILME3!}) as planejado
    from mentoria_tarefas t join mentoria_ciclos c on c.id = t.ciclo_id
    where c.inscricao_id = ${dois} and c.numero = 2 and t.origem = 'PME'`;
  expect(t!.n).toBe(9);
  expect(t!.planejado).not.toBeNull();

  // O card da ficha agrupa as tarefas do cronograma; a Operação não marca resultado.
  await page.goto(`/acompanhamento/ficha/${dois}?aba=jornada`);
  const card = page.getByRole('region', { name: 'PME atual' });
  await expect(card.locator('.cr-grupo-h')).toContainText('Cronograma deste PME');
  await expect(card.locator('.cr-grupo-h')).toContainText('0 de 9 feitos');
  await expect(
    card.getByRole('combobox', { name: `Resultado: ${PREFIXO} Desafio 3` }),
  ).toBeDisabled();
});

test('Operação: o mesmo item do RDV não vai na 2M nem pela API', async ({ page }) => {
  await entrar(page, 'operacao');
  const [c] = await owner<{ id: string }[]>`
    select id from mentoria_ciclos where inscricao_id = ${dois} and numero = 2`;
  const r = await page.request.post(`/api/mentoria/ciclos/${c!.id}/cronograma`, {
    data: { cronograma: [{ itemId: item.DESAFIO1, bloco: 'DESAFIO' }] },
  });
  expect(r.status()).toBe(409);
  expect(await r.text()).toContain('Esse item já foi do RDV');
});
