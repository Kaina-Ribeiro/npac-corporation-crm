import { DIAGNOSTICO_CHAVES, type DiagnosticoChave } from './campos.js';
import { nomeNormalizado } from './normalizar.js';

/** Os 9 rótulos do diagnóstico, como no PDF; a comparação ignora caixa, acento e espaços. */
export const DIAGNOSTICO_ROTULOS: Record<DiagnosticoChave, string> = {
  idade: 'Idade',
  situacao_conjugal: 'Situação conjugal',
  filhos: 'Filho(s)',
  trabalho: 'Trabalho',
  renda_atual: 'Renda atual',
  dinheiro_guardado: 'Dinheiro guardado',
  patrimonio: 'Patrimônio',
  dividas: 'Dívidas',
  sonhos_objetivos: 'Sonhos e objetivos',
};

const POR_ROTULO = new Map(
  DIAGNOSTICO_CHAVES.map((k) => [nomeNormalizado(DIAGNOSTICO_ROTULOS[k]), k] as const),
);

/**
 * Diagnóstico colado (regra 5, D30): "Rótulo: valor", dividindo no primeiro `:`. Só os rótulos
 * reconhecidos entram (mescla por campo na gravação); os desconhecidos ficam de fora e são
 * contados. Linha sem `:` continua o campo anterior. Valor gravado como veio.
 */
export function parseDiagnostico(texto: string) {
  const campos: Partial<Record<DiagnosticoChave, string>> = {};
  let desconhecidos = 0;
  let atual: DiagnosticoChave | null = null;
  for (const bruta of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const linha = bruta.trim();
    if (!linha) continue;
    const i = linha.indexOf(':');
    const chave = i > 0 ? POR_ROTULO.get(nomeNormalizado(linha.slice(0, i))) : undefined;
    if (chave) {
      campos[chave] = linha.slice(i + 1).trim();
      atual = chave;
    } else if (i > 0 && i <= 40) {
      desconhecidos += 1;
      atual = null;
    } else if (atual) {
      campos[atual] = `${campos[atual]}\n${linha}`;
    }
  }
  return { campos, desconhecidos };
}
