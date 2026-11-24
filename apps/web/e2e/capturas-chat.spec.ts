import { test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';
import { naConversa } from './chat-helpers.js';

// Capturas do Chat (redesign A1, 24/11/2026) com as mesmas conversas e tamanhos do protótipo
// (`docs/prototipos/chat-redesign/`), para comparar lado a lado.
// Só roda com CAPTURAS=<pasta>: pnpm --filter @npac/web e2e e2e/capturas-chat.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
test.use({ deviceScaleFactor: 2 });

const id = async (usuario: string) =>
  (await owner<{ id: string }[]>`select id from "user" where username = ${usuario}`)[0]!.id;

/** Lead do Igor (ele vê) ou de outra pessoa (para ele, "lead restrito"). */
async function lead(nome: string, dono: string) {
  const [l] = await owner<{ id: string }[]>`
    insert into leads (name, instagram, income_band, source, tier, stage_id, sdr_id, created_by)
    select ${nome}, ${nome.toLowerCase().replace(/\W+/g, '.')}, 'R8_15K', 'BIO', 'P1', s.id, u.id, u.id
    from "user" u, pipeline_stages s where u.username = ${dono} and s.key = 'SONDAGEM'
    returning id`;
  return l!.id;
}
async function dm(a: string, b: string) {
  const [x, y] = [await id(a), await id(b)].sort();
  const [c] = await owner<{ id: string }[]>`
    insert into chat_channels (kind, dm_key) values ('DM', ${`${x}|${y}`}) returning id`;
  await owner`insert into chat_members (channel_id, user_id) values (${c!.id}, ${x!}), (${c!.id}, ${y!})`;
  return c!.id;
}
/** Mensagem `dias` atrás, no horário de Brasília. */
async function msg(
  canal: string,
  autor: string,
  texto: string,
  dias: number,
  hm: string,
  leadId?: string,
) {
  const [m] = await owner<{ id: string }[]>`
    insert into chat_messages (channel_id, author_id, body, lead_id, created_at)
    values (${canal}, ${await id(autor)}, ${texto}, ${leadId ?? null},
      ((date_trunc('day', now() at time zone 'America/Sao_Paulo') - ${dias} * interval '1 day'
        + ${hm}::time) at time zone 'America/Sao_Paulo'))
    returning id`;
  return Number(m!.id);
}

test.beforeAll(async () => {
  await owner`truncate chat_reads, chat_messages, chat_members`;
  await owner`delete from chat_channels where kind = 'DM'`;
  await owner`delete from leads where name in ('Carolina Mendes', 'Marina Duarte', 'Carolina Souza Lima', 'Caroline Prado', 'Lead da Ana')`;
  const carolina = await lead('Carolina Mendes', 'igor');
  const marina = await lead('Marina Duarte', 'igor');
  await lead('Carolina Souza Lima', 'igor');
  await lead('Caroline Prado', 'igor');
  const outro = await lead('Lead da Ana', 'ale');
  const [g] = await owner<{ id: string }[]>`select id from chat_channels where kind = 'GENERAL'`;
  const geral = g!.id;
  await msg(geral, 'ronaldo', 'Esse lead passou para outra carteira.', 1, '18:32', outro);
  await msg(geral, 'ana', 'Bom dia! Alinhamento às 14h.', 0, '09:13');
  await msg(geral, 'ana', 'Atualizem as remarcadas antes disso.', 0, '09:13:30');
  await msg(geral, 'sonia', 'A Carolina confirmou para as 17h.', 0, '09:20', carolina);
  await msg(geral, 'igor', 'Boa! Deixei o resumo na ficha.', 0, '09:24');
  const lido = await msg(geral, 'igor', 'A Marina pediu ligação às 18h.', 0, '09:24:20', marina);
  await msg(geral, 'murilo', 'Alguém tem o link do material do RDV?', 0, '10:05');
  await msg(geral, 'ana', 'Está na pasta da equipe. Se não achar, me chama.', 0, '10:08');
  await owner`insert into chat_reads (channel_id, user_id, last_read_id)
    values (${geral}, ${await id('igor')}, ${lido})`;

  await msg(
    await dm('igor', 'ana'),
    'ana',
    'Consegue ligar para a Marina Duarte hoje? Ela pediu retorno à tarde.',
    0,
    '09:41',
  );
  await msg(await dm('igor', 'sonia'), 'igor', 'Perfeito, obrigado!', 1, '17:10');
  await msg(await dm('igor', 'ronaldo'), 'ronaldo', 'Valeu, time.', 3, '11:00');
  const murilo = await dm('igor', 'murilo');
  await msg(murilo, 'igor', 'Te passo o contato depois.', 8, '15:30');
  await owner`insert into chat_reads (channel_id, user_id, last_read_id)
    select channel_id, ${await id('igor')}, max(id) from chat_messages
    where channel_id in (select channel_id from chat_members where user_id = ${await id('igor')})
      and channel_id <> ${geral} and channel_id not in (
        select channel_id from chat_members where user_id = ${await id('ana')})
    group by channel_id`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function entrar(page: Page, tema: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  // next-themes guarda a escolha no aparelho (padrão: claro).
  await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('igor');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
const foto = (page: Page, nome: string) =>
  page.waitForTimeout(300).then(() => page.screenshot({ path: `${PASTA}/${nome}.png` }));

for (const tema of ['light', 'dark'] as const) {
  const sufixo = tema === 'dark' ? '-escuro' : '';

  test(`celular (${tema})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await entrar(page, tema);
    await page.goto('/chat');
    await page.getByRole('navigation', { name: 'Conversas' }).waitFor();
    await foto(page, `app-lista-375${sufixo}`);

    await page.getByRole('button', { name: 'Nova conversa' }).click();
    await page.getByRole('dialog').waitFor();
    await foto(page, `app-nova-375${sufixo}`);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();

    await page.getByRole('button', { name: /^Geral/ }).click();
    await naConversa(page, 'Está na pasta da equipe').waitFor();
    await page.locator('.ch-rola').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await foto(page, `app-conversa-375${sufixo}`);

    // Teclado aberto: a área visível do iPhone 13 acima do teclado (812 − 291 px).
    await page.getByRole('button', { name: 'Mencionar lead' }).click();
    await page.getByLabel('Mencionar lead').fill('caro');
    await page.getByRole('button', { name: 'Carolina Mendes' }).waitFor();
    await page.setViewportSize({ width: 375, height: 521 });
    await foto(page, `app-mencao-375${sufixo}`);
    await page.getByRole('button', { name: 'Carolina Mendes' }).click();
    await page.getByLabel('Mensagem').fill('Ela pediu para remarcar para as');
    await foto(page, `app-teclado-375${sufixo}`);
  });

  for (const [w, h] of [
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ] as const) {
    test(`conversa ${w} (${tema})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await entrar(page, tema);
      await page.goto('/chat');
      await page.getByRole('button', { name: /^Geral/ }).click();
      await naConversa(page, 'Está na pasta da equipe').waitFor();
      await page.mouse.move(w - 5, h - 5);
      await foto(page, `app-conversa-${w}${sufixo}`);
    });
  }
}
