'use client';
import {
  CANAL_CONTATO_LABEL,
  DEGRAU_CANAL,
  DEGRAU_DETALHE,
  ETAPA_LABEL,
  FILA_GRUPOS,
  INSCRICAO_STATUS_LABEL,
  SEMAFORO_COR_LABEL,
  SEMAFORO_MOTIVO_LABEL,
  TAREFA_STATUS_LABEL,
  PERFIL_LABEL,
  REUNIAO_STATUS_LABEL,
  REUNIAO_TIPO_LABEL,
  diasParado,
  filaTitulo,
  momentoDoItem,
  reuniaoAberta,
  textoPronto,
  type FilaDTO,
  type FilaGrupo,
  type FilaItemDTO,
  type MensagemModelo,
  type Responsavel,
} from '@npac/shared/mentoria';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { readPrefs } from '@npac/shared/screen-prefs';
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { FILA_REGRAS, atualizarAc } from '@/lib/acompanhamento-prefs';
import { readPreference } from '@/lib/read-preference';
import { clientApi } from '@/lib/client-api';
import { showToast } from '@/components/toast';
import { ExportarBotao } from './exportar-botao';
import { ICONES, Icone, RostoCarteira, Rostos, dataBR, diaBR, horaBR } from './ui';
import { WhatsappBotoes } from './whatsapp-botoes';
import { Avatar, AVATAR_OUTRO, SEM_FOTOS, type TeamPhotos } from '@/components/avatar';

const ficha = (id: string, aba = 'jornada') => `/acompanhamento/ficha/${id}?aba=${aba}`;
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const dias = (n: number) => `${n} ${plural(n, 'dia', 'dias')}`;
/** Atraso que pinta os dias de vermelho; até ele, cinza firme (o cabeçalho Atrasados segue vermelho). */
const ATRASO_ALARME_DIAS = 14;

type Acao = {
  label: string;
  href?: string;
  run?: () => Promise<unknown>;
  /** Abre a janela do envio com o cronograma (NPAC-60) em vez de concluir no clique. */
  envio?: true;
};
/** Janela do envio do PME com o cronograma: só baixa quando abre. */
const CronogramaEnvio = dynamic(() => import('./cronograma-envio'), { ssr: false });
const diaDeBrasilia = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/** A ação principal de cada tipo: conclui ali mesmo ou leva à tela que conclui. */
function acaoDe(item: FilaItemDTO): Acao | null {
  const ref = item.referenciaId;
  const insc = item.inscricaoId;
  const etapa = (status: 'ENVIADA' | 'CONCLUIDA') => () =>
    clientApi(`/api/mentoria/onboarding/${ref}`, 'PATCH', {
      version: item.etapa!.version,
      status,
    });
  const feito = () => clientApi('/api/mentoria/fila/feito', 'POST', { chave: item.chave });
  switch (item.tipo) {
    case 'BOAS_VINDAS':
    case 'PASSO_DEVIDO':
      return item.etapa?.status === 'PENDENTE'
        ? { label: 'Marcar enviada', run: etapa('ENVIADA') }
        : null;
    case 'PARADO':
      return item.etapa?.status === 'ENVIADA'
        ? { label: 'Marcar concluída', run: etapa('CONCLUIDA') }
        : null;
    case 'ENVIAR_CAIXA':
      return insc ? { label: 'Registrar envio', href: ficha(insc) } : null;
    case 'CAIXA_ATRASADA':
      return insc ? { label: 'Registrar recebimento', href: ficha(insc) } : null;
    case 'AGENDAR_IDR':
      return insc
        ? { label: 'Agendar', href: `/acompanhamento/reunioes/nova?inscricao=${insc}` }
        : null;
    case 'LEMBRETE_IDR':
    case 'AGENDA_MES':
    case 'REUNIOES_6M':
      return { label: 'Concluir', run: feito };
    case 'LINK_IDR':
      return item.reuniao
        ? {
            label: 'Link enviado',
            run: () =>
              clientApi(`/api/mentoria/reunioes/${ref}`, 'PATCH', {
                version: item.reuniao!.version,
                status: 'LINK_ENVIADO',
              }),
          }
        : null;
    case 'ENVIAR_PME1':
      return insc
        ? {
            label: 'Marcar enviado',
            run: () =>
              clientApi(`/api/mentoria/inscricoes/${insc}/pme1-enviado`, 'PUT', { enviado: true }),
          }
        : null;
    case 'ACAO':
      return item.acao
        ? {
            label: 'Concluir',
            run: () =>
              clientApi(`/api/mentoria/acoes/${ref}`, 'PATCH', {
                version: item.acao!.version,
                status: 'FEITA',
              }),
          }
        : null;
    case 'FOTO_FAMILIA':
      return insc ? { label: 'Anexar a foto', href: ficha(insc) } : null;
    case 'REUNIAO_HOJE':
      return item.reuniao && reuniaoAberta(item.reuniao.status)
        ? { label: 'Registrar', href: `/acompanhamento/reunioes/${ref}` }
        : { label: 'Abrir', href: `/acompanhamento/reunioes/${ref}` };
    // Fase 2, Parte 4 (E17–E20).
    case 'COBRANCA':
      return item.tarefa
        ? {
            label: 'Marcar feita',
            run: () =>
              clientApi(`/api/mentoria/tarefas/${ref}`, 'PATCH', {
                version: item.tarefa!.version,
                status: 'FEITA',
              }),
          }
        : null;
    case 'SEMAFORO':
      return { label: 'Visto nesta semana', run: feito };
    case 'ENVIAR_PME':
      return insc
        ? {
            label: 'Registrar envio',
            envio: true,
          }
        : null;
    case 'PME_ATRASADO': {
      const degrau = item.ciclo?.degrau;
      return insc && degrau
        ? {
            label: 'Registrar contato',
            run: () =>
              clientApi('/api/mentoria/contatos', 'POST', {
                inscricaoId: insc,
                canal: DEGRAU_CANAL[degrau],
                cicloId: ref,
                degrau,
              }),
          }
        : null;
    }
    // NPAC-56: a responsável se escolhe no painel; o estorno sai com "Visto".
    case 'NOVA_INSCRICAO':
      return null;
    case 'VENDA_ESTORNADA':
      return { label: 'Visto', run: feito };
  }
}

const motivosDe = (item: FilaItemDTO) =>
  (item.semaforo?.motivos ?? []).map((m) => SEMAFORO_MOTIVO_LABEL[m]).join(', ');

/** A linha da lista: o que fazer, com o contexto que cabe numa linha. */
function oQue(item: FilaItemDTO, agora: Date): string {
  const n = diasParado(item.venceEm, agora);
  const etapa = item.etapa ? ETAPA_LABEL[item.etapa.nome] : '';
  switch (item.tipo) {
    case 'PASSO_DEVIDO':
      return `Próximo passo: ${etapa}`;
    case 'PARADO':
      return `Parado há ${dias(n)} em ${etapa}`;
    case 'CAIXA_ATRASADA':
      return `Caixa não recebida há ${dias(n)}`;
    case 'REUNIAO_HOJE':
      return item.reuniao
        ? `${REUNIAO_TIPO_LABEL[item.reuniao.tipo]}${item.reuniao.condutor ? `, com ${item.reuniao.condutor}` : ''}`
        : filaTitulo(item);
    case 'COBRANCA':
      return item.tarefa?.descricao ? `Cobrar: ${item.tarefa.descricao}` : filaTitulo(item);
    case 'SEMAFORO':
      return item.semaforo ? `${filaTitulo(item)}: ${motivosDe(item)}` : filaTitulo(item);
    case 'NOVA_INSCRICAO':
      return item.mentorado ? `Nova inscrição · ${item.mentorado.mentoria}` : filaTitulo(item);
    default:
      return filaTitulo(item);
  }
}

/** O porquê do item, no painel. */
function explicacao(item: FilaItemDTO, agora: Date): string {
  const desde = dataBR(diaBR(item.venceEm));
  switch (item.tipo) {
    case 'BOAS_VINDAS':
      return 'Inscrição nova. Crie o grupo e mande as boas-vindas com o formulário da Caixa.';
    case 'PASSO_DEVIDO':
      return `O passo anterior fechou em ${desde}, e o prazo do próximo é de 3 dias.`;
    case 'PARADO':
      return `A etapa foi enviada em ${desde}, e o prazo é de 3 dias.`;
    case 'ENVIAR_CAIXA':
      return item.atrasado
        ? `O formulário foi preenchido em ${desde}. A Caixa deveria sair em até 3 dias.`
        : `O formulário foi preenchido em ${desde}. O endereço fica na ficha.`;
    case 'CAIXA_ATRASADA':
      return `A Caixa saiu em ${desde}, e o prazo de 20 dias para a entrega venceu.`;
    case 'AGENDAR_IDR':
      return 'A Caixa já chegou. Falta marcar a reunião de Introdução da Riqueza.';
    case 'LEMBRETE_IDR':
      return 'Mande pela manhã o lembrete da reunião de hoje.';
    case 'LINK_IDR':
      return item.reuniao
        ? `O link vai no grupo 30 minutos antes, às ${horaBR(new Date(new Date(item.reuniao.inicio).getTime() - 30 * 60_000).toISOString())}.`
        : 'O link vai no grupo 30 minutos antes.';
    case 'ENVIAR_PME1':
      return 'A IDR foi realizada e iniciou os 12 meses. Falta enviar o 1º PME.';
    case 'ACAO':
      return item.acao
        ? `${item.acao.foco}. Prevista para ${desde}${item.atrasado ? `, atrasada ${dias(diasParado(item.venceEm, agora))}` : ''}.`
        : '';
    case 'FOTO_FAMILIA':
      return 'A foto é para o presente do mês 11.';
    case 'AGENDA_MES':
      return 'A arte da agenda sai todo dia 1º, para todos os mentorados.';
    case 'REUNIOES_6M':
      return 'Todo dia 1º, agende as reuniões mensais de quem está no 6M.';
    case 'REUNIAO_HOJE':
      return item.reuniao
        ? `Hoje às ${horaBR(item.reuniao.inicio)}, ${REUNIAO_STATUS_LABEL[item.reuniao.status].toLowerCase()}.`
        : '';
    case 'COBRANCA': {
      const t = item.tarefa;
      if (!t) return '';
      const onde = t.origem === 'REUNIAO' ? 'na reunião' : `no ${t.cicloNumero ?? ''}º PME`;
      return `Tarefa combinada ${onde}, com prazo em ${dataBR(t.prazo)}. Status: ${TAREFA_STATUS_LABEL[t.status].toLowerCase()}. Parcial ou não feita pede o motivo, na ficha.`;
    }
    case 'SEMAFORO':
      return `${motivosDe(item)}. Sai quando voltar ao verde ou com "Visto nesta semana".`;
    case 'ENVIAR_PME':
      return item.ciclo
        ? `O ${item.ciclo.numero}º PME foi encerrado em ${desde}. O ${item.ciclo.numero + 1}º sai quando a equipe decidir.`
        : '';
    case 'PME_ATRASADO':
      return item.ciclo?.degrau
        ? `${DEGRAU_DETALHE[item.ciclo.degrau]} O contato fica registrado na ficha.`
        : '';
    case 'NOVA_INSCRICAO':
      return `Venda registrada no comercial em ${desde}. A inscrição entrou sem responsável: escolha quem acompanha.`;
    case 'VENDA_ESTORNADA':
      return 'A venda foi estornada no comercial e a inscrição ficou cancelada. Reuniões, ações e contatos continuam na ficha.';
  }
}

type Linha = { item: FilaItemDTO; link: FilaItemDTO | null };

/** Itens sem mensagem-modelo que ainda levam os botões de WhatsApp do mentorado. */
const COM_WHATSAPP: FilaItemDTO['tipo'][] = [
  'REUNIAO_HOJE',
  'ENVIAR_PME1',
  'COBRANCA',
  'SEMAFORO',
  'PME_ATRASADO',
];

function prazo(l: Linha, agora: Date): { texto: string; classe: string } {
  const { item, link } = l;
  if (item.tipo === 'REUNIAO_HOJE' && item.reuniao) {
    if (link?.reuniao)
      return {
        texto: `Enviar às ${horaBR(new Date(new Date(link.reuniao.inicio).getTime() - 30 * 60_000).toISOString())}`,
        classe: 'warn',
      };
    const st = item.reuniao.status;
    return {
      texto: REUNIAO_STATUS_LABEL[st],
      classe: st === 'LINK_ENVIADO' || st === 'REALIZADA' ? 'okc' : '',
    };
  }
  if (item.tipo === 'PME_ATRASADO' && item.ciclo)
    return {
      texto: `${dias(item.ciclo.diasAtraso)} de atraso`,
      classe: item.ciclo.diasAtraso > ATRASO_ALARME_DIAS ? 'late' : '',
    };
  const n = diasParado(item.venceEm, agora);
  if (item.atrasado)
    return { texto: n > 0 ? dias(n) : 'Hoje', classe: n > ATRASO_ALARME_DIAS ? 'late' : '' };
  if (n === 1) return { texto: 'Desde ontem', classe: '' };
  if (n > 1) return { texto: `Desde ${dataBR(diaBR(item.venceEm))}`, classe: '' };
  return { texto: 'Hoje', classe: '' };
}

function quem(item: FilaItemDTO, euId: string): string {
  if (item.responsavelId === euId) return 'Você';
  return item.responsavelNome ?? PERFIL_LABEL[item.responsavelPerfil];
}

const HOJE_LONGO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Fila do dia (D18): agenda de hoje, Atrasados e Hoje, filtro por tipo e painel do item. */
export function Fila({
  dados,
  mensagens,
  responsaveis = [],
  euId,
  temPerfil,
  admin,
  exportar,
  lembrar,
  inicialGrupo,
  photos = SEM_FOTOS,
}: {
  dados: FilaDTO;
  mensagens: MensagemModelo[];
  /** Quem pode ser responsável (NPAC-56): o painel da "Nova inscrição". */
  responsaveis?: Responsavel[];
  euId: string;
  temPerfil: boolean;
  admin: boolean;
  exportar: boolean;
  /** Cookie dos filtros lembrados (NPAC-46) e o valor que o servidor leu. */
  lembrar: { cookie: string; valor: string };
  inicialGrupo: FilaGrupo | 'TODOS';
  /** Fotos da equipe (NPAC-53): responsável de cada item. */
  photos?: TeamPhotos;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [grupo, setGrupo] = useState<FilaGrupo | 'TODOS'>(inicialGrupo);
  const [erro, setErro] = useState<string | null>(null);
  // Concluir (NPAC-47): o item sai da lista no clique; erro da API o devolve, com a mensagem.
  // Item de link da IDR: só a ação do link some, a reunião de hoje fica na agenda.
  const [feitos, marcarFeito] = useOptimistic<string[], string>([], (f, chave) => [...f, chave]);
  const [, startTransition] = useTransition();
  const [envio, setEnvio] = useState<FilaItemDTO | null>(null);
  const agora = new Date(dados.agora);

  // A IDR de hoje aparece uma vez na agenda; o "enviar o link" vira a ação da linha.
  const reunioesHoje = new Set(
    dados.itens.filter((i) => i.tipo === 'REUNIAO_HOJE').map((i) => i.referenciaId),
  );
  const linkDe = new Map(
    dados.itens
      .filter((i) => i.tipo === 'LINK_IDR' && reunioesHoje.has(i.referenciaId))
      .map((i) => [i.referenciaId, i]),
  );
  const daGrupo = (i: FilaItemDTO, g: FilaGrupo | 'TODOS') =>
    g === 'TODOS' ||
    (FILA_GRUPOS.find((x) => x.chave === g)!.tipos as readonly string[]).includes(i.tipo);
  const linhas: Linha[] = dados.itens
    .filter((i) => !(i.tipo === 'LINK_IDR' && reunioesHoje.has(i.referenciaId)))
    .filter((i) => !feitos.includes(i.chave))
    .map((item) => {
      const link = linkDe.get(item.referenciaId) ?? null;
      return { item, link: link && !feitos.includes(link.chave) ? link : null };
    });
  const visiveis = linhas.filter((l) => daGrupo(l.item, grupo));
  const agenda = visiveis
    .filter((l) => l.item.tipo === 'REUNIAO_HOJE')
    .sort((a, b) => a.item.venceEm.localeCompare(b.item.venceEm));
  const resto = visiveis.filter((l) => l.item.tipo !== 'REUNIAO_HOJE');
  const bandas = [
    { titulo: 'Agenda de hoje', classe: '', linhas: agenda },
    { titulo: 'Atrasados', classe: 'late', linhas: resto.filter((l) => l.item.atrasado) },
    { titulo: 'Hoje', classe: '', linhas: resto.filter((l) => !l.item.atrasado) },
  ].filter((b) => b.linhas.length > 0);

  const selChave = params.get('item');
  const aberto = !!selChave;
  const sel =
    visiveis.find((l) => l.item.chave === selChave) ??
    (bandas[0]?.linhas[0] as Linha | undefined) ??
    null;

  const abrir = (chave: string) => {
    const q = new URLSearchParams(params.toString());
    q.set('item', chave);
    window.history.pushState(null, '', `?${q.toString()}`);
  };
  const fechar = () => {
    const q = new URLSearchParams(params.toString());
    q.delete('item');
    const s = q.toString();
    window.history.pushState(null, '', s ? `?${s}` : window.location.pathname);
  };
  const escopoHref = (e: 'MINHA' | 'EQUIPE') =>
    e === 'EQUIPE' ? '/acompanhamento/fila?ver=equipe' : '/acompanhamento/fila?ver=minha';

  const escolherGrupo = (g: FilaGrupo | 'TODOS') => {
    setGrupo(g);
    atualizarAc('fila', lembrar.cookie, FILA_REGRAS, { grupo: g === 'TODOS' ? undefined : g });
  };
  // `ver` na URL vence e vira o lembrado. Sem ele, voltar do navegador ou o pré-carregamento do
  // menu podem trazer a fila de antes: vale o mais novo do cookie.
  const verUrl = params.get('ver');
  const primeiraVisao = useRef({ escopo: dados.escopo, temPerfil });
  useEffect(() => {
    const salvo = readPrefs(readPreference(lembrar.cookie, lembrar.valor), FILA_REGRAS);
    const { escopo, temPerfil: comBotao } = primeiraVisao.current;
    if (verUrl) atualizarAc('fila', lembrar.cookie, FILA_REGRAS, { ver: verUrl });
    else if (comBotao && salvo.ver && salvo.ver.toUpperCase() !== escopo) {
      router.replace(`/acompanhamento/fila?ver=${salvo.ver}`);
      return;
    }
    setGrupo((salvo.grupo as FilaGrupo | undefined) ?? 'TODOS');
  }, [verUrl, lembrar.cookie, lembrar.valor, router]);

  const executar = (l: Linha) => {
    const acao = l.link ? acaoDe(l.link) : acaoDe(l.item);
    if (!acao?.run) return;
    const run = acao.run;
    const chave = (l.link ?? l.item).chave;
    setErro(null);
    if (!l.link && selChave === l.item.chave) fechar();
    startTransition(async () => {
      marcarFeito(chave);
      try {
        await run();
        showToast();
        router.refresh();
      } catch (e) {
        setErro((e as Error).message);
      }
    });
  };

  // "Nova inscrição" (NPAC-56, G4): a Admin escolhe a responsável; o item sai no clique.
  const escolherResponsavel = (item: FilaItemDTO, responsavelId: string) => {
    const insc = item.inscricaoId;
    if (!insc) return;
    setErro(null);
    if (selChave === item.chave) fechar();
    startTransition(async () => {
      marcarFeito(item.chave);
      try {
        const atual = await clientApi<{ version: number }>(`/api/mentoria/inscricoes/${insc}`);
        await clientApi(`/api/mentoria/inscricoes/${insc}`, 'PATCH', {
          version: atual.version,
          responsavelId,
        });
        showToast();
        router.refresh();
      } catch (e) {
        setErro((e as Error).message);
      }
    });
  };

  const atrasados = resto.filter((l) => l.item.atrasado).length;
  const hojeTexto = HOJE_LONGO.format(agora);
  const resumo = `${hojeTexto[0]!.toUpperCase()}${hojeTexto.slice(1)}. ${visiveis.length} ${plural(visiveis.length, 'item', 'itens')}, ${atrasados} ${plural(atrasados, 'atrasado', 'atrasados')}.`;

  const botaoAcao = (l: Linha, classe: string) => {
    const acao = l.link ? acaoDe(l.link) : acaoDe(l.item);
    if (!acao) return null;
    if (acao.envio)
      return (
        <button type="button" className={classe} onClick={() => setEnvio(l.item)}>
          {acao.label}
        </button>
      );
    if (acao.href)
      return (
        <Link className={classe} href={acao.href} prefetch={false}>
          {acao.label}
        </Link>
      );
    return (
      <button type="button" className={classe} onClick={() => executar(l)}>
        {acao.label}
      </button>
    );
  };

  return (
    <section className={`view fila-tela ${aberto ? 'painel-aberto' : ''}`}>
      <div className="hrow">
        <div>
          <h1 className="h1">Fila do dia</h1>
          <p className="sub">{resumo}</p>
        </div>
        <div className="acts">
          {temPerfil && (
            <div className="seg" role="group" aria-label="De quem é a fila">
              <Link
                className={dados.escopo === 'MINHA' ? 'on' : ''}
                aria-current={dados.escopo === 'MINHA' ? 'true' : undefined}
                href={escopoHref('MINHA')}
              >
                Minha fila
              </Link>
              <Link
                className={dados.escopo === 'EQUIPE' ? 'on' : ''}
                aria-current={dados.escopo === 'EQUIPE' ? 'true' : undefined}
                href={escopoHref('EQUIPE')}
              >
                Equipe
              </Link>
            </div>
          )}
          {exportar && (
            <span className="so-desk">
              <ExportarBotao aba="FILA" filtros={{ escopo: dados.escopo }} />
            </span>
          )}
        </div>
      </div>

      <div className="fchips" role="group" aria-label="Tipo de item">
        {[{ chave: 'TODOS' as const, label: 'Todos' }, ...FILA_GRUPOS].map((g) => (
          <button
            key={g.chave}
            type="button"
            className={`fchip ${grupo === g.chave ? 'on' : ''}`}
            aria-pressed={grupo === g.chave}
            onClick={() => escolherGrupo(g.chave)}
          >
            {g.label}
            <span>{linhas.filter((l) => daGrupo(l.item, g.chave)).length}</span>
          </button>
        ))}
      </div>

      {erro && (
        <p role="alert" className="fila-erro">
          {erro}
        </p>
      )}

      <div className="fila">
        <div className="fila-lista">
          {bandas.map((b) => (
            <section key={b.titulo} className={`card band ${b.classe}`}>
              <header>
                <h2>{b.titulo}</h2>
                <span>{b.linhas.length}</span>
              </header>
              <ul>
                {b.linhas.map((l) => {
                  const { item } = l;
                  const p = prazo(l, agora);
                  const agendaLinha = item.tipo === 'REUNIAO_HOJE';
                  const nome = item.mentorado?.nome ?? 'Toda a carteira';
                  return (
                    <li
                      key={item.chave}
                      className={`fr ${agendaLinha ? 'ag' : ''} ${sel?.item.chave === item.chave ? 'sel' : ''}`}
                      data-chave={item.chave}
                    >
                      <button
                        type="button"
                        className="fr-hit"
                        aria-label={`Abrir ${nome}: ${oQue(item, agora)}`}
                        onClick={() => abrir(item.chave)}
                      />
                      {agendaLinha && item.reuniao && (
                        <span className="fr-hora">{horaBR(item.reuniao.inicio)}</span>
                      )}
                      {item.mentorado ? (
                        <Rostos
                          pessoas={item.mentorado.pessoas.map((x) => ({
                            nome: x.nome,
                            fotoMidiaId: null,
                          }))}
                        />
                      ) : (
                        <RostoCarteira />
                      )}
                      <div className="fr-texto">
                        <div className="who">{nome}</div>
                        <div className="what">{oQue(item, agora)}</div>
                        <div className="fr-m">
                          <span className={`due ${p.classe}`}>{p.texto}</span>, {quem(item, euId)}
                        </div>
                      </div>
                      <span className="fr-resp inline-flex items-center gap-1.5">
                        {item.responsavelId && (
                          <Avatar
                            name={item.responsavelNome ?? quem(item, euId)}
                            photo={photos.photos[item.responsavelId]}
                            className={`${AVATAR_OUTRO} size-5 text-[10px]`}
                          />
                        )}
                        {quem(item, euId)}
                      </span>
                      <span className={`fr-due ${p.classe}`}>{p.texto}</span>
                      {botaoAcao(l, 'btn btn-secondary sm fr-acao')}
                      <Icone d={ICONES.seta} className="fr-seta" largura={2} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {bandas.length === 0 && (
            <section className="card fila-vazia">
              {linhas.length === 0
                ? 'Nada na fila. Os itens aparecem aqui quando algo vence.'
                : 'Nenhum item nesta visão. Troque o filtro para ver o resto da fila.'}
            </section>
          )}
        </div>

        <aside className={`painel card ${aberto ? 'aberto' : ''}`} aria-label="Detalhe do item">
          {sel && (
            <Painel
              l={sel}
              agora={agora}
              euId={euId}
              mensagens={mensagens}
              admin={admin}
              fechar={fechar}
              acao={botaoAcao(sel, 'btn btn-primary')}
              responsaveis={responsaveis}
              escolherResponsavel={escolherResponsavel}
            />
          )}
        </aside>
      </div>
      {envio?.inscricaoId && (
        <CronogramaEnvio
          inscricaoId={envio.inscricaoId}
          nome={envio.mentorado?.nome ?? 'a pessoa'}
          hoje={diaDeBrasilia(agora)}
          modo={{ tipo: 'envio', numero: (envio.ciclo?.numero ?? 0) + 1 }}
          onFechar={() => setEnvio(null)}
          onFeito={() => {
            const chave = envio.chave;
            if (selChave === chave) fechar();
            startTransition(() => {
              marcarFeito(chave);
              showToast();
              router.refresh();
            });
          }}
        />
      )}
    </section>
  );
}

function Painel({
  l,
  agora,
  euId,
  mensagens,
  admin,
  fechar,
  acao,
  responsaveis,
  escolherResponsavel,
}: {
  l: Linha;
  agora: Date;
  euId: string;
  mensagens: MensagemModelo[];
  admin: boolean;
  fechar: () => void;
  acao: React.ReactNode;
  responsaveis: Responsavel[];
  escolherResponsavel: (item: FilaItemDTO, responsavelId: string) => void;
}) {
  const { item } = l;
  const m = item.mentorado;
  const p = prazo(l, agora);
  const momento = momentoDoItem(item.tipo, item.etapa?.nome ?? null);
  const modelo = momento ? mensagens.find((x) => x.momento === momento) : undefined;
  const texto = m && modelo ? textoPronto(modelo, m.tipo, m.pessoas) : null;
  const ctx: [string, string][] = [];
  if (item.reuniao) {
    ctx.push(['Horário', `Hoje às ${horaBR(item.reuniao.inicio)}`]);
    if (item.reuniao.condutor) ctx.push(['Conduz', item.reuniao.condutor]);
    ctx.push(['Status', REUNIAO_STATUS_LABEL[item.reuniao.status]]);
  }
  if (item.acao) {
    ctx.push(['Mês', String(item.acao.mes)]);
    ctx.push(['Prevista para', dataBR(diaBR(item.venceEm))]);
  }
  if (item.etapa) ctx.push(['Etapa', ETAPA_LABEL[item.etapa.nome]]);
  if (item.tarefa) {
    ctx.push(['Prazo', dataBR(item.tarefa.prazo)]);
    ctx.push(['Status', TAREFA_STATUS_LABEL[item.tarefa.status]]);
  }
  if (item.semaforo) ctx.push(['Semáforo', SEMAFORO_COR_LABEL[item.semaforo.cor]]);
  if (item.ciclo && item.tipo === 'PME_ATRASADO') {
    ctx.push(['PME', `${item.ciclo.numero}º PME`]);
    ctx.push(['Prazo atual', dataBR(item.ciclo.prazoAtual)]);
    if (item.ciclo.degrau)
      ctx.push(['Contato registrado como', CANAL_CONTATO_LABEL[DEGRAU_CANAL[item.ciclo.degrau]]]);
  }
  ctx.push(['Responsável', quem(item, euId)]);

  return (
    <div className="pn">
      <button type="button" className="pn-fechar" onClick={fechar}>
        <Icone d={ICONES.voltar} largura={2} />
        Voltar para a fila
      </button>
      <div className="pn-h">
        {m ? (
          <Rostos pessoas={m.pessoas.map((x) => ({ nome: x.nome, fotoMidiaId: null }))} />
        ) : (
          <RostoCarteira />
        )}
        <div style={{ minWidth: 0 }}>
          <h2>{m?.nome ?? 'Toda a carteira'}</h2>
          <div className="pn-tags">
            {m ? (
              <>
                <span className="tag">{m.mentoria}</span>
                <span className="tag">{m.tipo === 'CASAL' ? 'Casal' : 'Individual'}</span>
              </>
            ) : (
              <span className="tag">Item do mês</span>
            )}
          </div>
        </div>
      </div>
      <div className="pn-t">
        <span className={`due ${p.classe}`}>{p.texto}</span>
        <h3>{oQue(item, agora)}</h3>
        <p>{explicacao(item, agora)}</p>
      </div>
      {item.tipo === 'NOVA_INSCRICAO' && (
        <NovaInscricao item={item} responsaveis={responsaveis} escolher={escolherResponsavel} />
      )}
      <div className="pn-a">
        {acao}
        {item.inscricaoId && (
          <Link className="btn btn-secondary" href={ficha(item.inscricaoId)} prefetch={false}>
            Abrir ficha
          </Link>
        )}
      </div>
      {m && (momento || COM_WHATSAPP.includes(item.tipo)) && (
        <div className="pn-msg">
          <div className="pn-msg-h">
            <b>{texto ? 'Mensagem pronta' : 'WhatsApp'}</b>
            {modelo && <span>{modelo.nome}</span>}
          </div>
          {texto ? (
            <p>{texto}</p>
          ) : (
            momento && (
              <small>
                {admin
                  ? 'Sem mensagem-modelo para este momento. Escreva em Configurações.'
                  : 'Sem mensagem-modelo para este momento ainda.'}
              </small>
            )
          )}
          <WhatsappBotoes pessoas={m.pessoas} linkGrupo={m.linkGrupo} texto={texto} />
        </div>
      )}
      <dl className="pn-ctx">
        {ctx.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Nova inscrição" (NPAC-56): a responsável e o aviso de quem já é mentorado (M3). */
function NovaInscricao({
  item,
  responsaveis,
  escolher,
}: {
  item: FilaItemDTO;
  responsaveis: Responsavel[];
  escolher: (item: FilaItemDTO, responsavelId: string) => void;
}) {
  const [resp, setResp] = useState('');
  return (
    <div className="pn-nova">
      {item.jaTem && (
        <p className="pn-jatem">
          <Link href={ficha(item.jaTem.inscricaoId)} prefetch={false}>
            Já tem inscrição: {item.jaTem.mentoria},{' '}
            {INSCRICAO_STATUS_LABEL[item.jaTem.status].toLowerCase()}
          </Link>
        </p>
      )}
      <form
        className="pn-resp"
        onSubmit={(e) => {
          e.preventDefault();
          if (resp) escolher(item, resp);
        }}
      >
        <label htmlFor={`resp-${item.chave}`}>Responsável</label>
        <div className="pn-resp-row">
          <select
            id={`resp-${item.chave}`}
            className="field"
            value={resp}
            onChange={(e) => setResp(e.target.value)}
            required
          >
            <option value="">Escolha</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            Definir
          </button>
        </div>
      </form>
    </div>
  );
}
