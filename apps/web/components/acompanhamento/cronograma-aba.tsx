'use client';
import {
  BLOCO_PLURAL,
  BLOCOS,
  nomePme,
  type Bloco,
  type CronogramaDTO,
  type FichaDTO,
} from '@npac/shared/mentoria';
import { useEffect, useMemo, useState } from 'react';
import { FormError } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { DetalheItem, IconeBloco, partesItem, TagResultado } from './cronograma-ui';
import { dataBR, ICONES, Icone } from './ui';

type Linha = { chave: string; bloco: Bloco; texto: string; tag?: React.ReactNode };
type Grupo = {
  chave: string;
  titulo: string;
  /** Número ao lado do título; recebe as linhas que ficaram depois do filtro. */
  n: (linhas: Linha[]) => string;
  extra: string;
  linhas: Linha[];
  /** Como o grupo se resume: EAP no fim ("e mais 3 EAP"), ou as N primeiras ("Ver os 96 itens"). */
  resumo?: { tipo: 'eap' } | { tipo: 'primeiras'; n: number; rotulo: (total: number) => string };
  /** Ordem: o PME mais recente primeiro; outras inscrições e "Já tinha antes" no fim. */
  ordem: number;
};

const ORDEM_BLOCO = Object.fromEntries(BLOCOS.map((b, i) => [b, i])) as Record<Bloco, number>;
const porBloco = (a: Linha, b: Linha) => ORDEM_BLOCO[a.bloco] - ORDEM_BLOCO[b.bloco];
const TAREFA = new Set(['FEITA', 'PARCIAL', 'NAO_FEITA', 'PENDENTE']);

/** Os grupos da aba: PMEs desta inscrição (sistema e planilha), outras inscrições e "Já tinha antes". */
function montarGrupos(ficha: FichaDTO, dto: CronogramaDTO): Grupo[] {
  const nomes = new Map(dto.banco.map((i) => [i.id, i.texto]));
  const texto = (id: string) => nomes.get(id) ?? 'Item do cronograma';
  const grupos: Grupo[] = [];
  for (const c of ficha.ciclos) {
    const linhas: Linha[] = c.tarefas
      .filter((t) => t.origem === 'PME' && t.cronogramaBloco)
      .map((t) => ({
        chave: t.id,
        bloco: t.cronogramaBloco!,
        texto: t.descricao ?? 'Texto apagado (LGPD)',
        tag: <TagResultado status={t.status} />,
      }));
    if (!linhas.length) continue;
    grupos.push({
      chave: `c-${c.id}`,
      titulo: nomePme(c.numero),
      n: (ls) => {
        const feitos = ls.filter((l) =>
          c.tarefas.some((t) => t.id === l.chave && t.status === 'FEITA'),
        );
        return `${feitos.length} de ${ls.length} ${ls.length === 1 ? 'feito' : 'feitos'}`;
      },
      extra: `enviado em ${dataBR(c.enviadoEm)}`,
      linhas,
      ordem: -c.numero,
    });
  }
  // Da planilha: o que veio antes do sistema, por PME (não inclui o que virou tarefa nem o planejado).
  const planilha = new Map<number, Linha[]>();
  const jaTinha: Linha[] = [];
  const outras = new Map<string, { mentoria: string; linhas: Linha[] }>();
  for (const r of dto.recebidos) {
    const l: Linha = {
      chave: `${r.inscricaoId}-${r.itemId}`,
      bloco: r.bloco,
      texto: texto(r.itemId),
    };
    if (!r.propria) {
      const o = outras.get(r.inscricaoId) ?? { mentoria: r.mentoria, linhas: [] };
      o.linhas.push({ ...l, chave: `${l.chave}-${r.pmeNumero ?? 0}` });
      outras.set(r.inscricaoId, o);
    } else if (r.resultado === 'JA_TINHA') jaTinha.push(l);
    else if ((r.resultado === 'RECEBIDO' || r.resultado === 'NAO_FEZ') && r.pmeNumero != null) {
      if (r.resultado === 'NAO_FEZ') l.tag = <span className="tag canc">Não fez</span>;
      planilha.set(r.pmeNumero, [...(planilha.get(r.pmeNumero) ?? []), l]);
    } else if (!TAREFA.has(r.resultado) && r.resultado !== 'PLANEJADO') jaTinha.push(l);
  }
  for (const [numero, linhas] of planilha)
    grupos.push({
      chave: `p-${numero}`,
      titulo: nomePme(numero),
      n: (ls) => String(ls.length),
      extra: 'antes do sistema · da planilha',
      linhas: linhas.sort(porBloco),
      resumo: { tipo: 'eap' },
      ordem: -numero + 0.5,
    });
  let k = 0;
  for (const [id, o] of outras)
    grupos.push({
      chave: `o-${id}`,
      titulo: `No ${o.mentoria}`,
      n: (ls) => String(ls.length),
      extra: 'outra inscrição',
      linhas: o.linhas.sort(porBloco),
      resumo: { tipo: 'primeiras', n: 2, rotulo: (t) => `Ver os ${t} itens do ${o.mentoria}` },
      ordem: 100 + k++,
    });
  if (jaTinha.length)
    grupos.push({
      chave: 'ja',
      titulo: 'Já tinha antes',
      n: (ls) => String(ls.length),
      extra: 'leu ou viu antes da mentoria',
      linhas: jaTinha.sort(porBloco),
      ordem: 1000,
    });
  return grupos.sort((a, b) => a.ordem - b.ordem);
}

/**
 * Ficha → aba "Cronograma" (NPAC-60, §9.4): tudo o que a pessoa recebeu, PME a PME, contando o que
 * veio da planilha e o de outra inscrição dela (RDV → 2M). Nada se repete.
 */
export function CronogramaAba({ ficha }: { ficha: FichaDTO }) {
  const [dto, setDto] = useState<CronogramaDTO | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Bloco | 'TODOS'>('TODOS');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    clientApi<CronogramaDTO>(`/api/mentoria/inscricoes/${ficha.id}/cronograma`)
      .then((d) => vivo && setDto(d))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [ficha.id]);

  const grupos = useMemo(() => (dto ? montarGrupos(ficha, dto) : []), [ficha, dto]);
  const todas = grupos.flatMap((g) => g.linhas);
  const contagem = Object.fromEntries(
    BLOCOS.map((b) => [b, todas.filter((l) => l.bloco === b).length]),
  ) as Record<Bloco, number>;
  const outras = [
    ...new Set((dto?.recebidos ?? []).filter((r) => !r.propria).map((r) => r.mentoria)),
  ];
  const total = todas.length;
  const resumo =
    total === 0
      ? ''
      : `${total} ${total === 1 ? 'item recebido' : 'itens recebidos'}${
          outras.length ? `, contando o ${outras.join(' e o ')}` : ''
        }. Nada se repete.`;
  const abrir = (chave: string) => setAbertos((s) => new Set(s).add(chave));

  return (
    <section
      className="card cr-aba"
      role="tabpanel"
      aria-label="Cronograma"
      aria-busy={!dto && !erro}
    >
      <div className="cr-top">
        <div>
          <h2 className="cr-h">Cronograma</h2>
          {resumo && <p className="cr-nota">{resumo}</p>}
        </div>
        {total > 0 && (
          <div className="cr-rola">
            <div className="seg" role="group" aria-label="Bloco do cronograma">
              <button
                type="button"
                className={filtro === 'TODOS' ? 'on' : ''}
                aria-pressed={filtro === 'TODOS'}
                onClick={() => setFiltro('TODOS')}
              >
                Todos
              </button>
              {BLOCOS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={filtro === b ? 'on' : ''}
                  aria-pressed={filtro === b}
                  onClick={() => setFiltro(b)}
                >
                  {BLOCO_PLURAL[b]}
                  <em>{contagem[b]}</em>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <FormError message={erro} />
      {dto && total === 0 && (
        <p className="cr-nota">
          Nenhum item do cronograma ainda. Eles aparecem aqui quando o PME é enviado com o
          cronograma.
        </p>
      )}
      {grupos.map((g) => {
        const linhas = filtro === 'TODOS' ? g.linhas : g.linhas.filter((l) => l.bloco === filtro);
        if (!linhas.length) return null;
        const aberto = abertos.has(g.chave);
        let vistas = linhas;
        let mais: { rotulo: string } | null = null;
        if (!aberto && g.resumo?.tipo === 'eap') {
          const eap = linhas.filter((l) => l.bloco === 'EAP');
          if (eap.length && eap.length < linhas.length) {
            vistas = linhas.filter((l) => l.bloco !== 'EAP');
            mais = { rotulo: `e mais ${eap.length} EAP` };
          }
        } else if (!aberto && g.resumo?.tipo === 'primeiras' && linhas.length > g.resumo.n + 1) {
          vistas = linhas.slice(0, g.resumo.n);
          mais = { rotulo: g.resumo.rotulo(linhas.length) };
        }
        return (
          <div key={g.chave} className="cr-grupo">
            <div className="cr-cab">
              <h3>
                {g.titulo}
                <span>{g.n(linhas)}</span>
              </h3>
              <small>{g.extra}</small>
            </div>
            <ul className="cr-lst">
              {vistas.map((l) => (
                <li key={l.chave}>
                  <div className="pl-mod cr-row ic">
                    <span className="ico">
                      <IconeBloco bloco={l.bloco} />
                    </span>
                    <div className="min-w-0">
                      <span className="t">{partesItem(l.texto).titulo}</span>
                      <span className="d">
                        <DetalheItem bloco={l.bloco} texto={l.texto} />
                      </span>
                    </div>
                    {l.tag}
                  </div>
                </li>
              ))}
              {mais && (
                <li>
                  <button
                    type="button"
                    className="pl-mod cr-row ic cr-mais"
                    onClick={() => abrir(g.chave)}
                  >
                    <span />
                    <div className="min-w-0">
                      <span className="t">{mais.rotulo}</span>
                    </div>
                    <Icone d={ICONES.seta} className="seta cr-seta" />
                  </button>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
