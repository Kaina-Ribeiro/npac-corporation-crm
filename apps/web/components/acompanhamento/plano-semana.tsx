'use client';
import type {
  AcaoItem,
  InscricaoItem,
  PaginaAcoes,
  PaginaInscricoes,
  PlanoSemana as Semana,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { BotaoFeita, linkAcao, responsavelDe, TagAcao } from './plano-mentorado';
import { dataBR, ICONES, Icone, Rostos, rotuloMes, Trilha } from './ui';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;

function Linha({ a, aoMudar, comData }: { a: AcaoItem; aoMudar: () => void; comData: boolean }) {
  return (
    <li className="pl-r">
      <BotaoFeita a={a} aoMudar={aoMudar} rotulo={`${a.nome}, ${a.foco}`} />
      <Link className="pl-id" href={linkAcao(a)} prefetch={false}>
        <Rostos pessoas={a.pessoas} />
        <div className="nm">
          {a.nome}
          <small>
            Mês {a.mes}, {a.foco}
          </small>
        </div>
      </Link>
      <div className="pl-meta">
        {comData && <span>{dataBR(a.dataPrevista)}</span>}
        <span>{responsavelDe(a)}</span>
        <TagAcao a={a} />
      </div>
    </li>
  );
}

/** Aba Plano, "Esta semana": o que vence de segunda a domingo e o que já passou. */
export function PlanoSemana({ dados }: { dados: Semana }) {
  const router = useRouter();
  const atualizar = () => router.refresh();
  const dias = [...new Set(dados.semana.map((a) => a.dataPrevista))];
  return (
    <div className="pl-corpo">
      <section className="card overflow-hidden" aria-label="Vence esta semana">
        <h2 className="ob-h">
          Vence esta semana<span>{dados.semana.length}</span>
          <em>
            {dataBR(dados.inicio).slice(0, 5)} a {dataBR(dados.fim).slice(0, 5)}
          </em>
        </h2>
        {dias.length === 0 && <p className="ob-vazio">Nenhuma ação vence esta semana.</p>}
        {dias.map((d) => (
          <div key={d}>
            <h3 className="pl-dia">
              {d === dados.hoje ? 'Hoje' : diaSemana(d)}, {dataBR(d).slice(0, 5)}
            </h3>
            <ul>
              {dados.semana
                .filter((a) => a.dataPrevista === d)
                .map((a) => (
                  <Linha key={a.id} a={a} aoMudar={atualizar} comData={false} />
                ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="card overflow-hidden pl-estreita" aria-label="Atrasadas">
        <h2 className="ob-h">
          Atrasadas<span>{dados.atrasadasTotal}</span>
        </h2>
        {dados.atrasadas.length === 0 ? (
          <p className="ob-vazio">Nada atrasado.</p>
        ) : (
          <ul>
            {dados.atrasadas.map((a) => (
              <Linha key={a.id} a={a} aoMudar={atualizar} comData />
            ))}
          </ul>
        )}
        {dados.atrasadasTotal > dados.atrasadas.length && (
          <p className="ob-vazio">
            Mostrando as {dados.atrasadas.length} mais antigas de {dados.atrasadasTotal}.
          </p>
        )}
      </section>
    </div>
  );
}

const MESES = Array.from({ length: 13 }, (_, i) => i + 1);

/** Aba Plano, "Por mês": as ações daquele mês da jornada, em toda a carteira. */
export function PlanoMes({ mes, inicial }: { mes: number; inicial: PaginaAcoes }) {
  const router = useRouter();
  const [extra, setExtra] = useState<AcaoItem[]>([]);
  const [cursor, setCursor] = useState(inicial.cursor);
  useEffect(() => {
    setExtra([]);
    setCursor(inicial.cursor);
  }, [inicial]);
  const itens = [
    ...inicial.itens,
    ...extra.filter((e) => !inicial.itens.some((i) => i.id === e.id)),
  ];

  async function mais() {
    const p = await clientApi<PaginaAcoes>('/api/mentoria/plano/lista', 'POST', { mes, cursor });
    setExtra((x) => [...x, ...p.itens]);
    setCursor(p.cursor);
  }

  return (
    <>
      <div className="pl-meses" role="group" aria-label="Mês da jornada">
        {MESES.map((m) => (
          <Link
            key={m}
            className={`pl-m ${m === mes ? 'on' : ''}`}
            aria-current={m === mes ? 'true' : undefined}
            aria-label={`Mês ${m}`}
            href={`/acompanhamento/plano?aba=mes&mes=${m}`}
          >
            {m}
          </Link>
        ))}
      </div>
      <section className="card overflow-hidden" aria-label={`Ações do mês ${mes}`}>
        <h2 className="ob-h">
          Mês {mes}
          <span>{inicial.total}</span>
        </h2>
        {itens.length === 0 ? (
          <p className="ob-vazio">Nenhuma ação neste mês.</p>
        ) : (
          <ul>
            {itens.map((a) => (
              <Linha key={a.id} a={a} aoMudar={() => router.refresh()} comData />
            ))}
          </ul>
        )}
      </section>
      {cursor && (
        <button type="button" className={`${quietButton} ver-mais`} onClick={() => void mais()}>
          Carregar mais
        </button>
      )}
    </>
  );
}

/** Aba Plano, "Por mentorado": progresso de cada um; o plano abre na Jornada da ficha. */
export function PlanoMentorados({ inicial }: { inicial: PaginaInscricoes }) {
  const [itens, setItens] = useState<InscricaoItem[]>(inicial.itens);
  const [cursor, setCursor] = useState(inicial.cursor);

  async function mais() {
    const p = await clientApi<PaginaInscricoes>('/api/mentoria/inscricoes/lista', 'POST', {
      status: 'ATIVO',
      cursor,
    });
    setItens((x) => [...x, ...p.itens]);
    setCursor(p.cursor);
  }

  return (
    <>
      <section className="card overflow-hidden" aria-label="Por mentorado">
        <h2 className="ob-h">
          Mentorados ativos<span>{inicial.total}</span>
        </h2>
        {itens.length === 0 && <p className="ob-vazio">Nenhum mentorado ativo.</p>}
        <ul>
          {itens.map((r) => (
            <li key={r.id}>
              <Link
                className="pl-p"
                href={`/acompanhamento/ficha/${r.id}?aba=jornada`}
                prefetch={false}
              >
                <div className="pl-id">
                  <Rostos pessoas={r.pessoas} />
                  <div className="nm">
                    {r.nome}
                    <small>
                      {r.mentoria}, {rotuloMes(r.mesJornada, r.mentoria)}
                    </small>
                  </div>
                </div>
                <div className="pl-prog">
                  <Trilha mes={r.mesJornada} />
                  <span>
                    {r.plano.total > 0
                      ? `${r.plano.feitas} de ${r.plano.total} ações`
                      : 'Sem plano ainda'}
                  </span>
                </div>
                {r.plano.atrasadas > 0 && (
                  <span className="tag canc">
                    {r.plano.atrasadas} {r.plano.atrasadas === 1 ? 'atrasada' : 'atrasadas'}
                  </span>
                )}
                <Icone d={ICONES.seta} className="seta" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {cursor && (
        <button type="button" className={`${quietButton} ver-mais`} onClick={() => void mais()}>
          Carregar mais
        </button>
      )}
    </>
  );
}
