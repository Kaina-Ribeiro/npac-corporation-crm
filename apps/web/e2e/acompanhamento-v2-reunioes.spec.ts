import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const abrirReunioes = async (page: Page) => {
  await lateral(page).getByRole('link', { name: 'Reuniões', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/reunioes/);
  await expect(page.getByRole('heading', { name: 'Reuniões', level: 1 })).toBeVisible();
};
const idDe = async (usuario: string) =>
  (await owner<{ id: string }[]>`select id from "user" where username = ${usuario}`)[0]!.id;

/** Como `nome_norm`: a busca compara sem acento. */
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Inscrição ativa sem reuniões; `nome` único por teste. */
async function inscricao(nome: string, mentoria = 'RDV') {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values ('INDIVIDUAL', ${mentoria}, 'ATIVO', current_date - 40, current_date + 325)
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${semAcento(nome)})`;
  return i!.id;
}

/** Reunião de hoje, ao meio-dia de Brasília: cai sempre na semana atual. */
async function reuniaoHoje(inscricaoId: string, condutor: string, tipo = 'ACOMP_EMERGENCIA') {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${inscricaoId}, ${tipo}, ${condutor},
      ((now() at time zone 'America/Sao_Paulo')::date + time '12:00') at time zone 'America/Sao_Paulo')
    returning id`;
  return r!.id;
}

test('Operação agenda, confirma e marca link enviado', async ({ page }) => {
  const nome = 'Mentorado Fictício 80';
  const id = await inscricao(nome);
  await entrar(page, 'operacao');
  await abrirReunioes(page);
  await page.getByRole('link', { name: 'Agendar reunião' }).click();
  await page.waitForURL(/\/acompanhamento\/reunioes\/nova/);

  await page.getByRole('searchbox', { name: 'Mentorado', exact: true }).fill('Fictício 80');
  await page.getByRole('button', { name: new RegExp(nome) }).click();
  await page.getByLabel('Tipo', { exact: true }).selectOption('IDR');
  await page.getByLabel('Quem conduz').selectOption({ label: 'Leo' });
  const [amanha] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo')::date + 1, 'YYYY-MM-DD') as d`;
  await page.getByLabel('Data e hora').fill(`${amanha!.d}T21:00`);
  await page.getByRole('button', { name: 'Zoom', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar reunião', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/reunioes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'IDR', level: 1 })).toBeVisible();
  await expect(
    page.getByText(`${amanha!.d.slice(8)}/${amanha!.d.slice(5, 7)}, 21:00`).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Link enviado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Link enviado', exact: true })).toBeHidden();
  await expect
    .poll(
      async () =>
        (
          await owner<{ status: string; hora: string }[]>`
          select status, to_char(inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora
          from mentoria_reunioes where inscricao_id = ${id}`
        )[0],
    )
    .toEqual({ status: 'LINK_ENVIADO', hora: '21:00' });
  // A etapa IDR do onboarding segue a reunião.
  await expect(page.getByText('Link enviado').first()).toBeVisible();
});

test('Manu entra e vê só as reuniões dela', async ({ page }) => {
  const dela = await inscricao('Mentorado Fictício 81');
  const outra = await inscricao('Mentorado Fictício 82');
  await reuniaoHoje(dela, await idDe('manu'), 'POSICIONAMENTO');
  await reuniaoHoje(outra, await idDe('duda'));
  await reuniaoHoje(dela, await idDe('duda'));

  await entrar(page, 'manu');
  await abrirReunioes(page);
  await expect(page.getByRole('link', { name: /Mentorado Fictício 81/ })).toHaveCount(1);
  await expect(page.getByText('Mentorado Fictício 82')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Manu' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Duda' })).toHaveCount(0);

  await page.getByRole('link', { name: /Mentorado Fictício 81/ }).click();
  await page.waitForURL(/\/acompanhamento\/reunioes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Posicionamento', level: 1 })).toBeVisible();
  // A ficha de quem não é dela não existe para ela.
  const r = await page.goto(`/acompanhamento/ficha/${outra}`);
  expect(r?.status()).toBe(404);
});

test('controle mensal filtra por mentoria', async ({ page }) => {
  await inscricao('Mentorado Fictício 83', '2M');
  await inscricao('Mentorado Fictício 84', '6M');
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await abrirReunioes(page);
  await page.getByRole('link', { name: 'Controle mensal', exact: true }).click();
  await page.waitForURL(/aba=controle/);
  const faltam = page.getByRole('region', { name: 'Faltam' });
  await expect(faltam.getByText('Mentorado Fictício 83')).toBeVisible();
  await expect(faltam.getByText('Mentorado Fictício 84')).toBeVisible();

  await page.getByRole('group', { name: 'Mentoria' }).getByRole('link', { name: '6M' }).click();
  await page.waitForURL(/mentoria=6M/);
  await expect(faltam.getByText('Mentorado Fictício 84')).toBeVisible();
  await expect(faltam.getByText('Mentorado Fictício 83')).toHaveCount(0);
});

test('campos internos ficam marcados como internos', async ({ page }) => {
  const id = await inscricao('Mentorado Fictício 85');
  const r = await reuniaoHoje(id, await idDe('duda'), 'RENOVACAO');
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.goto(`/acompanhamento/reunioes/${r}`);
  await expect(page.getByRole('heading', { name: 'Renovação', level: 1 })).toBeVisible();

  const campo = (rotulo: string) => page.locator('label').filter({ hasText: rotulo });
  for (const interno of [
    'Trava ou dificuldade relatada',
    'Anotação interna',
    'Humor',
    'Quer renovar?',
  ])
    await expect(campo(interno).getByText('Interno')).toBeVisible();
  for (const visivel of ['Resumo do que foi conversado', 'Metas definidas ou ajustadas'])
    await expect(campo(visivel).getByText('Interno')).toHaveCount(0);

  // Salvar ao sair do campo grava cifrado.
  await campo('Trava ou dificuldade relatada').locator('textarea').fill('Trava fictícia');
  await campo('Resumo do que foi conversado').locator('textarea').click();
  await expect
    .poll(
      async () =>
        (
          await owner<
            { trava: string | null }[]
          >`select trava from mentoria_reunioes where id = ${r}`
        )[0]?.trava,
    )
    .not.toBeNull();
  const [t] = await owner<{ trava: string }[]>`select trava from mentoria_reunioes where id = ${r}`;
  expect(t!.trava).not.toContain('fictícia');
});
