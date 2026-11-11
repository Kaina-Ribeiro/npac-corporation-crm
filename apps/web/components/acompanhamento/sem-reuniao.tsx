'use client';
import type { BaseSemReuniao, SemReuniao } from '@npac/shared/mentoria';
import Link from 'next/link';
import { quietButton } from '@/components/crm-ui';
import { FiltroMentoria } from './controle-mensal';
import { dataBR, Rostos } from './ui';

const BASE: Record<BaseSemReuniao, string> = {
  REUNIAO: 'última reunião',
  IDR: 'IDR',
  IMPORTACAO: 'importação',
  INICIO: 'início da jornada',
  CADASTRO: 'cadastro',
};

/** Aba Reuniões, "Sem reunião": ativos sem reunião realizada há mais de 30 dias (§6). */
export function SemReuniaoTela({
  dados,
  mentoria,
  podeAgendar,
}: {
  dados: SemReuniao;
  mentoria: string;
  podeAgendar: boolean;
}) {
  const href = (m: string) =>
    `/acompanhamento/reunioes?${new URLSearchParams(m ? { aba: 'sem', mentoria: m } : { aba: 'sem' })}`;
  return (
    <div className="rn-corpo">
      <div className="rn-barra">
        <FiltroMentoria atual={mentoria} href={href} />
      </div>
      <section className="card overflow-hidden" aria-label="Sem reunião há mais de 30 dias">
        <h2 className="ob-h">
          Sem reunião há mais de 30 dias<span>{dados.itens.length}</span>
        </h2>
        {dados.itens.length === 0 ? (
          <p className="ob-vazio">Todos os ativos tiveram reunião nos últimos 30 dias.</p>
        ) : (
          <ul>
            {dados.itens.map((l) => (
              <li key={l.inscricaoId} className="pl-r">
                <Link
                  className="pl-id"
                  href={`/acompanhamento/ficha/${l.inscricaoId}?aba=historico`}
                >
                  <Rostos pessoas={l.pessoas} />
                  <div className="nm">
                    {l.nome}
                    <small>
                      Desde {dataBR(l.desde)} ({BASE[l.base]})
                      {l.responsavel ? `, ${l.responsavel}` : ''}
                    </small>
                  </div>
                </Link>
                <div className="pl-meta">
                  <span className="tag canc">{l.dias} dias</span>
                  <span className="tag gold">{l.mentoria}</span>
                  {podeAgendar && (
                    <Link
                      className={`${quietButton} sm`}
                      href={`/acompanhamento/reunioes/nova?inscricao=${l.inscricaoId}`}
                    >
                      Agendar
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
