import type { Page } from '@playwright/test';

/** Chat (redesign A1): "Nova conversa" é o ícone de escrever, que abre a folha com as pessoas. */
export async function novaConversa(page: Page, nome: string) {
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  const folha = page.getByRole('dialog', { name: 'Nova conversa' });
  await folha
    .locator('.ch-pessoa')
    .filter({ has: page.getByText(nome, { exact: true }) })
    .click();
  await folha.waitFor({ state: 'detached' });
}

/** Menção: o botão `#` abre a busca de lead na cápsula de escrever. */
export async function buscarLead(page: Page, termo: string) {
  const campo = page.getByRole('textbox', { name: 'Mencionar lead' });
  if (!(await campo.isVisible()))
    await page.getByRole('button', { name: 'Mencionar lead' }).click();
  await campo.fill(termo);
}

/** Texto dentro da conversa aberta (a lista também mostra a prévia da última mensagem). */
export const naConversa = (page: Page, texto: string, opcoes?: { exact?: boolean }) =>
  page.getByRole('region', { name: /^Conversa / }).getByText(texto, opcoes);
