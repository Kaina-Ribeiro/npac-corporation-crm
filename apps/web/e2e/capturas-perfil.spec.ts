import { crc32, deflateSync } from 'node:zlib';
import { test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas do Meu perfil (NPAC-53) e das telas que ganharam foto, para comparar com o protótipo.
// Só roda com CAPTURAS=<pasta>: pnpm --filter @npac/web e2e e2e/capturas-perfil.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];

/** Retrato simples em PNG (fundo, rosto e ombros) para a foto parecer foto nas capturas. */
function retrato(fundo: number[], pele: number[], roupa: number[]): Buffer {
  const lado = 256;
  const linhas: Buffer[] = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 3);
    for (let x = 0; x < lado; x++) {
      const rosto = (x - 128) ** 2 / 50 ** 2 + (y - 104) ** 2 / 62 ** 2 <= 1;
      const ombro = y > 176 && (x - 128) ** 2 / 118 ** 2 + (y - 270) ** 2 / 100 ** 2 <= 1;
      linha.set(ombro ? roupa : rosto ? pele : fundo, 1 + x * 3);
    }
    linhas.push(linha);
  }
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.from(tipo, 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const comFoto = async (email: string, png: Buffer, v: string) => {
  await owner`insert into user_photos (user_id, bytes, mime, size)
    select id, ${png}, 'image/png', ${png.length} from "user" where email = ${email}
    on conflict (user_id) do update set bytes = excluded.bytes, size = excluded.size`;
  await owner`update "user" set image = ${v} where email = ${email}`;
};

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function foto(page: Page, nome: string, larguras = LARGURAS, cheia = true) {
  for (const w of larguras) {
    await page.setViewportSize({ width: w, height: w < 768 ? 812 : 900 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${PASTA}/${nome}-${w}.png`, fullPage: cheia });
  }
}

test.beforeAll(async () => {
  await comFoto(
    'ronaldo@npac.com.br',
    retrato([216, 196, 163], [223, 164, 127], [43, 52, 66]),
    'c1',
  );
  await comFoto('igor@npac.com.br', retrato([184, 196, 211], [191, 132, 96], [91, 70, 54]), 'c2');
});
test.beforeEach(async () => {
  await owner`truncate rate_limit, verification`;
});
test.afterAll(async () => {
  await owner`delete from user_photos where user_id in (select id from "user" where email in ('ronaldo@npac.com.br', 'igor@npac.com.br'))`;
  await owner`update "user" set image = null where email in ('ronaldo@npac.com.br', 'igor@npac.com.br')`;
  await owner`truncate chat_reads, chat_messages, chat_members`;
  await owner`delete from chat_channels where kind = 'DM'`;
  await closeTestConnections();
});

for (const tema of ['light', 'dark'] as const) {
  test(`Meu perfil (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    // next-themes guarda a escolha no aparelho (padrão: claro).
    await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
    await entrar(page, 'ronaldo');
    await page.goto('/conta/perfil');
    await foto(page, `perfil-${tema}`);
    await page.getByRole('button', { name: 'Trocar senha' }).click();
    await foto(page, `perfil-senha-${tema}`, [375, 1440]);
  });
}

/** Tema claro ou escuro desde a primeira carga (next-themes lê o `localStorage`). */
async function tema(page: Page, t: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: t, reducedMotion: 'reduce' });
  await page.addInitScript((v) => localStorage.setItem('theme', v), t);
}

for (const t of ['light', 'dark'] as const) {
  test(`janelinhas: recorte e e-mail (${t})`, async ({ page }) => {
    await tema(page, t);
    await entrar(page, 'ronaldo');
    await page.goto('/conta/perfil');
    await page.getByLabel('Escolher foto').setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: retrato([216, 196, 163], [223, 164, 127], [43, 52, 66]),
    });
    await page.getByRole('dialog', { name: 'Ajustar foto' }).waitFor();
    await foto(page, `recorte-${t}`, [375, 1440], false);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Trocar e-mail' }).click();
    await page.getByLabel('Novo e-mail').fill('ronaldo.novo@exemplo.test');
    await page.waitForTimeout(300);
    await foto(page, `email-1-${t}`, [375, 1440], false);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await page.getByRole('heading', { name: 'Confirme o novo e-mail' }).waitFor();
    await foto(page, `email-2-${t}`, [375, 1440], false);
  });

  test(`telas com foto, CRM (${t})`, async ({ page }) => {
    await tema(page, t);
    await entrar(page, 'diretor');
    const [igor] = await owner<
      { name: string }[]
    >`select name from "user" where email = 'igor@npac.com.br'`;
    for (const [tela, nome] of [
      ['/equipe', 'equipe'],
      ['/admin', 'admin'],
      ['/hoje', 'hoje'],
      ['/dashboard', 'dashboard'],
      ['/relatorios', 'relatorios'],
    ] as const) {
      await page.goto(tela);
      await foto(page, `${nome}-${t}`, [375, 1440]);
    }
    await page.goto('/chat');
    await page.getByLabel('Nova conversa').selectOption({ label: igor!.name });
    await foto(page, `chat-${t}`, [375, 1440], false);
    await page.context().clearCookies();
    await entrar(page, 'ronaldo');
    await page.goto('/mais');
    await foto(page, `mais-${t}`, [375], false);
  });

  test(`telas com foto, Acompanhamento (${t})`, async ({ page }) => {
    await tema(page, t);
    await entrar(page, 'duda');
    for (const [tela, nome] of [
      ['/conta/perfil', 'perfil-acomp'],
      ['/acompanhamento/mais', 'mais-acomp'],
      ['/acompanhamento/mentorados', 'mentorados'],
      ['/acompanhamento/fila', 'fila'],
    ] as const) {
      await page.goto(tela);
      await foto(page, `${nome}-${t}`, [375, 1440]);
    }
  });
}
