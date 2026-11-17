'use client';
import {
  MAX_TAREFAS_REUNIAO,
  nomePme,
  REUNIAO_TIPO_LABEL,
  type MetaDTO,
  type ReuniaoDTO,
  type TarefaDTO,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useState } from 'react';
import { button, control, FormError } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Tarefa } from './pme-atual';
import { diaHoraBR } from './ui';

const DIA_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Cobrança da reunião anterior (§4, passo 1): cada tarefa feita, parcial ou não feita. */
export function CobrancaAnterior({ r, atualizar }: { r: ReuniaoDTO; atualizar: () => void }) {
  const c = r.cobranca;
  const pendentes = c ? c.tarefas.filter((t) => t.status === 'PENDENTE').length : 0;
  return (
    <section className="card pa tr-bloco" aria-label="Cobrança da reunião anterior">
      <div className="pme-cab">
        <h3>Cobrança da reunião anterior</h3>
        {c && c.tarefas.length > 0 && (
          <span className={`tag ${pendentes ? 'gold' : 'ativo'}`}>
            {pendentes ? `${pendentes} a cobrar` : 'Tudo cobrado'}
          </span>
        )}
      </div>
      {c && c.tarefas.length > 0 ? (
        <>
          <p className="tr-origem">
            Combinadas em{' '}
            <Link className="underline" href={`/acompanhamento/reunioes/${c.reuniao.id}`}>
              {REUNIAO_TIPO_LABEL[c.reuniao.tipo]}, {diaHoraBR(c.reuniao.inicio)}
            </Link>
          </p>
          <ul className="pme-tarefas">
            {c.tarefas.map((t) => (
              <Tarefa key={t.id} t={t} atualizar={atualizar} metas={r.metasInscricao} />
            ))}
          </ul>
        </>
      ) : (
        <p className="pme-vazio-txt">
          Nenhuma tarefa combinada na última reunião realizada para cobrar.
        </p>
      )}
    </section>
  );
}

/** Tarefas da semana (§4): até 3, cada uma com prazo e, se quiser, a meta. */
export function TarefasSemana({ r, atualizar }: { r: ReuniaoDTO; atualizar: () => void }) {
  const dia = DIA_BR.format(new Date(r.inicio));
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [metaId, setMetaId] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cabe = r.tarefas.length < MAX_TAREFAS_REUNIAO;
  const metas = r.metasInscricao;

  async function combinar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setOcupado(true);
    try {
      await clientApi(`/api/mentoria/reunioes/${r.id}/tarefas`, 'POST', {
        descricao,
        prazo,
        metaId: metaId || null,
      });
      setDescricao('');
      setPrazo('');
      setMetaId('');
      atualizar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card pa tr-bloco" aria-label="Tarefas da semana">
      <div className="pme-cab">
        <h3>Tarefas da semana</h3>
        <span className="tr-conta">
          {r.tarefas.length} de {MAX_TAREFAS_REUNIAO}
        </span>
      </div>
      {r.tarefas.length > 0 ? (
        <ul className="pme-tarefas">
          {r.tarefas.map((t) => (
            <Tarefa key={t.id} t={t} atualizar={atualizar} metas={metas} combinar />
          ))}
        </ul>
      ) : (
        <p className="pme-vazio-txt">
          {r.podeTarefa
            ? 'Combine até 3 tarefas, cada uma com prazo. Cada uma vira cobrança no prazo.'
            : 'Nenhuma tarefa combinada nesta reunião.'}
        </p>
      )}
      {r.podeTarefa && cabe && (
        <form className="tr-nova" onSubmit={(e) => void combinar(e)} aria-label="Nova tarefa">
          <label className="f tr-nova-desc">
            <span>Tarefa</span>
            <input
              className={control}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={2000}
              required
              placeholder="Ex.: anotar todos os gastos da semana"
            />
          </label>
          <label className="f">
            <span>Prazo</span>
            <input
              className={control}
              type="date"
              min={dia}
              value={prazo}
              required
              onChange={(e) => setPrazo(e.target.value)}
            />
          </label>
          {metas.length > 0 && (
            <label className="f">
              <span>Meta (opcional)</span>
              <select
                className={control}
                value={metaId}
                onChange={(e) => setMetaId(e.target.value)}
              >
                <option value="">Nenhuma</option>
                {metas.map((m: MetaDTO) => (
                  <option key={m.id} value={m.id}>
                    {m.descricao ?? 'Meta'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="tr-nova-acoes">
            <FormError message={erro} />
            <button
              type="submit"
              className={`${button} sm`}
              disabled={ocupado || !descricao.trim() || !prazo}
            >
              Combinar tarefa
            </button>
          </div>
        </form>
      )}
      {r.podeTarefa && !cabe && (
        <p className="ob-nota">Limite de {MAX_TAREFAS_REUNIAO} tarefas por reunião.</p>
      )}
    </section>
  );
}

/** Ficha > Jornada: as tarefas combinadas nas reuniões, por PME (as do catálogo ficam no card). */
export function TarefasFicha({
  tarefas,
  metas,
  atualizar,
}: {
  tarefas: TarefaDTO[];
  metas: MetaDTO[];
  atualizar: () => void;
}) {
  const grupos: { chave: string; titulo: string; itens: TarefaDTO[] }[] = [];
  for (const t of tarefas) {
    const chave = t.cicloNumero === null ? 'sem' : String(t.cicloNumero);
    let g = grupos.find((x) => x.chave === chave);
    if (!g) {
      g = {
        chave,
        titulo: t.cicloNumero === null ? 'Fora de um PME' : nomePme(t.cicloNumero),
        itens: [],
      };
      grupos.push(g);
    }
    g.itens.push(t);
  }
  const [atual, ...antes] = grupos;
  return (
    <section className="tr" aria-label="Tarefas">
      <div className="pme-cab">
        <h3>Tarefas</h3>
      </div>
      {!atual ? (
        <p className="pme-vazio-txt">
          Nenhuma tarefa combinada em reunião ainda. Elas nascem no registro da reunião.
        </p>
      ) : (
        <>
          <Grupo g={atual} metas={metas} atualizar={atualizar} />
          {antes.length > 0 && (
            <details className="pme-hist">
              <summary>
                Tarefas anteriores <span>{antes.reduce((n, g) => n + g.itens.length, 0)}</span>
              </summary>
              {antes.map((g) => (
                <Grupo key={g.chave} g={g} metas={metas} atualizar={atualizar} />
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Grupo({
  g,
  metas,
  atualizar,
}: {
  g: { titulo: string; itens: TarefaDTO[] };
  metas: MetaDTO[];
  atualizar: () => void;
}) {
  const feitas = g.itens.filter((t) => t.status === 'FEITA').length;
  return (
    <div className="tr-grupo">
      <div className="tr-grupo-t">
        <b>{g.titulo}</b>
        <span>
          {feitas} de {g.itens.length} feitas
        </span>
      </div>
      <ul className="pme-tarefas">
        {g.itens.map((t) => (
          <Tarefa key={t.id} t={t} atualizar={atualizar} metas={metas} mostrarReuniao />
        ))}
      </ul>
    </div>
  );
}
