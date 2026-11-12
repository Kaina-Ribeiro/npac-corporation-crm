'use client';
import {
  INSCRICAO_STATUS,
  INSCRICAO_STATUS_LABEL,
  MENTORIAS,
  ORIGEM_LABEL,
  ORIGENS,
  STATUS_FINANCEIRO,
  STATUS_FINANCEIRO_LABEL,
  TIPO_INSCRICAO_LABEL,
  linkGrupoValido,
  linkWhatsApp,
  type FichaDTO,
  type Responsavel,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readPrefs } from '@npac/shared/screen-prefs';
import { useEffect, useRef, useState } from 'react';
import { button, control, quietButton } from '@/components/crm-ui';
import { FICHA_REGRAS, atualizarAc } from '@/lib/acompanhamento-prefs';
import { clientApi } from '@/lib/client-api';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { filaDeSalvamento, registrarVersion } from '@/lib/acompanhamento-saver';
import { EVENTO_ULTIMA_FICHA } from '@/lib/ultima-ficha';
import { CampoPr, DINHEIRO } from './campo';
import { Dialogo } from './dialogo';
import { OnboardingFicha } from './etapa-card';
import { FichaMomento } from './ficha-momento';
import { FichaPessoas } from './ficha-pessoas';
import { HistoricoLista } from './historico-lista';
import { IndicadorSalvo } from './indicador-salvo';
import { PlanoMentorado } from './plano-mentorado';
import { Metas } from './metas';
import { PmeAtual } from './pme-atual';
import { TarefasFicha } from './tarefas-reuniao';
import {
  abaValida,
  dataBR,
  FOCOS_RDV,
  ICONES,
  Icone,
  opcoesResponsavel,
  rotuloAntesDoInicio,
  Rostos,
  TagStatus,
  Trilha,
  type Aba,
} from './ui';

const COOKIE_ULTIMA_FICHA = 'npac_ultima_ficha';
const sm = `${quietButton} sm`;

function Jornada({
  ficha,
  soLargo,
  atualizar,
  memoria,
}: {
  ficha: FichaDTO;
  soLargo: boolean;
  atualizar: () => void;
  memoria: string;
}) {
  const mes = ficha.mesJornada;
  const focos = ficha.mentoria === 'RDV' ? FOCOS_RDV : null;
  const ativo = ficha.status === 'ATIVO';
  const comPme = ficha.ciclos.length > 0 || ativo;
  const comTarefas = ficha.tarefasReuniao.length > 0 || ativo;
  const comMetas = ficha.metas.length > 0 || (ficha.pode.meta && ativo);
  return (
    <section
      className={`card pa ${soLargo ? 'so-largo' : ''}`}
      role="tabpanel"
      aria-label="Jornada"
    >
      <h3>Os 12 meses</h3>
      <div className="rail">
        {Array.from({ length: 12 }, (_, k) => {
          const n = k + 1;
          const feito = mes !== null && n < mes;
          const atual = mes === n;
          return (
            <div key={n} className={`m ${k === 0 ? 'p1 ' : ''}${feito ? 'ok' : atual ? 'c' : ''}`}>
              <span className="dot">{feito && <Icone d={ICONES.check} largura={3.4} />}</span>
              <span>{n}</span>
              {focos && <span className="fo">{focos[k]}</span>}
            </div>
          );
        })}
      </div>
      <OnboardingFicha
        ficha={ficha}
        atualizar={atualizar}
        pme={
          comPme || comTarefas || comMetas ? (
            <>
              {comPme && <PmeAtual ficha={ficha} atualizar={atualizar} />}
              {comTarefas && (
                <TarefasFicha
                  tarefas={ficha.tarefasReuniao}
                  metas={ficha.metas}
                  atualizar={atualizar}
                />
              )}
              {comMetas && (
                <Metas
                  inscricaoId={ficha.id}
                  metas={ficha.metas}
                  pessoas={ficha.pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
                  podeCriar={ficha.pode.meta}
                  atualizar={atualizar}
                  vazio="Nenhuma meta definida. As metas nascem na reunião ou aqui."
                />
              )}
            </>
          ) : null
        }
        plano={
          ficha.acoes.length > 0 ? (
            <PlanoMentorado ficha={ficha} atualizar={atualizar} memoria={memoria} />
          ) : null
        }
      />
    </section>
  );
}

function Inscricao({
  ficha,
  responsaveis,
  ativo,
  atualizar,
  pedirTipo,
  pedirIdr,
}: {
  ficha: FichaDTO;
  responsaveis: Responsavel[];
  ativo: boolean;
  atualizar: () => void;
  pedirTipo: () => void;
  pedirIdr: () => void;
}) {
  const chave = `inscricao:${ficha.id}`;
  const ed = ficha.pode.inscricao;
  const base = { chave, editavel: ed };
  // Pausar tem ação própria (Parte 3): a lista não oferece entrar nem sair de Pausado.
  const opcoesStatus = INSCRICAO_STATUS.map((s) => ({
    valor: s,
    rotulo: INSCRICAO_STATUS_LABEL[s],
    desativada: s === 'PAUSADO' || ficha.status === 'PAUSADO',
  }));
  return (
    <aside className={`card fc-lado ${ativo ? 'ativo' : ''}`} aria-label="Inscrição">
      <h2>Inscrição</h2>
      <label className="pr">
        <span>Tipo</span>
        <select
          className="pv"
          aria-label="Tipo"
          value={ficha.tipo}
          disabled={!ed}
          onChange={(e) => {
            if (e.target.value !== ficha.tipo) pedirTipo();
          }}
        >
          <option value="INDIVIDUAL">{TIPO_INSCRICAO_LABEL.INDIVIDUAL}</option>
          <option value="CASAL">{TIPO_INSCRICAO_LABEL.CASAL}</option>
        </select>
      </label>
      <CampoPr
        {...base}
        rotulo="Mentoria"
        campo="mentoria"
        valor={ficha.mentoria}
        tipo="select"
        semVazio
        opcoes={MENTORIAS.map((m) => ({ valor: m, rotulo: m }))}
        aoSalvar={atualizar}
      />
      <CampoPr
        {...base}
        rotulo="Variante"
        campo="mentoriaVariante"
        valor={ficha.mentoriaVariante}
        placeholder="Nenhuma"
      />
      <CampoPr
        chave={chave}
        editavel={ficha.pode.momento && ficha.status !== 'PAUSADO'}
        rotulo="Status"
        campo="status"
        valor={ficha.status}
        tipo="select"
        semVazio
        opcoes={opcoesStatus}
        aoSalvar={atualizar}
      />
      <CampoPr
        {...base}
        rotulo="Responsável"
        campo="responsavelId"
        valor={ficha.responsavelId}
        tipo="select"
        opcoes={opcoesResponsavel(responsaveis, ficha.responsavelId)}
      />
      <CampoPr
        {...base}
        rotulo="Origem"
        campo="origem"
        valor={ficha.origem}
        tipo="select"
        opcoes={ORIGENS.map((o) => ({ valor: o, rotulo: ORIGEM_LABEL[o] }))}
      />
      <CampoPr
        {...base}
        rotulo="Data da compra"
        campo="dataCompra"
        valor={ficha.dataCompra}
        tipo="date"
      />
      {ficha.mentoria === 'RDV' ? (
        <div className="pr">
          <span>Data da IDR</span>
          <div className="pl-idr">
            <span className="pv-fixo">{dataBR(ficha.dataIdr) || '—'}</span>
            {ficha.pode.plano && (ficha.importada || ficha.dataIdr) && (
              <button type="button" className="pl-link" onClick={pedirIdr}>
                {ficha.dataIdr ? 'Corrigir' : 'Informar'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <CampoPr
          chave={chave}
          editavel={ed && (ficha.acoes.length === 0 || ficha.pode.plano)}
          rotulo="Início"
          campo="inicioJornada"
          valor={ficha.inicioJornada}
          tipo="date"
          aoSalvar={atualizar}
        />
      )}
      <CampoPr
        {...base}
        rotulo="Término previsto"
        campo="terminoPrevisto"
        valor={ficha.terminoPrevisto}
        tipo="date"
        aoSalvar={atualizar}
      />
      <CampoPr
        {...base}
        rotulo="Valor"
        campo="valorCentavos"
        valor={ficha.valorCentavos}
        inputMode="decimal"
        conversao={DINHEIRO}
      />
      <CampoPr {...base} rotulo="Pagamento" campo="formaPagamento" valor={ficha.formaPagamento} />
      <CampoPr
        {...base}
        rotulo="Financeiro"
        campo="statusFinanceiro"
        valor={ficha.statusFinanceiro}
        tipo="select"
        opcoes={STATUS_FINANCEIRO.map((s) => ({ valor: s, rotulo: STATUS_FINANCEIRO_LABEL[s] }))}
      />
      <CampoPr {...base} rotulo="Pasta" campo="linkPasta" valor={ficha.linkPasta} inputMode="url" />
      <CampoPr
        {...base}
        rotulo="Grupo"
        campo="linkGrupo"
        valor={ficha.linkGrupo}
        inputMode="url"
        aoSalvar={atualizar}
      />
    </aside>
  );
}

/** Menu "Mais ações": fecha ao clicar fora e com Esc. */
function MaisAcoes({
  ficha,
  pedirTipo,
  pedirPausa,
  pedir,
}: {
  ficha: FichaDTO;
  pedirTipo: () => void;
  pedirPausa: () => void;
  pedir: (d: 'excluir' | 'anonimizar') => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);
  return (
    <div className="fc-mais" ref={raiz}>
      <button
        type="button"
        className={`${sm} mais`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        Mais ações
      </button>
      {aberto && (
        <div className="fc-menu card" role="menu">
          {ficha.status !== 'PAUSADO' && (
            <button
              type="button"
              role="menuitem"
              disabled={
                !ficha.pode.plano || (ficha.status !== 'ATIVO' && ficha.status !== 'ONBOARDING')
              }
              onClick={() => {
                setAberto(false);
                pedirPausa();
              }}
            >
              Pausar
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!ficha.pode.inscricao}
            onClick={() => {
              setAberto(false);
              pedirTipo();
            }}
          >
            {ficha.tipo === 'CASAL' ? 'Mudar para individual' : 'Mudar para casal'}
          </button>
          {ficha.pode.admin && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAberto(false);
                  pedir('anonimizar');
                }}
              >
                Anonimizar (LGPD)
              </button>
              <button
                type="button"
                role="menuitem"
                className="perigo"
                onClick={() => {
                  setAberto(false);
                  pedir('excluir');
                }}
              >
                Excluir inscrição
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Individual ↔ casal: casal pede o nome da segunda pessoa; individual avisa o que se perde. */
function MudarTipo({
  ficha,
  onFeito,
  onFechar,
}: {
  ficha: FichaDTO;
  onFeito: () => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState('');
  const url = `/api/mentoria/inscricoes/${ficha.id}/pessoa-2`;
  if (ficha.tipo === 'CASAL')
    return (
      <Dialogo
        titulo="Mudar para individual"
        texto={`A segunda pessoa (${ficha.pessoas[1]?.nome ?? ''}) e os dados dela saem da ficha. Esta ação não pode ser desfeita.`}
        rotulo="Mudar para individual"
        perigo
        onConfirmar={async () => {
          await filaDeSalvamento().idle();
          await clientApi(url, 'DELETE');
          onFeito();
        }}
        onFechar={onFechar}
      />
    );
  return (
    <Dialogo
      titulo="Mudar para casal"
      texto="Informe a segunda pessoa. Os outros dados você completa na aba Pessoas."
      rotulo="Mudar para casal"
      podeConfirmar={nome.trim() !== ''}
      onConfirmar={async () => {
        await clientApi(url, 'POST', { nome: nome.trim() });
        onFeito();
      }}
      onFechar={onFechar}
    >
      <label className="f">
        <span>Nome completo</span>
        <input
          className={control}
          autoFocus
          maxLength={200}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </label>
    </Dialogo>
  );
}

/** Pausar: some da Fila e do plano da semana até retomar. */
function Pausar({
  ficha,
  onFeito,
  onFechar,
}: {
  ficha: FichaDTO;
  onFeito: () => void;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <Dialogo
      titulo="Pausar a jornada"
      texto="Sai da Fila e do plano da semana. Ao retomar, os dias parados são somados ao término e às ações pendentes."
      rotulo="Pausar"
      onConfirmar={async () => {
        await filaDeSalvamento().idle();
        await clientApi(`/api/mentoria/inscricoes/${ficha.id}/pausar`, 'POST', {
          motivo: motivo.trim(),
        });
        onFeito();
      }}
      onFechar={onFechar}
    >
      <label className="f">
        <span>Motivo (opcional)</span>
        <input
          className={control}
          autoFocus
          maxLength={2000}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </label>
    </Dialogo>
  );
}

function Retomar({
  ficha,
  onFeito,
  onFechar,
}: {
  ficha: FichaDTO;
  onFeito: () => void;
  onFechar: () => void;
}) {
  const dias = ficha.pausa?.dias ?? 0;
  return (
    <Dialogo
      titulo="Retomar a jornada"
      texto={
        dias === 0
          ? 'Pausada hoje: as datas ficam como estão.'
          : `${dias} ${dias === 1 ? 'dia parado será somado' : 'dias parados serão somados'} ao término e às ações pendentes.`
      }
      rotulo="Retomar"
      onConfirmar={async () => {
        await filaDeSalvamento().idle();
        await clientApi(`/api/mentoria/inscricoes/${ficha.id}/retomar`, 'POST', {});
        onFeito();
      }}
      onFechar={onFechar}
    />
  );
}

/** Informar ou corrigir a IDR: refaz as datas das ações pendentes. */
function CorrigirIdr({
  ficha,
  onFeito,
  onFechar,
}: {
  ficha: FichaDTO;
  onFeito: () => void;
  onFechar: () => void;
}) {
  const [data, setData] = useState(ficha.dataIdr ?? '');
  const chave = `inscricao:${ficha.id}`;
  return (
    <Dialogo
      titulo={ficha.dataIdr ? 'Corrigir a data da IDR' : 'Informar a data da IDR'}
      texto="As ações pendentes são recalculadas a partir dessa data. As já feitas ficam como estão."
      rotulo="Salvar"
      podeConfirmar={data !== ''}
      onConfirmar={async () => {
        await filaDeSalvamento().idle();
        await clientApi(`/api/mentoria/inscricoes/${ficha.id}/data-idr`, 'PUT', {
          version: filaDeSalvamento().version(chave) ?? ficha.version,
          dataIdr: data,
        });
        onFeito();
      }}
      onFechar={onFechar}
    >
      <label className="f">
        <span>Data da IDR</span>
        <input
          className={control}
          type="date"
          autoFocus
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </label>
    </Dialogo>
  );
}

export function Ficha({
  ficha,
  responsaveis,
  abaInicial,
  lembrar,
}: {
  ficha: FichaDTO;
  responsaveis: Responsavel[];
  abaInicial: Aba;
  /** Cookie da aba e do filtro do histórico (NPAC-46); `abaDaUrl`: o link pediu a aba. */
  lembrar: { cookie: string; valor: string; abaDaUrl: boolean };
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(abaInicial);
  const lembrarAba = (a: Aba) =>
    atualizarAc('ficha', lembrar.cookie, FICHA_REGRAS, { aba: a === 'jornada' ? undefined : a });
  const pedida = useRef(lembrar.abaDaUrl ? abaInicial : null);
  // Voltar do navegador traz a página de antes: sem aba no link, vale a mais nova do cookie.
  useLatestPrefs(lembrar.cookie, lembrar.valor, (valor) => {
    if (!pedida.current) setAba(abaValida(readPrefs(valor, FICHA_REGRAS).aba));
  });
  // A aba pedida no link vira a lembrada (depois de `useLatestPrefs`, que semeia a memória).
  useEffect(() => {
    if (pedida.current) lembrarAba(pedida.current);
  }, []);
  const [mudarTipo, setMudarTipo] = useState(false);
  const [dialogo, setDialogo] = useState<
    'pausar' | 'retomar' | 'idr' | 'excluir' | 'anonimizar' | null
  >(null);
  const atualizar = () =>
    void filaDeSalvamento()
      .idle()
      .then(() => router.refresh());

  useEffect(() => {
    document.cookie = `${COOKIE_ULTIMA_FICHA}=${ficha.id}; Path=/acompanhamento; Max-Age=2592000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(EVENTO_ULTIMA_FICHA, { detail: ficha.nome }));
  }, [ficha.id, ficha.nome]);

  useEffect(() => {
    registrarVersion(`inscricao:${ficha.id}`, ficha.version);
    registrarVersion(`endereco:${ficha.id}`, ficha.endereco?.version ?? 0);
    registrarVersion(`momento:${ficha.id}`, ficha.momento?.version ?? 0);
    for (const p of ficha.pessoas) registrarVersion(`pessoa:${ficha.id}:${p.id}`, p.version);
    for (const e of ficha.onboarding) registrarVersion(`etapa:${ficha.id}:${e.id}`, e.version);
    for (const a of ficha.acoes) registrarVersion(`acao:${ficha.id}:${a.id}`, a.version);
  }, [ficha]);

  function trocarAba(a: Aba) {
    setAba(a);
    window.history.replaceState(null, '', `?aba=${a}`);
    lembrarAba(a);
  }

  const mes = ficha.mesJornada;
  const foco = mes !== null && mes <= 12 && ficha.mentoria === 'RDV' ? FOCOS_RDV[mes - 1] : null;
  const titulo =
    mes === null
      ? rotuloAntesDoInicio(ficha.mentoria)
      : mes > 12
        ? 'Jornada concluída'
        : `Mês ${mes} de 12${foco ? `: ${foco}` : ''}`;
  const periodo = ficha.inicioJornada
    ? `${dataBR(ficha.inicioJornada)} a ${dataBR(ficha.terminoPrevisto)}`
    : '';
  const abas: [Aba, string, string][] = [
    ['jornada', 'Jornada', ''],
    ['inscricao', 'Inscrição', 'so-lado'],
    ['pessoas', ficha.tipo === 'CASAL' ? 'Pessoas' : 'Pessoa', ''],
    ['momento', 'Momento inicial', ''],
    ['historico', 'Histórico', ''],
  ];

  return (
    <section className="view">
      <header className="card fc-h">
        <div className="fc-quem">
          <Rostos pessoas={ficha.pessoas} />
          <div className="fc-id">
            <Link className="fc-voltar" href="/acompanhamento/mentorados">
              Mentorados
            </Link>
            <h1>{ficha.nome}</h1>
            <div className="fh-tags">
              <span className="tag gold">{ficha.mentoria}</span>
              <span className="tag">{TIPO_INSCRICAO_LABEL[ficha.tipo]}</span>
              <TagStatus status={ficha.status} />
              <IndicadorSalvo />
            </div>
          </div>
        </div>
        <div className="fc-j">
          <div className="lbl">
            <b>{titulo}</b>
            <span>{periodo}</span>
          </div>
          <Trilha mes={mes} />
        </div>
        <div className="fc-acts">
          {linkGrupoValido(ficha.linkGrupo) && (
            <a
              className={`${sm} wa`}
              href={linkGrupoValido(ficha.linkGrupo)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icone d={ICONES.mentorados} />
              Grupo
            </a>
          )}
          {ficha.pessoas.map(
            (p) =>
              linkWhatsApp(p.whatsapp) && (
                <a
                  key={p.id}
                  className={`${sm} wa`}
                  href={linkWhatsApp(p.whatsapp)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icone d={ICONES.whatsapp} />
                  {p.apelido ?? p.nome.split(' ')[0]}
                </a>
              ),
          )}
          {ficha.status === 'PAUSADO' && ficha.pode.plano && (
            <button type="button" className={`${button} sm`} onClick={() => setDialogo('retomar')}>
              Retomar
            </button>
          )}
          <MaisAcoes
            ficha={ficha}
            pedirTipo={() => setMudarTipo(true)}
            pedirPausa={() => setDialogo('pausar')}
            pedir={setDialogo}
          />
        </div>
      </header>

      {ficha.pausa && (
        <p className="card pl-pausa" role="status">
          <b>
            Pausado desde {dataBR(ficha.pausa.inicio)}, há {ficha.pausa.dias}{' '}
            {ficha.pausa.dias === 1 ? 'dia' : 'dias'}.
          </b>{' '}
          {ficha.pausa.motivo}
        </p>
      )}

      <div className="fc-corpo">
        <div className="fc-main">
          <div className="tabs" role="tablist">
            {abas.map(([id, rotulo, classe]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                className={`${aba === id ? 'on' : ''} ${classe} ${
                  id === 'jornada' && aba === 'inscricao' ? 'on-largo' : ''
                }`.trim()}
                onClick={() => trocarAba(id)}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {/* A partir de 1280 px a Inscrição é coluna: a aba dela mostra a Jornada ao lado. */}
          {(aba === 'jornada' || aba === 'inscricao') && (
            <Jornada
              ficha={ficha}
              soLargo={aba === 'inscricao'}
              atualizar={atualizar}
              memoria={lembrar.cookie}
            />
          )}
          {aba === 'pessoas' && <FichaPessoas ficha={ficha} atualizar={atualizar} />}
          {aba === 'momento' && <FichaMomento ficha={ficha} atualizar={atualizar} />}
          {aba === 'historico' && <HistoricoLista ficha={ficha} lembrar={lembrar} />}
        </div>
        <Inscricao
          ficha={ficha}
          responsaveis={responsaveis}
          ativo={aba === 'inscricao'}
          atualizar={atualizar}
          pedirTipo={() => setMudarTipo(true)}
          pedirIdr={() => setDialogo('idr')}
        />
      </div>

      {mudarTipo && (
        <MudarTipo
          ficha={ficha}
          onFeito={() => router.refresh()}
          onFechar={() => setMudarTipo(false)}
        />
      )}
      {dialogo === 'pausar' && (
        <Pausar ficha={ficha} onFeito={() => router.refresh()} onFechar={() => setDialogo(null)} />
      )}
      {dialogo === 'retomar' && (
        <Retomar ficha={ficha} onFeito={() => router.refresh()} onFechar={() => setDialogo(null)} />
      )}
      {dialogo === 'excluir' && (
        <Dialogo
          titulo="Excluir inscrição"
          texto={`${ficha.nome} sai do sistema com pessoas, onboarding, plano, reuniões, contatos, anotações e fotos. Esta ação não pode ser desfeita.`}
          rotulo="Excluir inscrição"
          perigo
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`/api/mentoria/inscricoes/${ficha.id}`, 'DELETE');
            router.replace('/acompanhamento/mentorados');
          }}
          onFechar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'anonimizar' && (
        <Dialogo
          titulo="Anonimizar (LGPD)"
          texto="Nome, contato, endereço, momento inicial, avaliações, anotações, textos das reuniões e fotos são apagados. A inscrição, as reuniões e as ações continuam, sem dado pessoal, para as contagens. Esta ação não pode ser desfeita."
          rotulo="Anonimizar"
          perigo
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`/api/mentoria/inscricoes/${ficha.id}/anonimizar`, 'POST');
            router.refresh();
          }}
          onFechar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'idr' && (
        <CorrigirIdr
          ficha={ficha}
          onFeito={() => router.refresh()}
          onFechar={() => setDialogo(null)}
        />
      )}
    </section>
  );
}
