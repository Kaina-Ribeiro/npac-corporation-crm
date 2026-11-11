'use client';
import { MENTORIAS, type ControleMensal, type LinhaControle } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quietButton } from '@/components/crm-ui';
import { dataBR, diaHoraBR, Rostos } from './ui';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;

export function FiltroMentoria({
  atual,
  href,
}: {
  atual: string;
  href: (mentoria: string) => string;
}) {
  return (
    <div className="seg rn-seg" role="group" aria-label="Mentoria">
      {['', ...MENTORIAS].map((m) => (
        <Link key={m || 'todas'} className={atual === m ? 'on' : ''} href={href(m)}>
          {m || 'Todas'}
        </Link>
      ))}
    </div>
  );
}

function Linha({ l, podeAgendar }: { l: LinhaControle; podeAgendar: boolean }) {
  const detalhe =
    l.realizadas > 0
      ? `${l.realizadas} ${l.realizadas === 1 ? 'realizada' : 'realizadas'} no mês`
      : l.agendada
        ? `Agendada para ${diaHoraBR(l.agendada)}`
        : l.ultimaRealizada
          ? `Última em ${dataBR(l.ultimaRealizada)}`
          : 'Nenhuma reunião realizada';
  return (
    <li className="pl-r">
      <Link className="pl-id" href={`/acompanhamento/ficha/${l.inscricaoId}?aba=historico`}>
        <Rostos pessoas={l.pessoas} />
        <div className="nm">
          {l.nome}
          <small>{detalhe}</small>
        </div>
      </Link>
      <div className="pl-meta">
        <span className="tag gold">{l.mentoria}</span>
        {podeAgendar && l.realizadas === 0 && !l.agendada && (
          <Link
            className={`${quietButton} sm`}
            href={`/acompanhamento/reunioes/nova?inscricao=${l.inscricaoId}`}
          >
            Agendar
          </Link>
        )}
      </div>
    </li>
  );
}

/** Aba Reuniões, "Controle mensal": quem já teve a reunião do mês e quem falta (D17). */
export function ControleMensalTela({
  dados,
  mentoria,
  podeAgendar,
}: {
  dados: ControleMensal;
  mentoria: string;
  podeAgendar: boolean;
}) {
  const router = useRouter();
  const href = (mes: string, m: string) => {
    const q = new URLSearchParams({ aba: 'controle', mes });
    if (m) q.set('mentoria', m);
    return `/acompanhamento/reunioes?${q}`;
  };
  const { realizadas, faltas, taxa } = dados.comparecimento;
  return (
    <div className="rn-corpo">
      <div className="rn-barra">
        <label className="rn-filtro">
          <span>Mês</span>
          <input
            className="field"
            type="month"
            value={dados.mes}
            onChange={(e) => e.target.value && router.push(href(e.target.value, mentoria))}
          />
        </label>
        <FiltroMentoria atual={mentoria} href={(m) => href(dados.mes, m)} />
      </div>

      <section className="card rn-kpis" aria-label={`Resumo de ${nomeMes(dados.mes)}`}>
        <div>
          <b>{dados.fizeram.length}</b>
          <span>Já fizeram</span>
        </div>
        <div>
          <b className={dados.faltam.length ? 'ruim' : ''}>{dados.faltam.length}</b>
          <span>Faltam</span>
        </div>
        <div>
          <b>{taxa === null ? '—' : `${taxa}%`}</b>
          <span>
            Comparecimento
            <small>
              {realizadas} {realizadas === 1 ? 'realizada' : 'realizadas'}, {faltas}{' '}
              {faltas === 1 ? 'falta' : 'faltas'}
            </small>
          </span>
        </div>
      </section>

      <div className="pl-corpo">
        <section className="card overflow-hidden" aria-label="Faltam">
          <h2 className="ob-h">
            Faltam<span>{dados.faltam.length}</span>
            <em>{nomeMes(dados.mes)}</em>
          </h2>
          {dados.faltam.length === 0 ? (
            <p className="ob-vazio">Todos os ativos já tiveram reunião neste mês.</p>
          ) : (
            <ul>
              {dados.faltam.map((l) => (
                <Linha key={l.inscricaoId} l={l} podeAgendar={podeAgendar} />
              ))}
            </ul>
          )}
        </section>
        <section className="card overflow-hidden pl-estreita" aria-label="Já fizeram">
          <h2 className="ob-h">
            Já fizeram<span>{dados.fizeram.length}</span>
          </h2>
          {dados.fizeram.length === 0 ? (
            <p className="ob-vazio">Nenhuma reunião realizada neste mês.</p>
          ) : (
            <ul>
              {dados.fizeram.map((l) => (
                <Linha key={l.inscricaoId} l={l} podeAgendar={podeAgendar} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
