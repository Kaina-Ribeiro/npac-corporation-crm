import { type FichaDTO, topicos, type CampoEvolucao, type Topico } from '@npac/shared/mentoria';
import { rotuloAntesDoInicio } from './ui';

/**
 * Lista de tópicos da aba Evolução e do PDF (sem estado: serve ao servidor e ao cliente). Cada linha
 * não vazia vira um tópico; "Rótulo: texto" põe o rótulo em negrito (`topicos()`).
 */
export function ListaTopicos({
  texto,
  itens,
  className = 'tp',
}: {
  texto?: string | null;
  itens?: Topico[];
  className?: string;
}) {
  const lista = itens ?? topicos(texto);
  return (
    <ul className={className}>
      {lista.map((t, i) => (
        <li key={i}>
          <span>
            {t.rotulo !== null && <b>{t.rotulo}: </b>}
            {t.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dor, sonho e meta da aba Momento inicial, como tópicos com rótulo (os vazios saem). */
export function topicosDaAba(daAba: {
  dor: string | null;
  sonho: string | null;
  meta: string | null;
}): Topico[] {
  const linha = (rotulo: string, v: string | null) =>
    v?.trim() ? [{ rotulo, texto: v.trim().replace(/\s*\r?\n\s*/g, ' ') }] : [];
  return [
    ...linha('Dor', daAba.dor),
    ...linha('Sonho', daAba.sonho),
    ...linha('Meta de 12 meses', daAba.meta),
  ];
}

/** "Mês N de 12" do momento atual; antes do início, o rótulo da ficha (spec §5.4). */
export function rotuloMesAtual(ficha: Pick<FichaDTO, 'mesJornada' | 'mentoria'>) {
  const mes = ficha.mesJornada;
  if (mes === null) return rotuloAntesDoInicio(ficha.mentoria);
  return mes > 12 ? 'Jornada concluída' : `Mês ${mes} de 12`;
}

/** Data de início: a da jornada; sem ela, a do Momento inicial. */
export const inicioDaFicha = (ficha: Pick<FichaDTO, 'inicioJornada' | 'momento'>) =>
  ficha.inicioJornada ?? ficha.momento?.data ?? null;

export type Def = { rotulo: string; campos: CampoEvolucao[]; largo?: boolean };

/** Rótulos literais do gerenciador antigo (spec §7); ordem e largura do protótipo. */
export const CARTOES: Def[] = [
  { rotulo: 'Reserva financeira', campos: ['reservaAntes', 'reservaHoje'], largo: true },
  { rotulo: 'Evolução de renda', campos: ['renda'] },
  { rotulo: 'Evolução na saúde', campos: ['saude'] },
  { rotulo: 'Investimentos feitos na mentoria', campos: ['investimentos'], largo: true },
  { rotulo: 'Área de atuação', campos: ['areaAtuacao'], largo: true },
];
