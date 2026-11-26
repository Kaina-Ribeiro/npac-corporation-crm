'use client';
import {
  filtrarRenovacoes,
  type FiltroRenovacoes,
  type PainelRenovacoes,
  type RenovacaoLinha,
  type SituacaoRenovacao,
} from '@npac/shared/renovacoes';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AVATAR_OUTRO, type TeamPhotos } from '@/components/avatar';
import { control, quietButton } from '@/components/crm-ui';
import { filtroRenovacoesDasPrefs, lembrarAc, renovacoesRegras } from '@/lib/acompanhamento-prefs';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { contarSituacoes, LinhaTermino, PainelConversa } from './renovacoes-topo';
import { dataBR, Rostos } from './ui';

type Pessoa = { id: string; nome: string };

/** Cor do selo da situação: dourado = renovou; verde = quer; azul = reunião marcada; cinza = o resto (sem alarme). */
const COR: Record<SituacaoRenovacao, string> = {
  RENOVOU: 'gold',
  QUER_RENOVAR: 'ativo',
  NAO_QUER: '',
  FALTA_RESPOSTA: '',
  MARCADA: 'onb',
  SEM_REUNIAO: '',
};

/** Quem renovou fica 60 dias na lista (G6): o mês dele é o do ano novo, então mostra "2º ano". */
const rotuloMes = (l: RenovacaoLinha) => (l.situacao === 'RENOVOU' ? `${l.ano}º ano` : l.mesRotulo);
const terminou = (l: RenovacaoLinha) => l.mesRotulo.startsWith('Terminou');
const pessoas = (l: RenovacaoLinha) =>
  (l.tipo === 'CASAL' ? l.nome.split(' e ') : [l.nome]).map((nome) => ({
    nome,
    fotoMidiaId: null,
  }));

function Selo({ l }: { l: RenovacaoLinha }) {
  return <span className={`tag rv-selo ${COR[l.situacao]}`}>{l.situacaoRotulo}</span>;
}

function Responsavel({ l, photos }: { l: RenovacaoLinha; photos: TeamPhotos }) {
  if (!l.responsavel) return <span className="rv-resp">Sem responsável</span>;
  return (
    <span className="rv-resp">
      <Avatar
        name={l.responsavel}
        photo={l.responsavelId ? photos.photos[l.responsavelId] : null}
        className={`${AVATAR_OUTRO} size-5 text-[10px]`}
      />
      <span className="truncate">{l.responsavel}</span>
    </span>
  );
}

const ficha = (l: RenovacaoLinha) => `/acompanhamento/ficha/${l.inscricaoId}?aba=jornada`;

/** Tabela a partir de 1280 px; abaixo, um cartão por mentorado (como PMEs e ciclos). Opção A, NPAC-79. */
function ListaA({ itens, photos }: { itens: RenovacaoLinha[]; photos: TeamPhotos }) {
  return (
    <section className="card overflow-hidden">
      <div className="rv-head">
        <span>Mentorado</span>
        <span>Responsável</span>
        <span>Mês</span>
        <span>Término</span>
        <span>Situação da conversa</span>
      </div>
      {itens.map((l, i) => (
        <Link
          key={l.inscricaoId}
          className={`rv-row ${i === 0 ? 'primeira' : ''}`}
          href={ficha(l)}
          prefetch={false}
        >
          <span className="rv-nm">
            <Rostos pessoas={pessoas(l)} />
            <span className="min-w-0">
              {l.nome}
              <small>
                {l.mentoria}
                {l.mentoriaVariante ? ` / ${l.mentoriaVariante}` : ''}
              </small>
            </span>
          </span>
          <Responsavel l={l} photos={photos} />
          <span className={`rv-mes ${terminou(l) ? 'atraso' : ''}`}>{rotuloMes(l)}</span>
          <span className="rv-term">{dataBR(l.terminoPrevisto)}</span>
          <span className="rv-sit">
            <Selo l={l} />
          </span>
          <span className="rv-mob">
            <span className={terminou(l) ? 'atraso' : ''}>
              {terminou(l) ? rotuloMes(l) : `${rotuloMes(l)}, término ${dataBR(l.terminoPrevisto)}`}
            </span>
            <Responsavel l={l} photos={photos} />
          </span>
        </Link>
      ))}
    </section>
  );
}

/**
 * Aba "Renovações e gestão" (NPAC-79): o painel com os cinco números (8A, sobre tudo o que a pessoa vê; o filtro não
 * muda) e os degraus da conversa (5A, cada um filtra), a linha do término e a lista. Cada linha abre a ficha.
 */
export function Renovacoes({
  painel,
  responsaveis,
  inicial,
  lembrar,
  photos,
}: {
  painel: PainelRenovacoes;
  /** Vazio para quem tem "só a carteira": o filtro de responsável some. */
  responsaveis: Pessoa[];
  inicial: FiltroRenovacoes;
  lembrar: { cookie: string; valor: string };
  photos: TeamPhotos;
}) {
  const regras = useMemo(() => renovacoesRegras(responsaveis.map((r) => r.id)), [responsaveis]);
  const [f, setF] = useState<FiltroRenovacoes>(inicial);
  useLatestPrefs(lembrar.cookie, lembrar.valor, (salvo) =>
    setF(filtroRenovacoesDasPrefs(readPrefs(salvo, regras))),
  );
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    lembrarAc(
      'renovacoes',
      lembrar.cookie,
      writePrefs({ situacao: f.situacao, responsavelId: f.responsavelId }, regras),
    );
  }, [f, lembrar.cookie, regras]);

  const n = painel.numeros;
  const itens = filtrarRenovacoes(painel.itens, f);
  const filtrando = !!(f.situacao || f.responsavelId);
  const contagem = useMemo(() => contarSituacoes(painel.itens), [painel.itens]);

  return (
    <section className="view rv">
      <div className="hrow">
        <div>
          <h1 className="h1">Renovações e gestão</h1>
          <p className="sub">
            Quem chega ao 12º mês nos próximos 60 dias e a situação da conversa de renovação.
          </p>
        </div>
      </div>

      <PainelConversa
        numeros={n}
        contagem={contagem}
        situacao={f.situacao}
        escolher={(situacao) => setF({ ...f, situacao })}
      />

      {(responsaveis.length > 0 || filtrando) && (
        <div className="pc-filtros rv-filtros">
          {responsaveis.length > 0 && (
            <select
              className={control}
              aria-label="Responsável"
              value={f.responsavelId ?? ''}
              onChange={(e) => setF({ ...f, responsavelId: e.target.value || undefined })}
            >
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          )}
          {filtrando && (
            <button type="button" className={quietButton} onClick={() => setF({})}>
              Limpar filtros
            </button>
          )}
        </div>
      )}

      <LinhaTermino itens={itens} hoje={painel.hoje} />

      {itens.length === 0 ? (
        <section className="card">
          <div className="vazio">
            <h2>{filtrando ? 'Nada com estes filtros' : 'Ninguém chegando na renovação'}</h2>
            <p>
              {filtrando
                ? 'Tire um filtro para ver mais mentorados.'
                : 'Quem chega ao 12º mês nos próximos 60 dias aparece aqui.'}
            </p>
          </div>
        </section>
      ) : (
        <ListaA itens={itens} photos={photos} />
      )}
    </section>
  );
}
