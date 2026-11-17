'use client';
import {
  REUNIAO_TIPO_LABEL,
  type AgendaSemana,
  type Condutor,
  type ReuniaoItem,
  type ReuniaoStatus,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { button, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { dataBR, diaBR, horaBR, ICONES, Icone, Rostos, TagReuniao } from './ui';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** O passo seguinte que a Operação dá na lista, sem abrir a reunião. */
const PASSO: Partial<Record<ReuniaoStatus, { para: ReuniaoStatus; rotulo: string }>> = {
  AGENDADA: { para: 'CONFIRMADA', rotulo: 'Confirmar' },
  CONFIRMADA: { para: 'LINK_ENVIADO', rotulo: 'Link enviado' },
};

export const linkReuniao = (r: { id: string }) => `/acompanhamento/reunioes/${r.id}`;

export const quemConduz = (r: ReuniaoItem) =>
  r.conduzidaPor?.nome ?? r.condutorInscricao?.nome ?? 'Sem condutor';

export function AcaoRapida({ r, aoMudar }: { r: ReuniaoItem; aoMudar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const passo = PASSO[r.status];
  if (!r.podeEditar) return null;
  if (!passo) {
    if (r.status === 'LINK_ENVIADO' && r.jaComecou)
      return (
        <Link className={`${button} sm`} href={linkReuniao(r)} prefetch={false}>
          Registrar
        </Link>
      );
    return null;
  }
  return (
    <button
      type="button"
      className={`${quietButton} sm`}
      disabled={ocupado}
      aria-label={`${passo.rotulo}: ${r.nome}`}
      onClick={async () => {
        setOcupado(true);
        try {
          await clientApi(`/api/mentoria/reunioes/${r.id}`, 'PATCH', {
            version: r.version,
            status: passo.para,
          });
        } finally {
          setOcupado(false);
          aoMudar();
        }
      }}
    >
      {passo.rotulo}
    </button>
  );
}

export function LinhaReuniao({
  r,
  aoMudar,
  comDia = false,
}: {
  r: ReuniaoItem;
  aoMudar: () => void;
  comDia?: boolean;
}) {
  return (
    <li className="pl-r rn-r">
      <span className="rn-hora">
        {comDia && <small>{dataBR(diaBR(r.inicio)).slice(0, 5)}</small>}
        {horaBR(r.inicio)}
      </span>
      <Link className="pl-id" href={linkReuniao(r)} prefetch={false}>
        <Rostos pessoas={r.pessoas} />
        <div className="nm">
          {r.nome}
          <small>
            {REUNIAO_TIPO_LABEL[r.tipo]}
            {r.plataforma ? `, ${r.plataforma === 'ZOOM' ? 'Zoom' : 'Meet'}` : ''}
          </small>
        </div>
      </Link>
      <div className="pl-meta">
        <TagReuniao status={r.status} />
        <AcaoRapida r={r} aoMudar={aoMudar} />
      </div>
    </li>
  );
}

/** Aba Reuniões, "Agenda": a semana (Brasília) por quem conduz. */
export function ReunioesAgenda({
  dados,
  condutores,
  condutorId,
  podeAgendar,
}: {
  dados: AgendaSemana;
  condutores: Condutor[];
  condutorId: string;
  podeAgendar: boolean;
}) {
  const router = useRouter();
  const atualizar = () => router.refresh();

  const filtro = (dia: string, condutor: string) => {
    const q = new URLSearchParams({ aba: 'agenda', dia });
    if (condutor) q.set('condutor', condutor);
    return `/acompanhamento/reunioes?${q}`;
  };
  const grupos = new Map<string, ReuniaoItem[]>();
  for (const r of dados.reunioes) {
    const quem = quemConduz(r);
    grupos.set(quem, [...(grupos.get(quem) ?? []), r]);
  }
  const ordem = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const estaSemana = dados.hoje >= dados.inicio && dados.hoje <= dados.fim;

  return (
    <div className="rn-corpo">
      <div className="rn-barra">
        <div className="rn-semana" role="group" aria-label="Semana">
          <Link
            className={`${quietButton} sm`}
            href={filtro(somarDias(dados.inicio, -7), condutorId)}
            aria-label="Semana anterior"
          >
            <Icone d={ICONES.voltar} />
          </Link>
          <b>
            {dataBR(dados.inicio).slice(0, 5)} a {dataBR(dados.fim).slice(0, 5)}
          </b>
          <Link
            className={`${quietButton} sm`}
            href={filtro(somarDias(dados.inicio, 7), condutorId)}
            aria-label="Próxima semana"
          >
            <Icone d={ICONES.seta} />
          </Link>
          {!estaSemana && (
            <Link className="rn-hoje" href={filtro(dados.hoje, condutorId)}>
              Esta semana
            </Link>
          )}
        </div>
        <label className="rn-filtro">
          <span>Quem conduz</span>
          <select
            className="field"
            value={condutorId}
            onChange={(e) => router.push(filtro(dados.inicio, e.target.value))}
          >
            <option value="">Todos</option>
            {condutores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        {podeAgendar && (
          <Link className={`${button} sm rn-nova`} href="/acompanhamento/reunioes/nova">
            <Icone d={ICONES.mais} />
            Agendar reunião
          </Link>
        )}
      </div>

      {ordem.length === 0 && (
        <section className="card">
          <p className="ob-vazio">Nenhuma reunião nesta semana.</p>
        </section>
      )}
      <div className="rn-grupos">
        {ordem.map((quem) => {
          const lista = grupos.get(quem)!;
          const dias = [...new Set(lista.map((r) => diaBR(r.inicio)))];
          return (
            <section key={quem} className="card overflow-hidden" aria-label={quem}>
              <h2 className="ob-h">
                {quem}
                <span>{lista.length}</span>
              </h2>
              {dias.map((d) => (
                <div key={d}>
                  <h3 className="pl-dia">
                    {d === dados.hoje ? 'Hoje' : diaSemana(d)}, {dataBR(d).slice(0, 5)}
                  </h3>
                  <ul>
                    {lista
                      .filter((r) => diaBR(r.inicio) === d)
                      .map((r) => (
                        <LinhaReuniao key={r.id} r={r} aoMudar={atualizar} />
                      ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
