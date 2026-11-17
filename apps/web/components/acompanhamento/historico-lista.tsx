'use client';
import {
  CANAIS_CONTATO,
  CANAL_CONTATO_LABEL,
  ETAPA_LABEL,
  REUNIAO_TIPO_LABEL,
  type CanalContato,
  type ContatoDTO,
  type FichaDTO,
  type HistoricoItem,
  type ReuniaoItem,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readPrefs } from '@npac/shared/screen-prefs';
import { useCallback, useEffect, useState } from 'react';
import { FICHA_REGRAS, atualizarAc } from '@/lib/acompanhamento-prefs';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { control, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';
import { quemConduz } from './reunioes-agenda';
import { diaHoraBR, ICONES, Icone, TagReuniao } from './ui';

const TITULOS: Record<string, string> = {
  'inscricao.criada': 'Inscrição criada',
  'inscricao.importada': 'Inscrição importada',
  'inscricao.editada': 'Alteração na inscrição',
  'inscricao.virou_casal': 'Mudou para casal',
  'inscricao.virou_individual': 'Mudou para individual',
  'pessoa.editada': 'Alteração na pessoa',
  'endereco.editado': 'Alteração no endereço',
  'momento.editado': 'Alteração no momento inicial',
  'momento.concluido': 'Momento inicial concluído',
  'momento.destravado': 'Momento inicial destravado',
  'avaliacao.editada': 'Alteração na avaliação',
  'onboarding.enviada': 'Etapa enviada',
  'onboarding.concluida': 'Etapa concluída',
  'onboarding.editada': 'Alteração no onboarding',
  'onboarding.dispensada': 'Etapa dispensada',
  'onboarding.fechado': 'Onboarding concluído',
  'caixa.preparando': 'Caixa em preparação',
  'caixa.enviada': 'Caixa enviada',
  'caixa.entregue': 'Caixa entregue',
  'caixa.editada': 'Alteração na Caixa',
  'reuniao.agendada': 'Reunião agendada',
  'reuniao.confirmada': 'Reunião confirmada',
  'reuniao.link_enviado': 'Link da reunião enviado',
  'reuniao.realizada': 'Reunião realizada',
  'reuniao.faltou': 'Falta na reunião registrada',
  'reuniao.registrada': 'Registro da reunião',
  'reuniao.remarcada': 'Reunião remarcada',
  'reuniao.excluida': 'Reunião excluída',
  'contato.registrado': 'Contato registrado',
  'idr.realizada': 'IDR realizada: começou a jornada',
  'idr.corrigida': 'Data da IDR corrigida',
  'acao.feita': 'Ação do plano feita',
  'acao.reaberta': 'Ação do plano reaberta',
  'acao.editada': 'Alteração na ação do plano',
  'inscricao.pausada': 'Inscrição pausada',
  'inscricao.retomada': 'Inscrição retomada',
  'pme.enviado': 'PME enviado',
  'pme.anterior': 'PME anterior ao sistema registrado',
  'pme.editado': 'Alteração no PME',
  'pme.concluido': 'PME concluído',
  'pme.reaberto': 'PME reaberto',
  'tarefa.criada': 'Tarefa combinada na reunião',
  'tarefa.marcada': 'Resultado da tarefa',
  'tarefa.editada': 'Alteração na tarefa',
  'meta.criada': 'Meta definida',
  'meta.editada': 'Alteração na meta',
};

const CAMPOS: Record<string, string> = {
  mentoria: 'Mentoria',
  mentoriaVariante: 'Variante',
  status: 'Status',
  responsavelId: 'Responsável',
  origem: 'Origem',
  dataCompra: 'Data da compra',
  inicioJornada: 'Início',
  terminoPrevisto: 'Término previsto',
  valorCentavos: 'Valor',
  formaPagamento: 'Pagamento',
  statusFinanceiro: 'Financeiro',
  linkPasta: 'Pasta',
  linkGrupo: 'Grupo',
  nome: 'Nome',
  apelido: 'Como prefere',
  nascimento: 'Nascimento',
  cidade: 'Cidade',
  uf: 'UF',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
  profissao: 'Profissão',
  ocupacao: 'Ocupação',
  filhosQuantidade: 'Filhos',
  filhosIdades: 'Idades dos filhos',
  tecnologia: 'Tecnologia',
  melhorHorario: 'Melhor horário',
  canalPreferido: 'Canal preferido',
  pulseira: 'Pulseira',
  endereco: 'Endereço',
  cep: 'CEP',
  data: 'Data',
  recebeCentavos: 'Recebe por mês',
  custoCentavos: 'Custo mensal',
  temDividas: 'Tem dívidas',
  dividasCentavos: 'Dívidas',
  guardadoCentavos: 'Guardado',
  dor: 'Dor',
  sonho: 'Sonho',
  meta: 'Meta',
  notaFe: 'Fé',
  notaSaude: 'Saúde',
  notaDinheiro: 'Dinheiro',
  notaRelacionamentos: 'Relacionamentos',
  resultadoProva: 'Prova',
  tipo: 'Tipo',
  pessoa_2: 'Pessoa 2',
  ...ETAPA_LABEL,
  grupoCriadoEm: 'Data do grupo',
  formularioPreenchido: 'Formulário preenchido',
  grupoAvisos: 'Grupo Avisos',
  grupoClube: 'Grupo Clube da Riqueza',
  grupoNacao: 'Grupo Nação Milionária',
  aulasConcluidas: 'Aulas concluídas',
  aulasConcluidasEm: 'Data das aulas',
  enviadoEm: 'Data de envio',
  entregueEm: 'Data de recebimento',
  rastreio: 'Rastreio',
  ...REUNIAO_TIPO_LABEL,
  ...CANAL_CONTATO_LABEL,
  dataIdr: 'Data da IDR',
  conduzidaPor: 'Quem conduz',
  condutorInscricaoId: 'Mentorado experiente',
  duracaoMin: 'Duração',
  plataforma: 'Plataforma',
  link: 'Link',
  resumo: 'Resumo',
  metas: 'Metas',
  combinado: 'Combinado',
  cobrar: 'O que cobrar',
  trava: 'Trava',
  anotacaoInterna: 'Anotação interna',
  humor: 'Humor',
  interesseRenovar: 'Interesse em renovar',
  inicio: 'Data e hora',
  reuniao: 'Reunião realizada',
  itensFeitos: 'Passos',
  observacao: 'Observação',
  evidenciaLink: 'Evidência',
  descricao: 'Descrição',
  prazo: 'Prazo',
  motivo: 'Motivo',
  pilar: 'Pilar',
  pessoaId: 'De quem',
  valorAlvo: 'Alvo',
  valorAtual: 'Atual',
  unidade: 'Unidade',
  concluidoEm: 'Conclusão',
  tarefa_reuniao: 'Tarefa da reunião',
  tarefa_extra: 'Atividade extra',
  tarefa_encerramento: 'Encerramento',
  tarefa_pme: 'Tarefa do PME',
};

/** `pme_3` e `pme_3_nao_concluido` (envio do PME) viram "3º PME" e "3º PME não concluído". */
function nomeCampo(c: string): string {
  const pme = /^pme_(\d+)(_nao_concluido)?$/.exec(c);
  if (pme) return `${pme[1]}º PME${pme[2] ? ' não concluído' : ''}`;
  return CAMPOS[c] ?? c;
}

const DIA = 86_400_000;

function quando(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / DIA);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

type Filtro = 'TUDO' | 'REUNIOES' | 'CONTATOS' | 'ANOTACOES' | 'ALTERACOES';
const FILTROS: [Filtro, string][] = [
  ['TUDO', 'Tudo'],
  ['REUNIOES', 'Reuniões'],
  ['CONTATOS', 'Contatos'],
  ['ANOTACOES', 'Anotações'],
  ['ALTERACOES', 'Alterações'],
];

/** Reunião e contato já aparecem como cartão próprio; o registro de alteração fica em Alterações. */
const doCartao = (tipo: string) => tipo.startsWith('reuniao.') || tipo === 'contato.registrado';

type Entrada =
  | { tipo: 'hist'; quando: string; e: HistoricoItem }
  | { tipo: 'reuniao'; quando: string; r: ReuniaoItem }
  | { tipo: 'contato'; quando: string; c: ContatoDTO };

function Reuniao({ r }: { r: ReuniaoItem }) {
  return (
    <Link className="ev ev-link" href={`/acompanhamento/reunioes/${r.id}`}>
      <span className="i">
        <Icone d={ICONES.reunioes} />
      </span>
      <div className="min-w-0">
        <b>
          {REUNIAO_TIPO_LABEL[r.tipo]} com {quemConduz(r)}
        </b>
        <p className="ev-tags">
          <TagReuniao status={r.status} />
          {r.temRegistro && <span className="tag">Com registro</span>}
        </p>
        <time dateTime={r.inicio}>{diaHoraBR(r.inicio)}</time>
      </div>
    </Link>
  );
}

function Contato({ c }: { c: ContatoDTO }) {
  const resposta =
    c.respondeu === null
      ? null
      : c.respondeu
        ? `Respondeu${c.tempoRespostaMin != null ? ` em ${c.tempoRespostaMin} min` : ''}`
        : 'Não respondeu';
  return (
    <div className="ev">
      <span className="i">
        <Icone d={c.canal === 'WHATSAPP' ? ICONES.whatsapp : ICONES.sino} />
      </span>
      <div className="min-w-0">
        <b>
          {CANAL_CONTATO_LABEL[c.canal]} por {c.feitoPor}
        </b>
        {(c.motivo || resposta) && <p>{[c.motivo, resposta].filter(Boolean).join('. ')}.</p>}
        {c.observacao && <p>{c.observacao}</p>}
        <time dateTime={c.quando}>{diaHoraBR(c.quando)}</time>
      </div>
    </div>
  );
}

const CONTATO_VAZIO = {
  canal: 'WHATSAPP' as CanalContato,
  motivo: '',
  respondeu: '',
  observacao: '',
};

function NovoContato({ ficha, onFechar }: { ficha: FichaDTO; onFechar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(CONTATO_VAZIO);
  return (
    <Dialogo
      titulo="Registrar contato"
      texto="Conta como último contato na lista de Mentorados."
      rotulo="Registrar contato"
      onConfirmar={async () => {
        await clientApi('/api/mentoria/contatos', 'POST', {
          inscricaoId: ficha.id,
          canal: f.canal,
          ...(f.motivo.trim() ? { motivo: f.motivo.trim() } : {}),
          ...(f.respondeu ? { respondeu: f.respondeu === 'sim' } : {}),
          ...(f.observacao.trim() ? { observacao: f.observacao.trim() } : {}),
        });
        router.refresh();
      }}
      onFechar={onFechar}
    >
      <div className="seg rn-canais" role="group" aria-label="Canal">
        {CANAIS_CONTATO.map((c) => (
          <button
            key={c}
            type="button"
            className={f.canal === c ? 'on' : ''}
            aria-pressed={f.canal === c}
            onClick={() => setF({ ...f, canal: c })}
          >
            {CANAL_CONTATO_LABEL[c]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink2">Motivo</span>
        <input
          className={control}
          maxLength={200}
          value={f.motivo}
          onChange={(e) => setF({ ...f, motivo: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink2">Respondeu?</span>
        <select
          className={control}
          value={f.respondeu}
          onChange={(e) => setF({ ...f, respondeu: e.target.value })}
        >
          <option value="">Ainda não sei</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink2">Observação</span>
        <textarea
          className={control}
          rows={3}
          maxLength={20_000}
          value={f.observacao}
          onChange={(e) => setF({ ...f, observacao: e.target.value })}
        />
      </label>
    </Dialogo>
  );
}

function Evento({ e }: { e: HistoricoItem }) {
  const anotacao = e.tipo === 'anotacao';
  return (
    <div className="ev">
      <span className="i">
        <Icone d={anotacao ? ICONES.ficha : ICONES.config} />
      </span>
      <div className="min-w-0">
        <b>
          {anotacao ? `Anotação de ${e.ator}` : `${TITULOS[e.tipo] ?? 'Alteração'} por ${e.ator}`}
        </b>
        {anotacao && <p>{e.texto}</p>}
        {!anotacao && e.campos.length > 0 && <p>Campos: {e.campos.map(nomeCampo).join(', ')}.</p>}
        <time dateTime={e.quando}>{quando(e.quando)}</time>
      </div>
    </div>
  );
}

/** Aba Histórico: alterações (só nomes de campos) e anotações. */
export function HistoricoLista({
  ficha,
  lembrar,
}: {
  ficha: FichaDTO;
  /** Cookie da ficha (NPAC-46): o filtro fica na chave `historico`. */
  lembrar: { cookie: string; valor: string };
}) {
  const [itens, setItens] = useState<HistoricoItem[] | null>(null);
  const [erro, setErro] = useState('');
  const salvo = (valor: string) =>
    (readPrefs(valor, FICHA_REGRAS).historico as Filtro | undefined) ?? 'TUDO';
  const [filtro, setFiltroState] = useState<Filtro>(() => salvo(lembrar.valor));
  const setFiltro = (f: Filtro) => {
    setFiltroState(f);
    atualizarAc('ficha', lembrar.cookie, FICHA_REGRAS, {
      historico: f === 'TUDO' ? undefined : f,
    });
  };
  // Voltar à aba ou do navegador: vale o filtro mais novo do cookie.
  useLatestPrefs(lembrar.cookie, lembrar.valor, (valor) => setFiltroState(salvo(valor)));
  const [anotando, setAnotando] = useState(false);
  const [contato, setContato] = useState(false);
  const [texto, setTexto] = useState('');
  const url = `/api/mentoria/inscricoes/${ficha.id}`;

  const carregar = useCallback(
    () =>
      clientApi<{ itens: HistoricoItem[] }>(`${url}/historico`)
        .then((r) => setItens(r.itens))
        .catch((e: Error) => setErro(e.message)),
    [url],
  );
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const entradas: Entrada[] = [
    ...(filtro === 'TUDO' || filtro === 'REUNIOES'
      ? ficha.reunioes.map((r): Entrada => ({ tipo: 'reuniao', quando: r.inicio, r }))
      : []),
    ...(filtro === 'TUDO' || filtro === 'CONTATOS'
      ? ficha.contatos.map((c): Entrada => ({ tipo: 'contato', quando: c.quando, c }))
      : []),
    ...(itens ?? [])
      .filter((e) =>
        filtro === 'TUDO'
          ? !doCartao(e.tipo)
          : filtro === 'ANOTACOES'
            ? e.tipo === 'anotacao'
            : filtro === 'ALTERACOES' && e.tipo !== 'anotacao',
      )
      .map((e): Entrada => ({ tipo: 'hist', quando: e.quando, e })),
  ].sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));

  return (
    <section className="card pa" role="tabpanel" aria-label="Histórico">
      <div className="hh">
        <div className="hf" role="group" aria-label="Filtrar o histórico">
          {FILTROS.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              className={filtro === id ? 'on' : ''}
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="hh-acoes">
          {ficha.pode.reuniao && (
            <Link
              className={`${quietButton} sm`}
              href={`/acompanhamento/reunioes/nova?inscricao=${ficha.id}`}
            >
              Agendar reunião
            </Link>
          )}
          {ficha.pode.contato && (
            <button type="button" className={`${quietButton} sm`} onClick={() => setContato(true)}>
              Registrar contato
            </button>
          )}
          {ficha.pode.anotacao && (
            <button type="button" className={`${quietButton} sm`} onClick={() => setAnotando(true)}>
              Nova anotação
            </button>
          )}
        </div>
      </div>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {erro}
        </p>
      )}
      {itens && entradas.length === 0 && <p className="hist-vazio">Nada por aqui ainda.</p>}
      {entradas.map((x) =>
        x.tipo === 'reuniao' ? (
          <Reuniao key={`r${x.r.id}`} r={x.r} />
        ) : x.tipo === 'contato' ? (
          <Contato key={`c${x.c.id}`} c={x.c} />
        ) : (
          <Evento key={x.e.id} e={x.e} />
        ),
      )}
      {contato && <NovoContato ficha={ficha} onFechar={() => setContato(false)} />}
      {anotando && (
        <Dialogo
          titulo="Nova anotação"
          rotulo="Salvar anotação"
          podeConfirmar={texto.trim() !== ''}
          onConfirmar={async () => {
            await clientApi(`${url}/anotacoes`, 'POST', { texto: texto.trim() });
            setTexto('');
            await carregar();
          }}
          onFechar={() => setAnotando(false)}
        >
          <textarea
            className={control}
            aria-label="Anotação"
            autoFocus
            rows={5}
            maxLength={20_000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </Dialogo>
      )}
    </section>
  );
}
