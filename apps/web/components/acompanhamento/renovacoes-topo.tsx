'use client';
import {
  diaMes,
  SITUACAO_RENOVACAO_LABEL,
  SITUACOES_RENOVACAO,
  type NumerosRenovacao,
  type RenovacaoLinha,
  type SituacaoRenovacao,
} from '@npac/shared/renovacoes';
import Link from 'next/link';

// Topo da aba "Renovações e gestão" (NPAC-79, mistura das opções 1 e 2 que o Gabriel escolheu em 26/11): o painel
// escuro com o anel do % e a conversa em degraus (cada degrau filtra a lista) e a linha do término de cada um.

/** Os degraus na ordem da conversa (5A): de "Sem reunião" a "Renovou". */
const DEGRAUS: SituacaoRenovacao[] = [
  'SEM_REUNIAO',
  'MARCADA',
  'FALTA_RESPOSTA',
  'QUER_RENOVAR',
  'NAO_QUER',
  'RENOVOU',
];

const RAIO = 54;
const VOLTA = 2 * Math.PI * RAIO;

export function PainelConversa({
  numeros: n,
  contagem,
  situacao,
  escolher,
}: {
  numeros: NumerosRenovacao;
  contagem: Record<SituacaoRenovacao, number>;
  situacao: SituacaoRenovacao | undefined;
  escolher: (s: SituacaoRenovacao | undefined) => void;
}) {
  const pct = n.pct ?? 0;
  return (
    <section className="rv-hero" aria-label="Números da renovação">
      <div className="rv-hero-pct">
        <div className="rv-anel">
          <svg viewBox="0 0 132 132" aria-hidden="true">
            <circle className="fundo" cx="66" cy="66" r={RAIO} />
            {n.pct !== null && n.pct > 0 && (
              <circle
                className="cheio"
                cx="66"
                cy="66"
                r={RAIO}
                strokeDasharray={`${(VOLTA * pct) / 100} ${VOLTA}`}
              />
            )}
          </svg>
          <b>{n.pct === null ? '—' : `${n.pct}%`}</b>
        </div>
        <span className="rv-anel-lb">% de renovação</span>
      </div>
      <div className="rv-hero-col">
        <div className="rv-st">
          <span className="lb">Renovaram</span>
          <b>{n.renovaram}</b>
          <small>últimos 12 meses</small>
        </div>
        <div className="rv-st">
          <span className="lb">Não renovaram</span>
          <b>{n.naoRenovaram}</b>
          <small>últimos 12 meses</small>
        </div>
      </div>
      <span className="rv-hero-div" aria-hidden="true" />
      <div className="rv-hero-funil">
        <div className="rv-hero-linha">
          <div className="rv-st">
            <span className="lb">Chegando</span>
            <b>{n.chegando}</b>
          </div>
          <div className="rv-st">
            <span className="lb">Já tiveram a reunião</span>
            <b>{n.jaTiveramReuniao}</b>
            <small>de {n.chegando}</small>
          </div>
        </div>
        <div className="rv-degraus" role="group" aria-label="Situação da conversa">
          <span className="rv-trilho" aria-hidden="true" />
          {DEGRAUS.map((s) => {
            const on = situacao === s;
            return (
              <button
                key={s}
                type="button"
                className={`rv-dg ${on ? 'on' : ''}`}
                aria-pressed={on}
                aria-label={`${SITUACAO_RENOVACAO_LABEL[s]}: ${contagem[s]}`}
                onClick={() => escolher(on ? undefined : s)}
              >
                <span className="bola">{contagem[s]}</span>
                <span className="nm">{SITUACAO_RENOVACAO_LABEL[s]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Contagem por situação, sobre a lista inteira (como os números, o filtro não muda). */
export function contarSituacoes(itens: readonly RenovacaoLinha[]) {
  const c = Object.fromEntries(SITUACOES_RENOVACAO.map((s) => [s, 0])) as Record<
    SituacaoRenovacao,
    number
  >;
  for (const i of itens) c[i.situacao] += 1;
  return c;
}

const DIA = 86_400_000;
const dia = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DIA;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Distância mínima entre dois rostos na mesma faixa, em % da largura. */
const FOLGA = 9;
/** Faixas: 0 e 2 acima do eixo, 1 e 3 abaixo. */
const FAIXAS = 4;

/** Cor do anel na linha: vermelho = terminou; verde = quer; azul = marcada; cinza = o resto. */
function anel(l: RenovacaoLinha, hoje: string) {
  if (l.terminoPrevisto < hoje) return 'fim';
  if (l.situacao === 'QUER_RENOVAR') return 'quer';
  if (l.situacao === 'MARCADA') return 'marcada';
  return 'neutro';
}

const primeiroNome = (l: RenovacaoLinha) =>
  (l.tipo === 'CASAL' ? l.nome.split(' e ') : [l.nome]).map((n) => n.split(' ')[0]).join(' e ');

/**
 * Linha do término: cada rosto no dia em que termina, com a cor da situação. Quem já renovou fica fora (o término
 * dele é do ano que vem). Faixas acima e abaixo do eixo para os rostos não se cobrirem.
 */
export function LinhaTermino({ itens, hoje }: { itens: RenovacaoLinha[]; hoje: string }) {
  const lista = itens
    .filter((l) => l.situacao !== 'RENOVOU')
    .sort((a, b) => a.terminoPrevisto.localeCompare(b.terminoPrevisto));
  if (lista.length === 0) return null;
  const h = dia(hoje);
  const ini = Math.min(h - 10, dia(lista[0]!.terminoPrevisto) - 4);
  const fim = Math.max(h + 60, dia(lista.at(-1)!.terminoPrevisto) + 6);
  const x = (d: number) => Math.min(96, Math.max(4, ((d - ini) / (fim - ini)) * 100));

  const ultimo = Array<number>(FAIXAS).fill(-Infinity);
  const pontos = lista.map((l) => {
    const px = x(dia(l.terminoPrevisto));
    let faixa = ultimo.findIndex((u) => px - u >= FOLGA);
    if (faixa < 0) faixa = ultimo.indexOf(Math.min(...ultimo));
    ultimo[faixa] = px;
    return { l, px, faixa };
  });
  const usadas = new Set(pontos.map((p) => p.faixa));
  const acimaLonge = usadas.has(2);
  const abaixoLonge = usadas.has(3);

  const meses: { x: number; nome: string }[] = [];
  const d0 = new Date(ini * DIA);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); ;) {
    const d = m.getTime() / DIA;
    if (d > fim) break;
    meses.push({ x: ((d - ini) / (fim - ini)) * 100, nome: MESES[m.getUTCMonth()]! });
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
  }
  const xHoje = ((h - ini) / (fim - ini)) * 100;

  return (
    <section className="card rv-linha" aria-labelledby="rv-linha-h">
      <h2 id="rv-linha-h">Quando cada um termina</h2>
      <p>Cada rosto fica no dia do término, com a cor da situação da conversa.</p>
      <div
        className={`rv-area ${acimaLonge ? 'acima2' : ''} ${abaixoLonge ? 'abaixo2' : ''}`.trim()}
      >
        <div className="rv-passado" style={{ width: `${xHoje}%` }}>
          <span>Já terminou</span>
        </div>
        <div className="rv-eixo" aria-hidden="true" />
        {meses.map((m) => (
          <span key={m.nome + m.x} className="rv-mes-tk" style={{ left: `${m.x}%` }}>
            {m.nome}
          </span>
        ))}
        <div className="rv-hoje" style={{ left: `${xHoje}%` }}>
          <span>Hoje, {diaMes(hoje)}</span>
        </div>
        <ul>
          {pontos.map(({ l, px, faixa }) => (
            <li
              key={l.inscricaoId}
              className={`rv-p f${faixa} ${anel(l, hoje)}`}
              style={{ left: `${px}%` }}
            >
              <span className="haste" aria-hidden="true" />
              <Link
                href={`/acompanhamento/ficha/${l.inscricaoId}?aba=jornada`}
                prefetch={false}
                aria-label={`${l.nome}, término ${diaMes(l.terminoPrevisto)}, ${l.situacaoRotulo}`}
              >
                <span className={`ava g${l.nome.length % 7}`} aria-hidden="true">
                  {l.nome.trim().slice(0, 1).toUpperCase()}
                </span>
                <b aria-hidden="true">{primeiroNome(l)}</b>
                <small aria-hidden="true">{diaMes(l.terminoPrevisto)}</small>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <ul className="rv-leg" aria-label="Cores">
        <li className="neutro">{SITUACAO_RENOVACAO_LABEL.SEM_REUNIAO}</li>
        <li className="marcada">{SITUACAO_RENOVACAO_LABEL.MARCADA}</li>
        <li className="neutro">{SITUACAO_RENOVACAO_LABEL.FALTA_RESPOSTA}</li>
        <li className="quer">{SITUACAO_RENOVACAO_LABEL.QUER_RENOVAR}</li>
        <li className="neutro">{SITUACAO_RENOVACAO_LABEL.NAO_QUER}</li>
        <li className="fim">Terminou</li>
      </ul>
    </section>
  );
}
