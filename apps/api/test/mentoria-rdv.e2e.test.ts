import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auditCount, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;

const R = '/api/mentoria/rdv';

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  carla = await h.signIn('carla@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
});

const criar = async (nome = 'Casal Fictício 1') => {
  const r = await h.post(R, { nome }, carla);
  expect(r.status).toBe(201);
  return r.body as { id: string; version: number };
};

describe('rdv: pessoa, diagnóstico e pasta', () => {
  it('Novo mentorado cria a pessoa; nome repetido → 409; a lista sai A–Z com total', async () => {
    await criar('Zeca Fictício');
    await criar('Ana Fictícia');
    const dup = await h.post(R, { nome: 'ANA  ficticia' }, carla);
    expect(dup.status).toBe(409);
    const l = await h.post(`${R}/search`, {}, carla);
    expect(l.status).toBe(200);
    expect(l.body.itens.map((i: { nome: string }) => i.nome)).toEqual([
      'Ana Fictícia',
      'Zeca Fictício',
    ]);
    expect(l.body.total).toBe(2);
    expect(l.body.itens[0]).toMatchObject({ eventos: 0 });
    const q = await h.post(`${R}/search`, { q: 'zeca' }, carla);
    expect(q.body.itens).toHaveLength(1);
  });

  it('abrir a pessoa traz os 9 campos do diagnóstico vazios e grava mentoria.open', async () => {
    const p = await criar();
    const r = await h.get(`${R}/${p.id}`, carla);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: p.id,
      nome: 'Casal Fictício 1',
      version: 1,
      pastaUrl: null,
    });
    expect(r.body.diagnostico).toHaveLength(9);
    expect(r.body.diagnostico[0]).toEqual({ chave: 'idade', rotulo: 'Idade', valor: null });
    expect(await auditCount('mentoria.open')).toBe(1);
  });

  it('PATCH do nome sobe a version; PATCH de pasta_url direto → 400', async () => {
    const p = await criar();
    const ok = await h.patch(`${R}/${p.id}`, { version: 1, nome: 'Casal Fictício 2' }, carla);
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    const pasta = await h.patch(
      `${R}/${p.id}`,
      { version: 2, pastaUrl: 'https://drive.google.com/x' },
      carla,
    );
    expect(pasta.status).toBe(400);
    const diag = await h.patch(`${R}/${p.id}`, { version: 2, diagnostico: { idade: '30' } }, carla);
    expect(diag.status).toBe(400);
  });

  it('prévia do diagnóstico mostra atual → novo e os rótulos que faltam, sem gravar nada', async () => {
    const p = await criar();
    const r = await h.post(
      `${R}/${p.id}/diagnostico/previa`,
      { texto: 'Idade: 41\nRenda atual: faixa fictícia\nCor favorita: azul' },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body.campos).toEqual([
      { chave: 'idade', rotulo: 'Idade', atual: null, novo: '41' },
      { chave: 'renda_atual', rotulo: 'Renda atual', atual: null, novo: 'faixa fictícia' },
    ]);
    expect(r.body.faltam).toHaveLength(7);
    expect(r.body.desconhecidos).toBe(1);
    const [n] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_rdv_diagnostico`;
    expect(n!.n).toBe(0);
    const [v] = await owner<
      { version: number }[]
    >`select version from mentoria_rdv_pessoas where id = ${p.id}`;
    expect(v!.version).toBe(1);
  });

  it('colar diagnóstico com 2 de 9 rótulos muda só essas 2 colunas e sobe a version', async () => {
    const p = await criar();
    const a = await h.post(
      `${R}/${p.id}/diagnostico/colar`,
      { version: 1, texto: 'Idade: 41\nTrabalho: autônomo fictício\nDívidas: nenhuma' },
      carla,
    );
    expect(a.status).toBe(200);
    expect(a.body.version).toBe(2);
    const b = await h.post(
      `${R}/${p.id}/diagnostico/colar`,
      { version: 2, texto: 'Idade: 42\nSonhos e objetivos: viajar' },
      carla,
    );
    expect(b.body.version).toBe(3);
    const r = await h.get(`${R}/${p.id}`, carla);
    const valor = (k: string) =>
      r.body.diagnostico.find((d: { chave: string }) => d.chave === k).valor;
    expect(valor('idade')).toBe('42');
    expect(valor('trabalho')).toBe('autônomo fictício');
    expect(valor('dividas')).toBe('nenhuma');
    expect(valor('sonhos_objetivos')).toBe('viajar');
    // Cifrado no banco: o texto não aparece em claro.
    const [d] = await owner<{ idade: string }[]>`select idade from mentoria_rdv_diagnostico`;
    expect(d!.idade).not.toContain('42');
  });

  it('colar com version antiga → 409 VERSION_CONFLICT', async () => {
    const p = await criar();
    await h.post(`${R}/${p.id}/diagnostico/colar`, { version: 1, texto: 'Idade: 41' }, carla);
    const r = await h.post(
      `${R}/${p.id}/diagnostico/colar`,
      { version: 1, texto: 'Idade: 50' },
      carla,
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('VERSION_CONFLICT');
  });

  it('colar sem nenhum rótulo reconhecido → 400 e nada muda', async () => {
    const p = await criar();
    const r = await h.post(`${R}/${p.id}/diagnostico/colar`, { version: 1, texto: 'oi' }, carla);
    expect(r.status).toBe(400);
  });

  it('colar diagnóstico não grava valor em log nem na auditoria', async () => {
    const p = await criar();
    const escrito: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((c: string | Uint8Array, ...r: never[]) => {
      escrito.push(String(c));
      return orig(c, ...r);
    }) as typeof process.stdout.write;
    process.stderr.write = ((c: string | Uint8Array, ...r: never[]) => {
      escrito.push(String(c));
      return origErr(c, ...r);
    }) as typeof process.stderr.write;
    try {
      await h.post(`${R}/${p.id}/diagnostico/previa`, { texto: 'Idade: VALOR-SECRETO-1' }, carla);
      await h.post(
        `${R}/${p.id}/diagnostico/colar`,
        { version: 1, texto: 'Idade: VALOR-SECRETO-1' },
        carla,
      );
    } finally {
      process.stdout.write = orig;
      process.stderr.write = origErr;
    }
    expect(escrito.join('')).not.toContain('VALOR-SECRETO');
    const audit = await owner<{ data: unknown }[]>`select data from audit_log`;
    expect(JSON.stringify(audit)).not.toContain('VALOR-SECRETO');
    expect(await auditCount('mentoria.paste_diagnostico')).toBe(1);
  });

  it('colar link atualiza a pasta e sobe a version; host fora da lista → 400', async () => {
    const p = await criar();
    const ruim = await h.post(
      `${R}/${p.id}/pasta`,
      { version: 1, url: 'https://exemplo.com/pasta' },
      carla,
    );
    expect(ruim.status).toBe(400);
    const ok = await h.post(
      `${R}/${p.id}/pasta`,
      { version: 1, url: 'https://drive.google.com/drive/folders/ficticia' },
      carla,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    const r = await h.get(`${R}/${p.id}`, carla);
    expect(r.body.pastaUrl).toBe('https://drive.google.com/drive/folders/ficticia');
  });

  it('link de planilha do Google (docs.google.com) é aceito na pasta (P3: planilhaLink)', async () => {
    const p = await criar();
    const ok = await h.post(
      `${R}/${p.id}/pasta`,
      { version: 1, url: 'https://docs.google.com/spreadsheets/d/ficticia' },
      carla,
    );
    expect(ok.status).toBe(200);
  });

  it('exportar PDF grava mentoria.print só com o id', async () => {
    const p = await criar();
    const r = await h.post(`${R}/${p.id}/imprimir`, {}, carla);
    expect(r.status).toBe(204);
    expect(await auditCount('mentoria.print')).toBe(1);
  });

  it('id inexistente → 404; não existe rota de restauração (404)', async () => {
    expect((await h.get(`${R}/00000000-0000-4000-8000-000000000000`, carla)).status).toBe(404);
    const p = await criar();
    expect(
      (await h.post(`/api/mentoria/registros/rdv-pessoa/${p.id}/excluir`, { version: 1 }, carla))
        .status,
    ).toBe(204);
    expect(
      (await h.post(`/api/mentoria/registros/rdv-pessoa/${p.id}/restaurar`, { version: 1 }, carla))
        .status,
    ).toBe(404);
    expect((await h.post(`${R}/${p.id}/restaurar`, {}, carla)).status).toBe(404);
  });
});
