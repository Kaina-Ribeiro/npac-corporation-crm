import { BadRequestException } from '@nestjs/common';
import {
  nomeNormalizado,
  type CancelamentoPlanilha,
  type PlanilhaLida,
  type ProcessoPlanilha,
  type RespostaForm,
} from '@npac/shared';
import ExcelJS from 'exceljs';

export const LIMITE_LINHAS = 5_000;

type Celula = ExcelJS.CellValue;

/** Texto de uma célula, seja número, data, fórmula, link ou texto rico. Vazio vira nulo. */
function texto(v: Celula): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return limpo(v.richText.map((p) => p.text).join(''));
    if ('text' in v) return texto(v.text as Celula);
    if ('result' in v) return texto(v.result as Celula);
    return null;
  }
  return limpo(String(v));
}
const limpo = (s: string) => s.trim() || null;

/** O Excel guarda data pura como meia-noite UTC: `AAAA-MM-DD` sem passar por fuso. */
const dataDe = (v: Celula) => (v instanceof Date ? v.toISOString().slice(0, 10) : texto(v));

const simNao = (s: string | null) => {
  const n = s ? nomeNormalizado(s) : '';
  return n.startsWith('s') ? true : n.startsWith('n') ? false : null;
};

type Coluna = { titulo: string; indice: number };

/** Lê os títulos. Qualquer coluna com "cpf" no título é descartada aqui, antes de tudo. */
function colunas(ws: ExcelJS.Worksheet): Coluna[] {
  const out: Coluna[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, indice) => {
    const t = texto(cell.value);
    if (!t) return;
    const titulo = nomeNormalizado(t);
    if (!titulo.includes('cpf')) out.push({ titulo, indice });
  });
  return out;
}

/** Coluna pelo título: a primeira que tem um dos termos e nenhum dos excluídos. */
function achar(cols: Coluna[], termos: string[], fora: string[] = []): number | null {
  for (const termo of termos) {
    const c = cols.find((x) => x.titulo.includes(termo) && !fora.some((f) => x.titulo.includes(f)));
    if (c) return c.indice;
  }
  return null;
}

function aba(wb: ExcelJS.Workbook, nome: string): ExcelJS.Worksheet | undefined {
  const alvo = nomeNormalizado(nome).replace(/\s/g, '');
  return wb.worksheets.find((w) => nomeNormalizado(w.name).replace(/\s/g, '') === alvo);
}

function linhas(ws: ExcelJS.Worksheet, ler: (r: ExcelJS.Row) => void): void {
  if (ws.rowCount - 1 > LIMITE_LINHAS)
    throw new BadRequestException(`A planilha passa do limite de 5.000 linhas (aba ${ws.name})`);
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n > 1) ler(row);
  });
}

const FORA_NOME = ['conjuge', 'esposa', 'marido', 'parceir', 'chamado', 'arquivo'];

function lerRespostas(ws: ExcelJS.Worksheet): RespostaForm[] {
  const cols = colunas(ws);
  const col = {
    carimbo: achar(cols, ['carimbo', 'timestamp', 'data/hora']),
    nome: achar(cols, ['nome completo', 'seu nome', 'nome'], FORA_NOME),
    apelido: achar(cols, ['como gosta', 'chamado', 'apelido']),
    telefone: achar(cols, ['telefone', 'whatsapp', 'celular'], ['conjuge']),
    email: achar(cols, ['e-mail', 'email'], ['conjuge']),
    instagram: achar(cols, ['instagram'], ['conjuge']),
    // "Endereço de e-mail" é o título padrão do Google Forms: não é o endereço de entrega.
    endereco: achar(cols, ['endereco'], ['e-mail', 'email', 'eletronico']),
    conjuge: achar(cols, ['nome do conjuge', 'conjuge'], ['particip']),
    participa: achar(cols, ['participa']),
    sonho: achar(cols, ['sonho']),
    medo: achar(cols, ['medo']),
    pulseira: achar(cols, ['pulseira']),
    foto: achar(cols, ['foto']),
    motivacao: achar(cols, ['motiva']),
    camiseta: achar(cols, ['camiseta']),
    livros: achar(cols, ['livro']),
  };
  const out: RespostaForm[] = [];
  linhas(ws, (r) => {
    const v = (c: number | null) => (c === null ? null : texto(r.getCell(c).value));
    const nome = v(col.nome);
    if (!nome) return;
    out.push({
      carimbo: v(col.carimbo),
      nome,
      apelido: v(col.apelido),
      telefone: v(col.telefone),
      email: v(col.email),
      instagram: v(col.instagram),
      endereco: v(col.endereco),
      conjuge: v(col.conjuge),
      conjugeParticipa: simNao(v(col.participa)),
      sonho: v(col.sonho),
      medo: v(col.medo),
      pulseira: v(col.pulseira),
      foto: v(col.foto),
      motivacao: v(col.motivacao),
      camiseta: v(col.camiseta),
      livros: v(col.livros),
    });
  });
  return out;
}

function lerProcessos(ws: ExcelJS.Worksheet): ProcessoPlanilha[] {
  const cols = colunas(ws);
  const nome = achar(cols, ['nome', 'mentorado', 'cliente'], FORA_NOME);
  const mentoria = achar(cols, ['mentoria', 'plano', 'produto'], ['nome']);
  const inicio = achar(cols, ['data de inicio', 'inicio']);
  const status = achar(cols, ['status', 'situacao']);
  const out: ProcessoPlanilha[] = [];
  linhas(ws, (r) => {
    const n = nome === null ? null : texto(r.getCell(nome).value);
    if (!n) return;
    out.push({
      nome: n,
      mentoria: mentoria === null ? null : texto(r.getCell(mentoria).value),
      dataInicio: inicio === null ? null : dataDe(r.getCell(inicio).value),
      status: status === null ? null : texto(r.getCell(status).value),
    });
  });
  return out;
}

function lerCancelamentos(ws: ExcelJS.Worksheet): CancelamentoPlanilha[] {
  const cols = colunas(ws);
  const nome = achar(cols, ['nome', 'mentorado', 'cliente'], FORA_NOME);
  const mentoria = achar(cols, ['mentoria', 'plano', 'produto'], ['nome']);
  const out: CancelamentoPlanilha[] = [];
  linhas(ws, (r) => {
    const n = nome === null ? null : texto(r.getCell(nome).value);
    if (!n) return;
    out.push({ nome: n, mentoria: mentoria === null ? null : texto(r.getCell(mentoria).value) });
  });
  return out;
}

/**
 * Lê só as 3 abas da §7 e só as colunas conhecidas, pelo título. Não guarda o arquivo nem registra
 * o conteúdo. CPF nunca é lido para gravação.
 */
export async function lerPlanilha(arquivo: Buffer): Promise<PlanilhaLida> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('Não foi possível ler a planilha. Envie um arquivo .xlsx.');
  }
  const respostas = aba(wb, 'RESPOSTASFORMS');
  const processos = aba(wb, 'PROCESSOS 2M6M');
  const cancelamentos = aba(wb, 'CANCELAMENTOS');
  if (!respostas && !processos && !cancelamentos)
    throw new BadRequestException(
      'A planilha não tem as abas RESPOSTASFORMS, PROCESSOS 2M6M ou CANCELAMENTOS',
    );
  return {
    respostas: respostas ? lerRespostas(respostas) : [],
    processos: processos ? lerProcessos(processos) : [],
    cancelamentos: cancelamentos ? lerCancelamentos(cancelamentos) : [],
  };
}
