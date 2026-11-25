import type { EvolucaoDTO } from '@npac/shared/mentoria';
import { money } from '@npac/shared/money';

/** Pontos de partida (spec §5.5), sem estado: serve à aba e ao PDF. */

type Partida = Pick<EvolucaoDTO, 'partida' | 'pilares'>;

const NUMEROS = [
  ['Renda atual', 'recebeCentavos'],
  ['Custo médio mensal', 'custoCentavos'],
  ['Dívidas', 'dividasCentavos'],
  ['Dinheiro guardado', 'guardadoCentavos'],
] as const;

const PILARES = [
  ['Fé', 'fe'],
  ['Saúde', 'saude'],
  ['Dinheiro', 'dinheiro'],
  ['Relacionamentos', 'relacionamentos'],
] as const;

export const reais = (c: number | null) => (c == null ? '—' : money(c).replace(/,00$/, ''));

/** Sem nenhum valor nem nota, a faixa não aparece. */
export function temPartida(e: Partida) {
  const p = e.partida;
  return (
    NUMEROS.some(([, k]) => p[k] != null) ||
    e.pilares.some((x) => PILARES.some(([, k]) => x[k] != null))
  );
}

export function NumerosPartida({ e }: { e: Partida }) {
  return (
    <div className="kp">
      {NUMEROS.map(([rotulo, k]) => (
        <div key={k} className="pl">
          <small>{rotulo}</small>
          <b>{reais(e.partida[k])}</b>
        </div>
      ))}
    </div>
  );
}

/** Notas de 0 a 10 dos 4 pilares por pessoa; `barra` desenha a barrinha dourada (na tela). */
export function NotasPilares({ e, barra = true }: { e: Partida; barra?: boolean }) {
  const pessoas = e.pilares.filter((x) => PILARES.some(([, k]) => x[k] != null));
  if (!pessoas.length) return null;
  return (
    <div className="pil">
      <span />
      {PILARES.map(([rotulo]) => (
        <span key={rotulo} className="hd">
          {rotulo === 'Relacionamentos' ? <>Relaciona&shy;mentos</> : rotulo}
        </span>
      ))}
      {pessoas.map((p) => (
        <Pessoa key={p.pessoaId} p={p} barra={barra} />
      ))}
    </div>
  );
}

function Pessoa({ p, barra }: { p: EvolucaoDTO['pilares'][number]; barra: boolean }) {
  return (
    <>
      <span className="nm">{p.nome.split(' ')[0]}</span>
      {PILARES.map(([, k]) => {
        const v = p[k];
        return (
          <span
            key={k}
            className="nota"
            style={{ '--w': `${((v ?? 0) / 10) * 100}%` } as React.CSSProperties}
          >
            <b>{v ?? '—'}</b>
            {barra && <i aria-hidden="true" />}
          </span>
        );
      })}
    </>
  );
}
