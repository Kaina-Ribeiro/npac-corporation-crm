import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas do cronograma (NPAC-60) para comparar com o protótipo v2 (docs/acompanhamento/prototipo/cronograma/),
// na mesma história: a pessoa fez o RDV, está na 2M e recebe o 2º PME. Claro e escuro, 375/768/1024/1440.
// Só roda com CAPTURAS=<pasta>: CAPTURAS=<pasta> pnpm --filter @npac/web e2e e2e/capturas-cronograma.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
test.describe.configure({ mode: 'serial' });
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440] as const;
const TEMAS = [
  ['light', 'claro'],
  ['dark', 'escuro'],
] as const;
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOME = 'Mentorado Fictício 164';
const WHATS = 'capturas-cronograma';
const YT = ' https://www.youtube.com/watch?v=x';

/** Itens genéricos do banco da planilha (material do programa), na ordem do protótipo. */
const BANCO = {
  EXPERIENCIA: [
    'A partir das 19h, apagar as luzes e deixá-las desligadas',
    'Fazer um quadro do sonhos com recortes de imagens em uma cartolina',
    'Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).',
    'Cozinhar uma receita nova em família',
  ],
  DESAFIO: [
    'Durante 3 dias colocar despertador no celular de uma em uma hora com a escrita: isso que estou prestes a fazer está me aproximando ou distanciando dos meus sonhos?',
    'Passar 24 horas em jejum, ingerindo apenas água. (Ao iniciar e ao finalizar o jejum, envie uma foto com o horário no grupo.)',
    'Fazer 100 agachamentos em um único dia. (Grave um pequeno vídeo realizando parte dos agachamentos ou envie uma foto ao concluir.)',
    'Guardar o máximo de dinheiro que conseguir',
    'Dormir no chão durante uma noite. (Envie uma foto do local onde dormiu.)',
    'Durante 7 dias, beber pelo menos 3 litros de água por dia. (Envie uma foto da garrafa utilizada ou um registro diário da quantidade consumida.)',
    'Durante 30 dias, manter sua cama arrumada antes de sair do quarto. (Envie uma foto da cama arrumada no primeiro e no último dia do desafio.)',
    'Durante 7 dias, fazer pelo menos um elogio sincero por dia para alguém.',
    'Ficar 12 horas sem utilizar cadeira.',
  ],
  FILME: [
    'Um sonho possível',
    'Coach Carter',
    'O Pacto',
    'Pra Sempre Vencedor',
    'À procura da felicidade',
  ],
  LIVRO: [
    'Comece pelo Porquê',
    'Pai Rico, Pai Pobre',
    'Os Segredos da Mente Milionária',
    'Em busca de um sentido',
    'O poder do hábito',
  ],
  EAP: [
    `COMO SAIR DO LUGAR${YT}`,
    `A MENTE DO VENCEDOR${YT}`,
    `DISCIPLINA É LIBERDADE${YT}`,
    `POR QUE É TÃO DIFÍCIL MUDAR${YT}`,
    `INTELIGENCIA LTDA${YT}`,
    `O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER${YT}`,
    `O PODER DA DECISÃO${YT}`,
  ],
} as const;
type B = keyof typeof BANCO;
const id: Record<string, string> = {};
const chave = (b: B, n: number) => `${b}${n}`;
let rdv = '';
let dois = '';

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
     select 'INDIVIDUAL', '${mentoria}', '${status}', ${HOJE} - 120, ${HOJE} - 120, ${HOJE} + 245, id
     from "user" where username = 'duda' returning id`,
  );
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx)
    values (${i!.id}, 1, ${NOME}, ${norm(NOME)}, ${WHATS})`;
  return i!.id;
}

async function entrar(page: Page, tema: string) {
  await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const limpar = async () => {
  for (const i of [rdv, dois]) if (i) await owner`delete from mentoria_inscricoes where id = ${i}`;
  const todos = Object.values(BANCO).flat();
  await owner`delete from mentoria_cronograma_itens where texto = any(${todos})`;
};

test.beforeAll(async () => {
  await owner`truncate rate_limit`;
  await limpar();
  for (const b of Object.keys(BANCO) as B[])
    for (const [k, t] of BANCO[b].entries()) {
      const [r] = await owner<{ id: string }[]>`
        insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem, ativo)
        values (${b}, ${t}, ${norm(t)}, ${-700 + k}, ${!t.startsWith('Guardar')}) returning id`;
      id[chave(b, k + 1)] = r!.id;
    }
  rdv = await inscricao('RDV', 'CONCLUIDO');
  dois = await inscricao('2M', 'ATIVO');
  await owner.unsafe(
    `insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
     values ('${dois}', 1, ${HOJE} - 33, ${HOJE} - 2)`,
  );
  const ant: [string, string, number | null, string][] = [
    [rdv, id.EXPERIENCIA1!, 4, 'RECEBIDO'],
    [rdv, id.DESAFIO5!, 6, 'RECEBIDO'],
    [dois, id.EXPERIENCIA2!, 1, 'NAO_FEZ'],
    [dois, id.DESAFIO1!, 1, 'RECEBIDO'],
    [dois, id.FILME1!, 1, 'RECEBIDO'],
    [dois, id.FILME2!, 1, 'RECEBIDO'],
    [dois, id.LIVRO1!, 1, 'RECEBIDO'],
    [dois, id.EAP1!, 1, 'RECEBIDO'],
    [dois, id.EAP2!, 1, 'RECEBIDO'],
    [dois, id.EAP3!, 1, 'RECEBIDO'],
    [dois, id.LIVRO2!, null, 'JA_TINHA'],
    [dois, id.LIVRO3!, null, 'JA_TINHA'],
    [dois, id.FILME3!, 2, 'PLANEJADO'],
  ];
  for (const [i, item, n, r] of ant)
    await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado)
      values (${i}, ${item}, ${n}, ${r})`;
});
test.afterAll(async () => {
  await limpar();
  await closeTestConnections();
});

async function abrirEnvio(page: Page) {
  await page.goto(`/acompanhamento/ficha/${dois}?aba=jornada`);
  await page
    .getByRole('region', { name: 'PME atual' })
    .getByRole('button', { name: 'Registrar envio do 2º PME' })
    .click();
  const janela = page.getByRole('dialog', { name: 'Enviar o 2º PME' });
  await expect(janela.getByText('8 itens do cronograma')).toBeVisible();
  return janela;
}

for (const [tema, nome] of TEMAS)
  test(`envio e troca, ${nome}`, async ({ page }) => {
    await entrar(page, tema);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 1000 });
      const janela = await abrirEnvio(page);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `${PASTA}/envio-${largura}-${nome}.png`,
        animations: 'disabled',
      });
      await janela.getByRole('button', { name: /^Trocar: Passar 24 horas/ }).click();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${PASTA}/envio-trocar-${largura}-${nome}.png`,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(janela).toBeHidden();
    }
  });

test('envia o 2º PME e marca o resultado de alguns itens', async ({ page }) => {
  await entrar(page, 'light');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const janela = await abrirEnvio(page);
  await janela.getByRole('button', { name: 'Enviar o 2º PME' }).click();
  await expect(janela).toBeHidden();
  const tarefas = await owner<{ id: string; version: number; item: string }[]>`
    select t.id, t.version, t.cronograma_item_id::text as item from mentoria_tarefas t
    join mentoria_ciclos c on c.id = t.ciclo_id
    where c.inscricao_id = ${dois} and c.numero = 2 and t.origem = 'PME'`;
  const marcar = async (item: string, status: string, motivo?: string) => {
    const t = tarefas.find((x) => x.item === item)!;
    const r = await page.request.patch(`/api/mentoria/tarefas/${t.id}`, {
      data: { version: t.version, status },
    });
    expect(r.status(), await r.text()).toBe(200);
    if (motivo) {
      const v = ((await r.json()) as { version: number }).version;
      await page.request.patch(`/api/mentoria/tarefas/${t.id}`, { data: { version: v, motivo } });
    }
  };
  await marcar(id.EXPERIENCIA3!, 'FEITA');
  await marcar(id.DESAFIO2!, 'NAO_FEITA', 'viajou a trabalho');
  await marcar(id.FILME3!, 'FEITA');
  await marcar(id.FILME4!, 'FEITA');
});

for (const [tema, nome] of TEMAS)
  test(`card, aba e banco, ${nome}`, async ({ page }) => {
    await entrar(page, tema);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 1000 });
      await page.goto(`/acompanhamento/ficha/${dois}?aba=jornada`);
      const grupo = page.locator('.pme-ciclo.atual .cr-grupo-h');
      await expect(grupo).toContainText('3 de 8 feitos');
      await page
        .locator('.pme-cab')
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -12));
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${PASTA}/card-${largura}-${nome}.png`,
        animations: 'disabled',
      });

      await page.goto(`/acompanhamento/ficha/${dois}?aba=cronograma`);
      await expect(page.getByRole('tabpanel', { name: 'Cronograma' })).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${PASTA}/aba-${largura}-${nome}.png`,
        fullPage: true,
        animations: 'disabled',
      });

      await page.goto('/acompanhamento/configuracoes?aba=cronograma');
      await page
        .getByRole('group', { name: 'Bloco do cronograma' })
        .getByRole('button', { name: /^Desafios/ })
        .click();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${PASTA}/banco-${largura}-${nome}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
