'use client';
import { PERFIL_LABEL, type AcaoItem, type FichaDTO } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { keep, recall } from '@/lib/screen-memory';
import { showToast } from '@/components/toast';
import {
  filaDeSalvamento,
  ouvirCampo,
  registrarVersion,
  salvarCampo,
} from '@/lib/acompanhamento-saver';
import { dataBR, ICONES, Icone } from './ui';

export const chaveAcao = (a: Pick<AcaoItem, 'id' | 'inscricaoId'>) =>
  `acao:${a.inscricaoId}:${a.id}`;
export const linkAcao = (a: Pick<AcaoItem, 'id'>) => `/acompanhamento/plano/acao/${a.id}`;
export const responsavelDe = (a: AcaoItem) => a.responsavel ?? PERFIL_LABEL[a.responsavelPerfil];

/**
 * Feita/pendente da ação na hora do clique (NPAC-47). Salva pela fila de salvamento (409: ela
 * reaplica ou mantém o valor de quem mudou antes e avisa); erro volta ao anterior, e a mensagem da
 * API aparece no aviso da tela. O valor confirmado fica até a tela recarregar, sem piscar.
 */
export function useAcaoFeita(a: AcaoItem, aoMudar: () => void) {
  const [confirmado, setConfirmado] = useState<AcaoItem['status'] | null>(null);
  const [status, setStatus] = useOptimistic(confirmado ?? a.status);
  const [, startTransition] = useTransition();
  useEffect(() => {
    registrarVersion(chaveAcao(a), a.version);
    setConfirmado(null);
  }, [a]);
  const alternar = () => {
    const novo = status === 'FEITA' ? 'PENDENTE' : 'FEITA';
    const visto = status;
    startTransition(async () => {
      setStatus(novo);
      const chave = chaveAcao(a);
      let falhou = false;
      const off = ouvirCampo(chave, 'status', {
        mudou: () => (falhou = true),
        erro: () => (falhou = true),
      });
      salvarCampo(chave, 'status', novo, visto);
      await filaDeSalvamento().idle();
      off();
      if (!falhou) {
        setConfirmado(novo);
        showToast();
      }
      aoMudar();
    });
  };
  return { acao: status === a.status ? a : { ...a, status }, alternar };
}

/** Marca e desmarca a ação. Sem permissão, é só o sinal de feita. */
export function BotaoFeita({
  a,
  alternar,
  rotulo,
}: {
  a: AcaoItem;
  alternar: () => void;
  rotulo: string;
}) {
  const feita = a.status === 'FEITA';
  return (
    <button
      type="button"
      className={`check sm ${feita ? 'done' : ''}`}
      aria-pressed={feita}
      aria-label={`${feita ? 'Reabrir' : 'Marcar feita'}: ${rotulo}`}
      disabled={!a.podeEditar}
      onClick={alternar}
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
        <AcaoDoMes key={a.id} a={a} aoMudar={atualizar} />
      ))}
    </div>
  );
}

function AcaoDoMes({ a: inicial, aoMudar }: { a: AcaoItem; aoMudar: () => void }) {
  const { acao: a, alternar } = useAcaoFeita(inicial, aoMudar);
  return (
    <div className="acao">
      <BotaoFeita a={a} alternar={alternar} rotulo={a.foco} />
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
  );
}
