import { parseData } from './datas.js';

export type TipoLinhaColada = 'EVENTO' | 'DUVIDA' | 'QUADRO';
export type LinhaEventoColada = {
  linha: number;
  /** Tipo inicial: evento com data, dúvida sem data. A equipe pode mudar na prévia (D22). */
  tipo: TipoLinhaColada;
  /** Só sugere: "presencial" sugere o quadro Eventos presenciais, sem mudar o tipo. */
  sugestao: TipoLinhaColada;
  dataTexto: string | null;
  data: string | null;
  descricao: string;
};

/**
 * Colar vários eventos (RDV): uma linha por evento, `DD/MM/AAAA - descrição`. Linha sem data
 * legível vira dúvida (fato ambíguo), nunca evento sem data (regra 4).
 */
export function parseEventosColados(texto: string): LinhaEventoColada[] {
  const saida: LinhaEventoColada[] = [];
  texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((bruta, i) => {
      const linha = bruta.trim();
      if (!linha) return;
      const m = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–—]\s*(.+)$/.exec(linha);
      const d = m ? parseData(m[1]!) : null;
      if (m && d?.data) {
        const descricao = m[2]!.trim();
        saida.push({
          linha: i + 1,
          tipo: 'EVENTO',
          sugestao: /presencia/i.test(descricao) ? 'QUADRO' : 'EVENTO',
          dataTexto: d.texto,
          data: d.data,
          descricao,
        });
      } else {
        saida.push({
          linha: i + 1,
          tipo: 'DUVIDA',
          sugestao: 'DUVIDA',
          dataTexto: null,
          data: null,
          descricao: linha,
        });
      }
    });
  return saida;
}
