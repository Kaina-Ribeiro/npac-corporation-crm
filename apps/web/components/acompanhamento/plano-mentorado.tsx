'use client';
import { PERFIL_LABEL, type AcaoItem, type FichaDTO } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { keep, recall } from '@/lib/screen-memory';
import { filaDeSalvamento, registrarVersion, salvarCampo } from '@/lib/acompanhamento-saver';
import { dataBR, ICONES, Icone } from './ui';

export const chaveAcao = (a: Pick<AcaoItem, 'id' | 'inscricaoId'>) =>
  `acao:${a.inscricaoId}:${a.id}`;
export const linkAcao = (a: Pick<AcaoItem, 'id'>) => `/acompanhamento/plano/acao/${a.id}`;
export const responsavelDe = (a: AcaoItem) => a.responsavel ?? PERFIL_LABEL[a.responsavelPerfil];

/** Marca e desmarca a ação. Sem permissão, é só o sinal de feita. */
export function BotaoFeita({
  a,
  aoMudar,
  rotulo,
}: {
  a: AcaoItem;
  aoMudar: () => void;
  rotulo: string;
}) {
  useEffect(() => {
    registrarVersion(chaveAcao(a), a.version);
  }, [a]);
  const feita = a.status === 'FEITA';
  return (
    <button
      type="button"
      className={`check sm ${feita ? 'done' : ''}`}
      aria-pressed={feita}
      aria-label={`${feita ? 'Reabrir' : 'Marcar feita'}: ${rotulo}`}
      disabled={!a.podeEditar}
      onClick={() => {
        salvarCampo(chaveAcao(a), 'status', feita ? 'PENDENTE' : 'FEITA', a.status);
        void filaDeSalvamento().idle().then(aoMudar);
      }}
    >
      <Icone d={ICONES.check} largura={3} />
    </button>
  );
}

export function TagAcao({ a }: { a: AcaoItem }) {
  if (a.status === 'FEITA') return <span className="tag ativo">Feita</span>;
  if (a.atrasada) return <span className="tag canc">Atrasada</span>;
  if (a.anteriorAoSistema) return <span className="tag">Antes do sistema</span>;
  return null;
}

const mesInicial = (meses: number[], atual: number | null) => {
  if (atual === null) return meses[0]!;
  return meses.find((m) => m >= atual) ?? meses.at(-1)!;
};

/** Ações do plano na Jornada da ficha: um mês por vez, para não virar uma lista comprida. */
export function PlanoMentorado({
  ficha,
  atualizar,
  memoria,
}: {
  ficha: FichaDTO;
  atualizar: () => void;
  /** Chave da memória da aba (NPAC-46): o mês escolhido volta, por ficha, até o F5. */
  memoria: string;
}) {
  const meses = [...new Set(ficha.acoes.map((a) => a.mes))].sort((a, b) => a - b);
  const [mes, setMesState] = useState(() => mesInicial(meses, ficha.mesJornada));
  const chave = `${memoria}:plano:${ficha.id}`;
  const setMes = (m: number) => {
    setMesState(m);
    keep(chave, m);
  };
  const lembrado = recall<number>(chave);
  // Depois de montar: no servidor a memória não existe (sem diferença na hidratação).
  useEffect(() => {
    if (lembrado !== undefined && meses.includes(lembrado)) setMesState(lembrado);
  }, [chave]);
  const doMes = ficha.acoes.filter((a) => a.mes === mes);
  return (
    <div>
      <h3>Ações do plano</h3>
      <div className="pl-meses" role="group" aria-label="Mês do plano">
        {meses.map((m) => {
          const doM = ficha.acoes.filter((a) => a.mes === m);
          const estado = doM.some((a) => a.atrasada)
            ? 'ruim'
            : doM.every((a) => a.status === 'FEITA')
              ? 'ok'
              : '';
          return (
            <button
              key={m}
              type="button"
              className={`pl-m ${estado} ${m === mes ? 'on' : ''}`}
              aria-pressed={m === mes}
              aria-label={`Mês ${m}`}
              onClick={() => setMes(m)}
            >
              {m}
            </button>
          );
        })}
      </div>
      {doMes.map((a) => (
        <div className="acao" key={a.id}>
          <BotaoFeita a={a} aoMudar={atualizar} rotulo={a.foco} />
          <Link href={linkAcao(a)} className="min-w-0">
            <b>{a.foco}</b>
            <span>{a.acao}</span>
            <span className="meta">
              {dataBR(a.dataPrevista)}, {responsavelDe(a)}
              {a.itens.length > 0 && `, ${a.itensFeitos.length} de ${a.itens.length} passos`}
            </span>
          </Link>
          <TagAcao a={a} />
        </div>
      ))}
    </div>
  );
}
