import type { DiagnosticoChave } from './campos.js';
import type { FichaCampoChave, MentoradoStatus, QuadroChave } from './enums.js';
import type { BackupJson, RegistroDashboard, RegistroFicha, RegistroRdv } from './json-backup.js';

/**
 * Importação da ferramenta antiga (P3, Eduarda 04/11/2026). Sem zod: a tela também usa para
 * mostrar os nomes da prévia. O resultado é o `.json` do CRM (`npac-acompanhamento` v1), que
 * a API valida e grava pelo caminho de sempre. Fotos e vídeos do arquivo antigo são só
 * endereços da ferramenta antiga: entram na lista como mídia não recuperada (D42).
 */

type Midia = RegistroFicha['midias'][number];
type Bruto = Record<string, unknown>;

const obj = (v: unknown): Bruto =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Texto como veio, só sem espaços nas bordas; vazio vira nulo. */
const txt = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s ? s : null;
};
/** Datas da ferramenta antiga: sempre AAAA-MM-DD (ou AAAA-MM); o CRM guarda DD/MM/AAAA. */
export function dataBr(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[2]}/${m[1]}`;
  return s;
}

const STATUS: Record<string, MentoradoStatus> = {
  engajado: 'ENGAJADO',
  atencao: 'EM_ATENCAO',
  risco: 'EM_RISCO',
};

const TIPO_MIDIA: Record<string, Midia['tipo']> = { image: 'FOTO', video: 'VIDEO', pdf: 'PDF' };
const tipoMidia = (v: unknown): Midia['tipo'] =>
  TIPO_MIDIA[String(v ?? '').toLowerCase()] ?? 'FOTO';

function nomeDe(r: Bruto, i: number): string {
  const nome = txt(r.nome) ?? txt(r.name);
  if (!nome) throw new Error(`Registro ${i + 1} sem nome`);
  return nome;
}

const cabecalho = { formato: 'npac-acompanhamento', versao: 1, exportadoEm: '' } as const;

function dashboard(dados: unknown[], uuid: () => string): RegistroDashboard[] {
  return dados.map((x, i) => {
    const r = obj(x);
    const status =
      STATUS[
        String(r.status ?? '')
          .trim()
          .toLowerCase()
      ];
    if (!status) throw new Error(`Status desconhecido no registro ${i + 1}`);
    return {
      id: uuid(),
      nome: nomeDe(r, i),
      tipoCadastro: txt(r.tipo),
      tipoMentoria: txt(r.tipoMentoria),
      dataEntrada: dataBr(r.dataEntrada),
      status,
    };
  });
}

/** Pilares do formulário = "antes"; evoCards = evolução (reserva antes → depois). */
function linhaDoTempo(dados: unknown[], uuid: () => string): RegistroFicha[] {
  return dados.map((x, i) => {
    const r = obj(x);
    const id = uuid();
    const p = obj(r.pilares);
    const e = obj(r.evoCards);
    const campos: RegistroFicha['campos'] = {};
    const campo = (k: FichaCampoChave, lado: 'antes' | 'depois', v: unknown) => {
      const t = txt(v);
      if (t) campos[k] = { ...campos[k], [lado]: t };
    };
    campo('FE', 'antes', p.fe);
    campo('SAUDE', 'antes', p.saude);
    campo('DINHEIRO', 'antes', p.dinheiro);
    campo('RELACIONAMENTOS', 'antes', p.relacionamentos);
    campo('RESERVA_FINANCEIRA', 'antes', e.reservaAntes);
    campo('RESERVA_FINANCEIRA', 'depois', e.reservaDepois);
    campo('EVOLUCAO_RENDA', 'depois', e.evolucaoRenda);
    campo('EVOLUCAO_SAUDE', 'depois', e.saude);
    campo('INVESTIMENTOS_MENTORIA', 'depois', e.investimentos);
    campo('AREA_ATUACAO', 'depois', e.areaAtuacao);

    const midias: Midia[] = [];
    if (txt(r.fotoAntes) || txt(r.fotoAntesAssetId))
      midias.push({ donoTipo: 'FICHA_ANTES', donoId: id, tipo: 'FOTO' });
    if (txt(r.fotoDepois) || txt(r.fotoDepoisAssetId))
      midias.push({ donoTipo: 'FICHA_DEPOIS', donoId: id, tipo: 'FOTO' });

    const conquistas: RegistroFicha['conquistas'] = lista(r.conquistasGallery).map((g) => {
      const c = obj(g);
      const cid = uuid();
      if (txt(c.image) || txt(c.assetId))
        midias.push({ donoTipo: 'CONQUISTA', donoId: cid, tipo: tipoMidia(c.type) });
      return { id: cid, data: dataBr(c.date), descricao: txt(c.caption) };
    });
    // "conquistasArquivadas" é texto livre: vira uma conquista sem data, para não se perder.
    const arquivadas = txt(r.conquistasArquivadas);
    if (arquivadas) conquistas.push({ id: uuid(), data: null, descricao: arquivadas });

    return {
      id,
      nome: nomeDe(r, i),
      dataInicio: dataBr(r.submittedAt),
      notasMomentoInicial: txt(r.notasIniciais),
      notasMomentoAtual: txt(r.evolucao),
      tempoMentoria: txt(r.tempoMentoria),
      campos,
      conquistas,
      midias,
    };
  });
}

const DIAG: Record<string, DiagnosticoChave> = {
  idade: 'idade',
  situacaoConjugal: 'situacao_conjugal',
  filhos: 'filhos',
  trabalho: 'trabalho',
  rendaAtual: 'renda_atual',
  dinheiroGuardado: 'dinheiro_guardado',
  patrimonio: 'patrimonio',
  dividas: 'dividas',
  sonhos: 'sonhos_objetivos',
};
const QUADROS: [string, QuadroChave][] = [
  ['eventosPresenciais', 'EVENTOS_PRESENCIAIS'],
  ['investimentosAtivos', 'INVESTIMENTO_ATIVOS'],
  ['imovelLeilao', 'IMOVEL_LEILAO'],
  ['mercadoImobiliario', 'MERCADO_IMOBILIARIO'],
];

/** Eventos usam "date"/"caption"; itens dos quatro quadros usam "data"/"nome". */
function rdv(dados: unknown[], uuid: () => string) {
  let notasDeFora = 0;
  let eventosSemData = 0;
  const registros: RegistroRdv[] = dados.map((x, i) => {
    const r = obj(x);
    const id = uuid();
    if (txt(r.notasImportantes)) notasDeFora += 1;
    const midias: Midia[] = [];
    if (txt(r.photo) || txt(r.photoAssetId))
      midias.push({ donoTipo: 'RDV_PESSOA', donoId: id, tipo: 'FOTO' });
    const d = obj(r.diagnostico);
    const diagnostico: RegistroRdv['diagnostico'] = {};
    for (const [k, chave] of Object.entries(DIAG)) {
      const t = txt(d[k]);
      if (t) diagnostico[chave] = t;
    }
    // Evento sem data não entra (regra 4: evento precisa de data); é contado para o aviso.
    const comData = lista(r.events).filter((y) => {
      const ok = /^\d{2}\/\d{2}\/\d{4}$/.test(dataBr(obj(y).date) ?? '');
      if (!ok) eventosSemData += 1;
      return ok;
    });
    const eventos: RegistroRdv['eventos'] = comData.map((y) => {
      const e = obj(y);
      const eid = uuid();
      for (const m of lista(e.media))
        midias.push({ donoTipo: 'RDV_EVENTO', donoId: eid, tipo: tipoMidia(obj(m).type) });
      for (const l of lista(e.videoLinks)) {
        const url = txt(obj(l).url);
        if (url)
          midias.push({ donoTipo: 'RDV_EVENTO', donoId: eid, tipo: 'LINK_VIDEO', urlVideo: url });
      }
      return { id: eid, data: dataBr(e.date) ?? '', descricao: txt(e.caption), origem: 'MANUAL' };
    });
    const quadros: RegistroRdv['quadros'] = QUADROS.flatMap(([campo, quadro]) =>
      lista(r[campo]).map((y) => {
        const q = obj(y);
        const qid = uuid();
        for (const m of lista(q.media))
          midias.push({ donoTipo: 'RDV_QUADRO_ITEM', donoId: qid, tipo: tipoMidia(obj(m).type) });
        return { id: qid, quadro, data: dataBr(q.data), descricao: txt(q.nome) };
      }),
    );
    return {
      id,
      nome: nomeDe(r, i),
      pastaUrl: txt(r.planilhaLink),
      diagnostico,
      eventos,
      duvidas: [],
      quadros,
      midias,
    };
  });
  return { registros, notasDeFora, eventosSemData };
}

export type Convertido = { arquivo: BackupJson; notasDeFora: number; eventosSemData: number };

/** `.json` da ferramenta antiga (uma lista de registros por módulo) → backup do CRM. */
export function converterLegado(
  modulo: BackupJson['modulo'],
  dados: unknown[],
  uuid: () => string,
): Convertido {
  if (modulo === 'dashboard')
    return {
      arquivo: { ...cabecalho, modulo, registros: dashboard(dados, uuid) },
      notasDeFora: 0,
      eventosSemData: 0,
    };
  if (modulo === 'linha-do-tempo')
    return {
      arquivo: { ...cabecalho, modulo, registros: linhaDoTempo(dados, uuid) },
      notasDeFora: 0,
      eventosSemData: 0,
    };
  const { registros, notasDeFora, eventosSemData } = rdv(dados, uuid);
  return { arquivo: { ...cabecalho, modulo, registros }, notasDeFora, eventosSemData };
}

/** CSV (RFC 4180): vírgula, aspas duplas, quebra de linha dentro de campo entre aspas. */
export function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  // BOM do Excel/Sheets no início do arquivo.
  const s = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((x) => x.trim()));
}

/**
 * "Planilha .csv do formulário" (Linha do tempo): 9 colunas pela posição, 1ª linha ignorada.
 * 1 data de envio · 2 nome · 3 fé · 4 saúde · 5 dinheiro · 6 relacionamentos · 7 notas
 * iniciais · 8 tempo de mentoria · 9 evolução. Data com hora (carimbo do Forms) fica só com o dia.
 * Linha sem nome não entra (`invalidas` = número da linha no arquivo).
 */
export function converterFormulario(texto: string, uuid: () => string) {
  const invalidas: number[] = [];
  const registros: RegistroFicha[] = [];
  parseCsv(texto)
    .slice(1)
    .forEach((c, i) => {
      const nome = txt(c[1]);
      if (!nome) return void invalidas.push(i + 2);
      const campos: RegistroFicha['campos'] = {};
      (['FE', 'SAUDE', 'DINHEIRO', 'RELACIONAMENTOS'] as const).forEach((k, j) => {
        const t = txt(c[2 + j]);
        if (t) campos[k] = { antes: t };
      });
      registros.push({
        id: uuid(),
        nome,
        dataInicio: txt((c[0] ?? '').trim().split(/\s+/)[0]),
        notasMomentoInicial: txt(c[6]),
        tempoMentoria: txt(c[7]),
        notasMomentoAtual: txt(c[8]),
        campos,
        conquistas: [],
        midias: [],
      });
    });
  const arquivo: BackupJson = { ...cabecalho, modulo: 'linha-do-tempo', registros };
  return { arquivo, invalidas };
}

/** Nomes do arquivo pela ordem dos registros (formato do CRM ou da ferramenta antiga). */
export function nomesDoArquivo(json: unknown): string[] {
  const regs = Array.isArray(json) ? json : lista(obj(json).registros);
  return regs.map((r) => txt(obj(r).nome) ?? txt(obj(r).name) ?? '');
}

/** De qual módulo é o `.json` antigo, pelos campos do 1º registro (nulo se não der para saber). */
export function moduloDoLegado(dados: unknown[]): BackupJson['modulo'] | null {
  const r = obj(dados[0]);
  if ('events' in r || 'diagnostico' in r || 'planilhaLink' in r) return 'rdv';
  if ('pilares' in r || 'submittedAt' in r || 'evoCards' in r) return 'linha-do-tempo';
  if ('status' in r || 'tipoMentoria' in r) return 'dashboard';
  return null;
}
