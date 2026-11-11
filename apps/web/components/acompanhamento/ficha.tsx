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
  type FichaDTO,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { control, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion } from '@/lib/acompanhamento-saver';
import { CampoPr, DINHEIRO } from './campo';
import { Dialogo } from './dialogo';
import { FichaMomento } from './ficha-momento';
import { FichaPessoas } from './ficha-pessoas';
import { HistoricoLista } from './historico-lista';
import { IndicadorSalvo } from './indicador-salvo';
import { dataBR, FOCOS_RDV, ICONES, Icone, Rostos, TagStatus, Trilha, type Aba } from './ui';

const COOKIE_ULTIMA_FICHA = 'npac_ultima_ficha';
const sm = `${quietButton} sm`;

function Jornada({ ficha, soLargo }: { ficha: FichaDTO; soLargo: boolean }) {
  const mes = ficha.mesJornada;
  const focos = ficha.mentoria === 'RDV' ? FOCOS_RDV : null;
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
      <p className="jg-aviso">
        O onboarding e as ações de cada mês entram aqui nas próximas etapas do sistema.
      </p>
    </section>
  );
}

function Inscricao({
  ficha,
  responsaveis,
  ativo,
  atualizar,
  pedirTipo,
}: {
  ficha: FichaDTO;
  responsaveis: { id: string; nome: string }[];
  ativo: boolean;
  atualizar: () => void;
  pedirTipo: () => void;
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
        opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))}
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
          <span className="pv-fixo">{dataBR(ficha.dataIdr) || '—'}</span>
        </div>
      ) : (
        <CampoPr
          {...base}
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
function MaisAcoes({ ficha, pedirTipo }: { ficha: FichaDTO; pedirTipo: () => void }) {
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
          <button type="button" role="menuitem" disabled>
            Pausar<span className="tag">Em breve</span>
          </button>
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
          <button type="button" role="menuitem" disabled>
            Excluir inscrição<span className="tag">Em breve</span>
          </button>
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

export function Ficha({
  ficha,
  responsaveis,
  abaInicial,
}: {
  ficha: FichaDTO;
  responsaveis: { id: string; nome: string }[];
  abaInicial: Aba;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [mudarTipo, setMudarTipo] = useState(false);
  const atualizar = () =>
    void filaDeSalvamento()
      .idle()
      .then(() => router.refresh());

  useEffect(() => {
    document.cookie = `${COOKIE_ULTIMA_FICHA}=${ficha.id}; Path=/acompanhamento; Max-Age=2592000; SameSite=Lax`;
  }, [ficha.id]);

  useEffect(() => {
    registrarVersion(`inscricao:${ficha.id}`, ficha.version);
    registrarVersion(`endereco:${ficha.id}`, ficha.endereco?.version ?? 0);
    registrarVersion(`momento:${ficha.id}`, ficha.momento?.version ?? 0);
    for (const p of ficha.pessoas) registrarVersion(`pessoa:${ficha.id}:${p.id}`, p.version);
  }, [ficha]);

  function trocarAba(a: Aba) {
    setAba(a);
    window.history.replaceState(null, '', `?aba=${a}`);
  }

  const mes = ficha.mesJornada;
  const foco = mes !== null && mes <= 12 && ficha.mentoria === 'RDV' ? FOCOS_RDV[mes - 1] : null;
  const titulo =
    mes === null
      ? 'Antes da IDR'
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
          {ficha.linkGrupo && (
            <a
              className={`${sm} wa`}
              href={ficha.linkGrupo}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icone d={ICONES.mentorados} />
              Grupo
            </a>
          )}
          {ficha.pessoas.map(
            (p) =>
              p.whatsapp && (
                <a
                  key={p.id}
                  className={`${sm} wa`}
                  href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icone d={ICONES.whatsapp} />
                  {p.apelido ?? p.nome.split(' ')[0]}
                </a>
              ),
          )}
          <MaisAcoes ficha={ficha} pedirTipo={() => setMudarTipo(true)} />
        </div>
      </header>

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
            <Jornada ficha={ficha} soLargo={aba === 'inscricao'} />
          )}
          {aba === 'pessoas' && <FichaPessoas ficha={ficha} atualizar={atualizar} />}
          {aba === 'momento' && <FichaMomento ficha={ficha} atualizar={atualizar} />}
          {aba === 'historico' && <HistoricoLista ficha={ficha} />}
        </div>
        <Inscricao
          ficha={ficha}
          responsaveis={responsaveis}
          ativo={aba === 'inscricao'}
          atualizar={atualizar}
          pedirTipo={() => setMudarTipo(true)}
        />
      </div>

      {mudarTipo && (
        <MudarTipo
          ficha={ficha}
          onFeito={() => router.refresh()}
          onFechar={() => setMudarTipo(false)}
        />
      )}
    </section>
  );
}
