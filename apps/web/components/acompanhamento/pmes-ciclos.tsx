'use client';
import {
  CICLO_STATUS,
  CICLO_STATUS_LABEL,
  nomePme,
  type PmeCicloLinha,
} from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { control, quietButton } from '@/components/crm-ui';
import {
  filtroDasPrefs,
  lembrarAc,
  PMES_REGRAS,
  prefsDoFiltro,
  type FiltroPmes,
} from '@/lib/acompanhamento-prefs';
import { clientApi } from '@/lib/client-api';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { TagCiclo } from './pme-atual';
import { dataBR } from './ui';

const NUMEROS = Array.from({ length: 12 }, (_, i) => i + 1);
const curta = (iso: string) => dataBR(iso).slice(0, 5);

function Linha({ l, primeira }: { l: PmeCicloLinha; primeira: boolean }) {
  const c = l.ciclo;
  const tag = c ? (
    <TagCiclo
      c={{
        status: c.status,
        diasAtraso: c.diasAtraso,
        segundaChanceAte: c.status === 'SEGUNDA_CHANCE' ? c.prazoAtual : null,
      }}
    />
  ) : (
    <span className="tag">Nenhum PME</span>
  );
  const pct = c?.pctTarefas != null ? `${c.pctTarefas}%` : '—';
  const extras = c && c.extrasTotal > 0 ? `${c.extrasFeitas} de ${c.extrasTotal}` : '—';
  const encerramento = c ? (c.encerramentoFeito ? 'Feito' : 'Pendente') : '—';
  const proximo = l.proximoPme ? `${l.proximoPme}º PME` : '—';
  return (
    <Link
      className={`pc-row ${primeira ? 'primeira' : ''}`}
      href={`/acompanhamento/ficha/${l.inscricaoId}?aba=jornada`}
      prefetch={false}
    >
      <div className="pc-nm">
        {l.nome}
        <small>
          {l.mentoria}
          {l.responsavel ? `, ${l.responsavel}` : ''}
        </small>
      </div>
      <span className="pc-pme">{c ? nomePme(c.numero, c.titulo) : '—'}</span>
      <span className="pc-datas">
        {c ? (
          <>
            Envio {curta(c.enviadoEm)}
            <small>Prazo {curta(c.prazoAtual)}</small>
          </>
        ) : (
          '—'
        )}
      </span>
      <span className="pc-st">{tag}</span>
      <span className="pc-n">{pct}</span>
      <span className="pc-n">{extras}</span>
      <span className="pc-n">{encerramento}</span>
      <span className={`pc-prox ${l.proximoPme ? 'on' : ''}`}>{proximo}</span>
      <div className="pc-mob">
        {c && (
          <span>
            {nomePme(c.numero, c.titulo)}: envio {curta(c.enviadoEm)}, prazo {curta(c.prazoAtual)}
          </span>
        )}
        {c && (
          <span>
            {[
              c.pctTarefas != null ? `${pct} das tarefas` : null,
              c.extrasTotal > 0 ? `extras ${extras}` : null,
              `encerramento ${encerramento.toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(', ')
              .replace(/^./, (x) => x.toUpperCase())}
          </span>
        )}
        {l.proximoPme && <b>Próximo a enviar: {proximo}</b>}
      </div>
    </Link>
  );
}

/**
 * Aba 7 "PMEs e ciclos" (E22, PDF p. 6): quem está em qual PME, envio e prazo, status, % de
 * tarefas, extras feitas, encerramento e o próximo PME a enviar. Cada linha abre a ficha.
 */
export function PmesCiclos({
  linhas,
  inicial,
  lembrar,
}: {
  linhas: PmeCicloLinha[];
  inicial: FiltroPmes;
  /** Cookie dos filtros lembrados (NPAC-46) e o valor que o servidor usou. */
  lembrar: { cookie: string; valor: string };
}) {
  const [f, setF] = useState<FiltroPmes>(inicial);
  useLatestPrefs(lembrar.cookie, lembrar.valor, (salvo) =>
    setF(filtroDasPrefs(readPrefs(salvo, PMES_REGRAS))),
  );
  const [dados, setDados] = useState(linhas);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const pedido = useRef(0);
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    lembrarAc('pmes', lembrar.cookie, writePrefs(prefsDoFiltro(f), PMES_REGRAS));
    const n = ++pedido.current;
    setCarregando(true);
    clientApi<PmeCicloLinha[]>('/api/mentoria/pmes-ciclos', 'POST', f)
      .then((l) => {
        if (n !== pedido.current) return;
        setDados(l);
        setErro('');
      })
      .catch((e: Error) => n === pedido.current && setErro(e.message))
      .finally(() => n === pedido.current && setCarregando(false));
  }, [f]);

  const filtrando = !!(f.numero || f.status);
  const aEnviar = dados.filter((l) => l.proximoPme).length;
  const atrasados = dados.filter((l) => (l.ciclo?.diasAtraso ?? 0) > 0).length;

  return (
    <section className="view">
      <div className="hrow">
        <div>
          <h1 className="h1">PMEs e ciclos</h1>
          <p className="sub">
            {dados.length} {dados.length === 1 ? 'mentorado ativo' : 'mentorados ativos'}
            {filtrando ? ' com estes filtros' : ''}: {atrasados}{' '}
            {atrasados === 1 ? 'PME atrasado' : 'PMEs atrasados'}, {aEnviar} com PME a enviar.
          </p>
        </div>
      </div>

      <div className="pc-filtros">
        <select
          className={control}
          aria-label="PME"
          value={f.numero ?? ''}
          onChange={(e) =>
            setF({ ...f, numero: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">Todos os PMEs</option>
          {NUMEROS.map((n) => (
            <option key={n} value={n}>
              {n}º PME
            </option>
          ))}
        </select>
        <select
          className={control}
          aria-label="Status do PME"
          value={f.status ?? ''}
          onChange={(e) =>
            setF({ ...f, status: (e.target.value || undefined) as FiltroPmes['status'] })
          }
        >
          <option value="">Todos os status</option>
          {CICLO_STATUS.map((s) => (
            <option key={s} value={s}>
              {CICLO_STATUS_LABEL[s]}
            </option>
          ))}
          <option value="SEM_PME">Nenhum PME</option>
        </select>
        {filtrando && (
          <button type="button" className={quietButton} onClick={() => setF({})}>
            Limpar filtros
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      <section className="card overflow-hidden" aria-busy={carregando}>
        {dados.length > 0 && (
          <div className="pc-head">
            <span>Mentorado</span>
            <span>PME atual</span>
            <span>Envio e prazo</span>
            <span>Status</span>
            <span>% tarefas</span>
            <span>Extras feitas</span>
            <span>Encerramento</span>
            <span>Próximo PME</span>
          </div>
        )}
        {dados.map((l, i) => (
          <Linha key={l.inscricaoId} l={l} primeira={i === 0} />
        ))}
        {dados.length === 0 && (
          <div className="vazio">
            <h2>{filtrando ? 'Nada com estes filtros' : 'Nenhum mentorado ativo'}</h2>
            <p>
              {filtrando
                ? 'Tire um filtro para ver mais mentorados.'
                : 'Quem está ativo aparece aqui com o PME em que está.'}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
