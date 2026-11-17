'use client';
import {
  INSCRICAO_STATUS,
  INSCRICAO_STATUS_LABEL,
  TIPO_INSCRICAO_LABEL,
  type InscricaoItem,
  type InscricaoStatus,
  type PaginaInscricoes,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { button, control, quietButton } from '@/components/crm-ui';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import {
  filtrosParaPrefs,
  lembrarAc,
  mentoradosRegras,
  prefsParaFiltros,
  type FiltrosMentorados,
} from '@/lib/acompanhamento-prefs';
import { clientApi } from '@/lib/client-api';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { Dialogo } from './dialogo';
import { dataBR, ICONES, Icone, Rostos, rotuloMes, TagStatus, Trilha } from './ui';
import { ExportarBotao } from './exportar-botao';

type Filtros = FiltrosMentorados;
type Pessoa = { id: string; nome: string };

const MESES = Array.from({ length: 12 }, (_, i) => i + 1);

function Linha({ r, primeira }: { r: InscricaoItem; primeira: boolean }) {
  const ultimo = r.ultimoContato ? dataBR(r.ultimoContato) : '—';
  return (
    <Link
      className={`row ${primeira ? 'primeira' : ''}`}
      href={`/acompanhamento/ficha/${r.id}`}
      prefetch={false}
    >
      <div className="cell-n">
        <Rostos pessoas={r.pessoas} />
        <div className="nm">
          {r.nome}
          <small>
            {TIPO_INSCRICAO_LABEL[r.tipo]}, {r.mentoria}
            {r.completar ? ', completar a ficha' : ''}
          </small>
        </div>
      </div>
      <span className="tp tag justify-self-start">{r.mentoria}</span>
      <div className="jm">
        <b className={r.mesJornada === null ? 'antes' : ''}>
          {rotuloMes(r.mesJornada, r.mentoria)}
        </b>
        {r.mesJornada !== null && <Trilha mes={r.mesJornada} alerta={r.completar} />}
      </div>
      <TagStatus status={r.status} className="st-tag justify-self-start" />
      <span className="rs">{r.responsavel?.nome ?? '—'}</span>
      <span className="lc">{ultimo}</span>
      <div className="mobmeta">
        {r.responsavel?.nome ?? 'Sem responsável'}, último contato: {ultimo}
      </div>
    </Link>
  );
}

/** Selects dos filtros: lado a lado no computador, dentro da janela no celular. */
function CamposFiltro({
  f,
  mudar,
  responsaveis,
}: {
  f: Filtros;
  mudar: (n: Filtros) => void;
  responsaveis: Pessoa[];
}) {
  return (
    <>
      <select
        className={control}
        aria-label="Mês da jornada"
        value={f.mes ?? ''}
        onChange={(e) => mudar({ ...f, mes: e.target.value ? Number(e.target.value) : undefined })}
      >
        <option value="">Todos os meses</option>
        {MESES.map((m) => (
          <option key={m} value={m}>
            Mês {m}
          </option>
        ))}
      </select>
      <select
        className={control}
        aria-label="Status"
        value={f.status ?? ''}
        onChange={(e) =>
          mudar({ ...f, status: (e.target.value || undefined) as InscricaoStatus | undefined })
        }
      >
        <option value="">Todos os status</option>
        {INSCRICAO_STATUS.map((s) => (
          <option key={s} value={s}>
            {INSCRICAO_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        className={`${control} todo`}
        aria-label="Responsável"
        value={f.responsavelId ?? ''}
        onChange={(e) => mudar({ ...f, responsavelId: e.target.value || undefined })}
      >
        <option value="">Todos os responsáveis</option>
        {responsaveis.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nome}
          </option>
        ))}
      </select>
    </>
  );
}

/** Carteira com filtros por mês, status e responsável e a lista "completar a ficha". */
export function MentoradosLista({
  pagina,
  responsaveis,
  podeCriar,
  exportar = false,
  inicial,
  lembrar,
}: {
  pagina: PaginaInscricoes;
  responsaveis: Pessoa[];
  podeCriar: boolean;
  exportar?: boolean;
  inicial: Filtros;
  /** Cookie dos filtros lembrados (NPAC-46) e o valor que o servidor usou. */
  lembrar: { cookie: string; valor: string };
}) {
  const [f, setF] = useState<Filtros>(inicial);
  const regras = mentoradosRegras(responsaveis.map((r) => r.id));
  // Voltar do navegador traz a página de antes: vale o filtro mais novo do cookie.
  useLatestPrefs(lembrar.cookie, lembrar.valor, (salvo) =>
    setF(prefsParaFiltros(readPrefs(salvo, regras))),
  );
  const [dados, setDados] = useState(pagina);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [janela, setJanela] = useState(false);
  const [rascunho, setRascunho] = useState<Filtros>({});
  const pedido = useRef(0);
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    lembrarAc('mentorados', lembrar.cookie, writePrefs(filtrosParaPrefs(f), regras));
    const n = ++pedido.current;
    setCarregando(true);
    clientApi<PaginaInscricoes>('/api/mentoria/inscricoes/lista', 'POST', f)
      .then((p) => {
        if (n !== pedido.current) return;
        setDados(p);
        setErro('');
      })
      .catch((e: Error) => n === pedido.current && setErro(e.message))
      .finally(() => n === pedido.current && setCarregando(false));
  }, [f]);

  async function maisItens() {
    if (!dados.cursor) return;
    setCarregando(true);
    try {
      const p = await clientApi<PaginaInscricoes>('/api/mentoria/inscricoes/lista', 'POST', {
        ...f,
        cursor: dados.cursor,
      });
      setDados((d) => ({ ...p, itens: [...d.itens, ...p.itens] }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  const { resumo } = dados;
  const filtrando = !!(f.mes || f.status || f.responsavelId || f.completar);
  const abrirJanela = () => {
    setRascunho(f);
    setJanela(true);
  };
  const chip = (rotulo: string, valor: string | undefined) => (
    <button type="button" className={`fchip ${valor ? 'on' : ''}`} onClick={abrirJanela}>
      {valor ?? rotulo}
      <Icone d={ICONES.abaixo} largura={2.4} />
    </button>
  );

  return (
    <section className="view">
      <div className="hrow">
        <div>
          <h1 className="h1">Mentorados</h1>
          <p className="sub">
            {resumo.total} na carteira: {resumo.ativos} {resumo.ativos === 1 ? 'ativo' : 'ativos'},{' '}
            {resumo.onboarding} em onboarding, {resumo.pausados}{' '}
            {resumo.pausados === 1 ? 'pausado' : 'pausados'}.
          </p>
        </div>
        {(podeCriar || exportar) && (
          <div className="acts so-desk">
            {exportar && (
              <ExportarBotao
                aba="MENTORADOS"
                filtros={{
                  ...(f.status ? { status: f.status } : {}),
                  ...(f.responsavelId ? { responsavelId: f.responsavelId } : {}),
                }}
              />
            )}
            {podeCriar && (
              <Link className={button} href="/acompanhamento/mentorados/nova">
                Nova inscrição
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="fchips so-cel">
        <button
          type="button"
          className={`fchip ouro ${f.completar ? 'on' : ''}`}
          aria-pressed={!!f.completar}
          onClick={() => setF({ ...f, completar: f.completar ? undefined : true })}
        >
          Completar a ficha<span>{resumo.completar}</span>
        </button>
        {chip('Mês', f.mes ? `Mês ${f.mes}` : undefined)}
        {chip('Status', f.status && INSCRICAO_STATUS_LABEL[f.status])}
        {chip('Responsável', responsaveis.find((r) => r.id === f.responsavelId)?.nome)}
        {filtrando && (
          <button type="button" className="fchip" onClick={() => setF({})}>
            Limpar filtros
          </button>
        )}
      </div>

      <div className="filters so-desk">
        <CamposFiltro f={f} mudar={setF} responsaveis={responsaveis} />
        <button
          type="button"
          className="chip"
          aria-pressed={!!f.completar}
          onClick={() => setF({ ...f, completar: f.completar ? undefined : true })}
        >
          Completar a ficha ({resumo.completar})
        </button>
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
        {dados.itens.length > 0 && (
          <div className="lhead">
            <span>Mentorado</span>
            <span>Mentoria</span>
            <span>Mês da jornada</span>
            <span>Status</span>
            <span>Responsável</span>
            <span>Último contato</span>
          </div>
        )}
        {dados.itens.map((r, i) => (
          <Linha key={r.id} r={r} primeira={i === 0} />
        ))}
        {dados.itens.length === 0 && (
          <div className="vazio">
            <h2>{filtrando ? 'Nada com estes filtros' : 'Nenhum mentorado por aqui'}</h2>
            <p>
              {filtrando
                ? 'Tire um filtro para ver mais mentorados.'
                : podeCriar
                  ? 'Cadastre a primeira inscrição para começar.'
                  : 'Quando você conduzir uma reunião, o mentorado aparece aqui.'}
            </p>
          </div>
        )}
        {dados.cursor && (
          <div className="lista-mais">
            <button
              type="button"
              className={quietButton}
              disabled={carregando}
              onClick={() => void maisItens()}
            >
              Carregar mais
            </button>
          </div>
        )}
      </section>

      {janela && (
        <Dialogo
          titulo="Filtros"
          rotulo="Ver resultados"
          onConfirmar={() => setF(rascunho)}
          onFechar={() => setJanela(false)}
        >
          <div className="flex flex-col gap-2">
            <CamposFiltro f={rascunho} mudar={setRascunho} responsaveis={responsaveis} />
          </div>
        </Dialogo>
      )}
    </section>
  );
}
