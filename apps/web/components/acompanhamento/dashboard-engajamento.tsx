'use client';
import {
  ENGAJAMENTO_COR,
  GRUPO_ENGAJAMENTO_LABEL,
  pctDoTotal,
  rotuloMentoria,
  type GrupoEngajamento,
  type PainelEngajamento,
  type PessoaEngajamento,
} from '@npac/shared/engajamento';
import { TIPO_INSCRICAO_LABEL } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useState } from 'react';
import { Rostos } from './ui';

/** No celular a lista do grupo escolhido mostra estes primeiro; "Ver todos" abre o resto. */
const NO_CELULAR = 5;

function Pessoa({ p }: { p: PessoaEngajamento }) {
  return (
    <li>
      <Link className="eg-p" href={`/acompanhamento/ficha/${p.inscricaoId}`} prefetch={false}>
        <Rostos pessoas={p.pessoas} />
        <span className="nm">
          {p.nome}
          <small>
            {TIPO_INSCRICAO_LABEL[p.tipo]}, {rotuloMentoria(p.mentoria, p.variante)}
          </small>
        </span>
      </Link>
    </li>
  );
}

/**
 * Bloco "Engajamento" do Dashboard (NPAC-75, opção A): Total, os quatro grupos com "N% do total", a barra da
 * proporção, as listas de nomes e os tipos de mentoria. No celular, tocar num grupo mostra os nomes dele.
 */
export function DashboardEngajamento({ dados }: { dados: PainelEngajamento }) {
  const [escolhido, setEscolhido] = useState<GrupoEngajamento>('ENGAJADO');
  const [todos, setTodos] = useState(false);
  const atual = dados.grupos.find((g) => g.grupo === escolhido)!;
  const visiveis = todos ? atual.pessoas : atual.pessoas.slice(0, NO_CELULAR);
  const rotuloBarra = dados.grupos
    .map((g) => `${GRUPO_ENGAJAMENTO_LABEL[g.grupo]} ${g.total}`)
    .join(', ');

  return (
    <section className="card eg-bloco" aria-labelledby="eg-h">
      <div className="eg-cab">
        <h2 id="eg-h">Engajamento</h2>
        <p>Marcado na ficha de cada mentorado. Conta todos, menos cancelados e concluídos.</p>
      </div>

      <div className="eg-kpis">
        <div className="eg-k total">
          <span className="lb">Total de mentorados</span>
          <b>{dados.total}</b>
          <small>Onboarding, ativos, pausados e renovados</small>
        </div>
        {dados.grupos.map((g) => (
          <button
            key={g.grupo}
            type="button"
            className={`eg-k ${ENGAJAMENTO_COR[g.grupo]} ${g.grupo === escolhido ? 'on' : ''}`}
            aria-pressed={g.grupo === escolhido}
            onClick={() => {
              setEscolhido(g.grupo);
              setTodos(false);
            }}
          >
            <span className="lb">
              <i aria-hidden="true" />
              {GRUPO_ENGAJAMENTO_LABEL[g.grupo]}
            </span>
            <b>{g.total}</b>
            <small>{pctDoTotal(g.total, dados.total)}</small>
          </button>
        ))}
      </div>

      <div className="eg-barra" role="img" aria-label={rotuloBarra}>
        {dados.grupos
          .filter((g) => g.total > 0)
          .map((g) => (
            <i key={g.grupo} className={ENGAJAMENTO_COR[g.grupo]} style={{ flex: g.total }} />
          ))}
      </div>

      {/* Computador e tablet: as quatro listas lado a lado. */}
      <div className="eg-listas">
        {dados.grupos.map((g) => (
          <div
            key={g.grupo}
            className={`eg-col ${g.grupo === escolhido ? 'on' : ''}`}
            role="group"
            aria-label={GRUPO_ENGAJAMENTO_LABEL[g.grupo]}
          >
            <h3>
              <i className={ENGAJAMENTO_COR[g.grupo]} aria-hidden="true" />
              {GRUPO_ENGAJAMENTO_LABEL[g.grupo]} <span>{g.total}</span>
            </h3>
            {g.pessoas.length > 0 ? (
              <ul>
                {g.pessoas.map((p) => (
                  <Pessoa key={p.inscricaoId} p={p} />
                ))}
              </ul>
            ) : (
              <p className="eg-vazia">Ninguém neste grupo.</p>
            )}
          </div>
        ))}
      </div>

      {/* Celular: só a lista do grupo tocado. */}
      <div className="eg-cel">
        <h3>
          {GRUPO_ENGAJAMENTO_LABEL[atual.grupo]} ({atual.total})
        </h3>
        {atual.pessoas.length > 0 ? (
          <ul className="eg-lista">
            {visiveis.map((p) => (
              <Pessoa key={p.inscricaoId} p={p} />
            ))}
          </ul>
        ) : (
          <p className="eg-vazia">Ninguém neste grupo.</p>
        )}
        {!todos && atual.pessoas.length > NO_CELULAR && (
          <button type="button" className="eg-mais toque" onClick={() => setTodos(true)}>
            Ver todos os {atual.total}
          </button>
        )}
      </div>

      {dados.tipos.length > 0 && (
        <div className="eg-tipos">
          <h3>Tipos de mentoria</h3>
          <ul>
            {dados.tipos.map((t) => (
              <li key={t.rotulo} className="eg-chip">
                <b>{t.total}</b>
                {t.rotulo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
