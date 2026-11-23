import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-67 (Igor, 23/11/2026): concluir a tarefa do lead abre a janelinha que pede o que aconteceu
// (vira nota) e o próximo passo; a tarefa sai da lista e o próximo passo aparece na ficha.
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

const unico = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** Lead do Ale com uma tarefa vencida (vai para Atrasados). */
async function leadComTarefa(page: Page, nome: string, titulo: string) {
  const res = await page.request.post('/api/leads', {
    data: { name: nome, instagram: `@tarefa.${unico()}`, incomeBand: 'R5_8K', source: 'BIO' },
  });
  expect(res.ok()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  const task = await page.request.post(`/api/leads/${id}/tasks`, {
    data: { title: titulo, dueAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
  });
  expect(task.ok()).toBe(true);
  return id;
}

/** Amanhã às 10:00 de Brasília: valor do campo e como a ficha mostra. */
function amanha() {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    Date.now() + 86_400_000,
  );
  return { campo: `${dia}T10:00`, ficha: `${dia.split('-').reverse().join('/')}, 10:00` };
}

const section = (page: Page, title: RegExp) =>
  page.locator('section', { has: page.getByRole('heading', { name: title }) });

/** Clica no "Concluir" até a janelinha abrir (o clique antes da hidratação se perde). */
async function abrirJanelinha(page: Page, botao: Locator) {
  const janela = page.getByRole('dialog', { name: 'Concluir tarefa' });
  await expect(async () => {
    if (!(await janela.isVisible())) await botao.click({ timeout: 1000 });
    await expect(janela).toBeVisible({ timeout: 1000 });
  }).toPass();
  return janela;
}

const CASOS = [
  {
    opcao: 'Agendou reunião',
    campo: 'Data e hora da reunião (Brasília)',
    historico: 'Reunião agendada',
  },
  {
    opcao: 'Novo follow-up',
    campo: 'Nova data de contato (Brasília)',
    historico: 'Contato remarcado',
  },
  {
    opcao: 'Ligar para a pessoa',
    campo: 'Data e hora da ligação (Brasília)',
    historico: 'Contato remarcado',
  },
] as const;

for (const caso of CASOS) {
  test(`Hoje: concluir com "${caso.opcao}" pede a nota e deixa o próximo passo`, async ({
    page,
  }) => {
    await login(page, 'ale@npac.com.br');
    const sufixo = unico();
    const titulo = `Acompanhar ${sufixo}`;
    const nota = `Conversamos hoje ${sufixo}`;
    const id = await leadComTarefa(page, `Lead ${caso.opcao} ${sufixo}`, titulo);
    await page.goto('/hoje');
    const linha = section(page, /^Atrasados/).locator('[data-lead-row]', { hasText: titulo });
    await expect(linha).toBeVisible();

    const janela = await abrirJanelinha(
      page,
      linha.getByRole('button', { name: `Concluir ${titulo}` }),
    );
    // Sem a nota e sem o próximo passo não conclui.
    await janela.getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(janela).toBeVisible();
    await janela.getByLabel('O que aconteceu', { exact: true }).fill(nota);
    await janela.getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(janela.getByRole('alert')).toHaveText('Escolha o próximo passo.');

    await janela.locator('label', { hasText: caso.opcao }).click();
    const quando = amanha();
    await janela.getByLabel(caso.campo, { exact: true }).fill(quando.campo);
    if (caso.opcao === 'Agendou reunião') {
      await janela
        .getByLabel('Closer da reunião', { exact: true })
        .selectOption({ label: 'Sônia' });
      for (const largura of [1440, 1024, 768, 375]) {
        await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 900 });
        await page.screenshot({ path: `test-results/concluir-tarefa-${largura}.png` });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await janela.getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(janela).toBeHidden();
    await expect(linha).toHaveCount(0);

    // Na ficha: a nota, o próximo passo e o histórico.
    await page.goto(`/leads/${id}`);
    await expect(section(page, /^Notas$/).getByText(nota)).toBeVisible();
    if (caso.opcao === 'Agendou reunião') {
      await expect(section(page, /^Reuniões$/)).toContainText('Sônia');
      await expect(section(page, /^Reuniões$/)).toContainText(quando.ficha);
    } else {
      await expect(page.getByText(`Próximo contato: ${quando.ficha}`)).toBeVisible();
    }
    await expect(section(page, /^Histórico$/)).toContainText(caso.historico);
    await expect(
      section(page, /^Tarefas$/).getByRole('button', { name: `Reabrir ${titulo}` }),
    ).toBeVisible();
  });
}

test('ficha: o "Concluir" das Tarefas abre a mesma janelinha', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const sufixo = unico();
  const titulo = `Retornar ${sufixo}`;
  const id = await leadComTarefa(page, `Lead ficha ${sufixo}`, titulo);
  await page.goto(`/leads/${id}`);
  const tarefas = section(page, /^Tarefas$/);
  const janela = await abrirJanelinha(
    page,
    tarefas.getByRole('button', { name: `Concluir ${titulo}` }),
  );
  await janela.getByLabel('O que aconteceu', { exact: true }).fill(`Não atendeu ${sufixo}`);
  await janela.locator('label', { hasText: 'Ligar para a pessoa' }).click();
  const quando = amanha();
  await janela.getByLabel('Data e hora da ligação (Brasília)', { exact: true }).fill(quando.campo);
  await janela.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(janela).toBeHidden();
  await expect(tarefas.getByRole('button', { name: `Reabrir ${titulo}` })).toBeVisible();
  await expect(section(page, /^Notas$/).getByText(`Não atendeu ${sufixo}`)).toBeVisible();
  await expect(page.getByText(`Próximo contato: ${quando.ficha}`)).toBeVisible();
});

test('Cancelar fecha a janelinha sem concluir', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const sufixo = unico();
  const titulo = `Cancelar ${sufixo}`;
  await leadComTarefa(page, `Lead cancelar ${sufixo}`, titulo);
  await page.goto('/hoje');
  const linha = section(page, /^Atrasados/).locator('[data-lead-row]', { hasText: titulo });
  const janela = await abrirJanelinha(
    page,
    linha.getByRole('button', { name: `Concluir ${titulo}` }),
  );
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela).toBeHidden();
  await expect(linha).toBeVisible();
});
