/**
 * Versão no rodapé e novidades para a equipe (NPAC-77, spec
 * `docs/superpowers/specs/2026-11-25-npac-77-versao-e-novidades-design.md`). Sem zod: lido no
 * cliente (`@npac/shared/novidades`).
 *
 * Como escrever uma entrada: o PR com mudança que a equipe vê acrescenta uma entrada no **topo** de
 * `NOVIDADES` (a mais nova primeiro), em português simples, sem nome de cliente, e-mail ou
 * telefone. `id` único e estável (nunca reaproveite nem renomeie: é o "já vi" das contas). PR só com
 * mudança interna não mexe aqui (a janela não abre, só o número do rodapé muda).
 */
import type { Area } from './cargos.js';

/** Quem vê. A Diretoria vê tudo. */
export type Publico =
  | 'todos'
  /** Quem tem o comercial (vínculo na área COMERCIAL). */
  | 'comercial'
  /** SDR e liderança do comercial (Head). */
  | 'sdr'
  /** Closer e liderança do comercial (Head). */
  | 'closer'
  /** Quem abre o Acompanhamento (vínculo na área). */
  | 'acompanhamento'
  /** Admin do Acompanhamento (selo). */
  | 'acompanhamento-admin';

export type TipoNovidade = 'novo' | 'melhorou' | 'corrigido' | 'acao';

export type IconeNovidade =
  | 'versao'
  | 'chart'
  | 'tag'
  | 'phone'
  | 'send'
  | 'list'
  | 'chat'
  | 'bell'
  | 'cash'
  | 'check'
  | 'trash'
  | 'bolt'
  | 'tablet'
  | 'calendar'
  | 'search'
  | 'filter'
  | 'user'
  | 'growth'
  | 'box';

export type Novidade = {
  /** Único e estável: é o que fica gravado em `user.novidades_vista`. */
  id: string;
  /** Dia da atualização (AAAA-MM-DD, Brasília). A janela agrupa por data (S1). */
  data: string;
  para: readonly Publico[];
  /** Recorte dentro do módulo: só esses perfis do Acompanhamento (a Diretoria vê mesmo assim). */
  perfis?: readonly string[];
  /** Recorte dentro do comercial: só esses cargos (SDR, CLOSER, HEAD). */
  cargos?: readonly string[];
  tipo: TipoNovidade;
  icone: IconeNovidade;
  titulo: string;
  texto: string;
  /** Onde fica na tela, em palavras ("Acompanhamento → Dashboard"). */
  onde: string;
  /** Link interno (começa com "/"), quando há uma tela só para abrir. */
  href?: string;
};

/** Quem está olhando: o que vem em `/api/me` (`mestre` + vínculos por área). */
export type PessoaNovidades = {
  mestre: boolean;
  areas: readonly { area: Area; cargo: string | null; head: boolean }[];
};

/** A mais nova primeiro. */
export const NOVIDADES: readonly Novidade[] = [
  {
    id: 'npac-78-gravacao',
    data: '2026-11-25',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'],
    tipo: 'novo',
    icone: 'calendar',
    titulo: 'Gravação da reunião',
    texto:
      'Na reunião realizada, cole o link da gravação no Google Drive. O vídeo passa a tocar ali mesmo, com “Abrir no Drive” embaixo. Quem for assistir precisa ter acesso ao arquivo no Drive.',
    onde: 'Acompanhamento → Reuniões → abra a reunião',
    href: '/acompanhamento/reunioes',
  },
  {
    id: 'npac-77-versao',
    data: '2026-11-25',
    para: ['todos'],
    tipo: 'novo',
    icone: 'versao',
    titulo: 'Versão do CRM e “O que mudou”',
    texto:
      'No rodapé da barra lateral (no celular, em Mais) aparece a versão do CRM que está no ar. Em “O que mudou” você revê as novidades quando quiser. O ponto dourado avisa que tem novidade que você ainda não viu.',
    onde: 'Barra lateral → rodapé',
  },
  {
    id: 'npac-75-dashboard',
    data: '2026-11-25',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO'],
    tipo: 'novo',
    icone: 'chart',
    titulo: 'Onboarding agora é Dashboard, com engajamento',
    texto:
      'No topo: total de mentorados e quantos estão Engajados, Em atenção, Em risco ou Sem marcação, com a % e os nomes de cada grupo (toque no grupo para abrir). O funil das 6 etapas do onboarding continua logo embaixo.',
    onde: 'Acompanhamento → Dashboard',
    href: '/acompanhamento/onboarding',
  },
  {
    id: 'npac-75-engajamento-ficha',
    data: '2026-11-25',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO'],
    tipo: 'novo',
    icone: 'tag',
    titulo: 'Engajamento na ficha',
    texto:
      'Depois do Status, o campo Engajamento: Engajado, Em atenção, Em risco ou Sem marcação. Salva ao escolher e vira etiqueta no topo da ficha. Todos começam sem marcação.',
    onde: 'Ficha do mentorado → Inscrição',
  },
  {
    id: 'npac-75-barra-celular',
    data: '2026-11-25',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO'],
    tipo: 'melhorou',
    icone: 'phone',
    titulo: 'Barra do celular começa pelo Dashboard',
    texto: 'Agora: Dashboard · Mentorados · + · Reuniões · Fila · Mais. Nenhum atalho saiu.',
    onde: 'Barra de baixo do celular',
  },
  {
    id: 'npac-74-telegram',
    data: '2026-11-25',
    para: ['todos'],
    tipo: 'novo',
    icone: 'send',
    titulo: 'Avisos pelo Telegram',
    texto:
      'Toque em “Conectar Telegram”, depois em “Começar” no bot, e pronto. Os mesmos avisos do celular (lembrete de reunião, sino, Chat, Fila) chegam também no Telegram. Dá para desconectar quando quiser.',
    onde: 'Meu perfil → Avisos pelo Telegram',
    href: '/conta/perfil',
  },
  {
    id: 'npac-76-diagnostico',
    data: '2026-11-25',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'],
    tipo: 'melhorou',
    icone: 'list',
    titulo: 'Diagnóstico na aba Pessoas',
    texto:
      'As 20 perguntas da planilha de diagnóstico, na mesma ordem, com até 3 dívidas e o valor de cada (o total soma sozinho). Embaixo, contato e entrega: WhatsApp, e-mail, pulseira, endereço e foto da família. A aba Momento inicial saiu; nada foi apagado.',
    onde: 'Ficha do mentorado → Pessoas',
  },
  {
    id: 'npac-73-chat-envio',
    data: '2026-11-24',
    para: ['comercial'],
    tipo: 'corrigido',
    icone: 'chat',
    titulo: 'Chat: mensagem não pisca ao enviar',
    texto:
      'A mensagem enviada não some e volta mais. No iPhone, deslizar para voltar fecha a conversa e volta para a lista, em vez de sair do Chat.',
    onde: 'Chat',
    href: '/chat',
  },
  {
    id: 'npac-71-ativar-avisos',
    data: '2026-11-24',
    para: ['todos'],
    tipo: 'acao',
    icone: 'bell',
    titulo: 'Ative os avisos de novo neste aparelho',
    texto:
      'Os avisos do iPhone atrasavam ou sumiam. Consertamos e, para começar do zero, desligamos todos os aparelhos. Toque em “Ativar avisos” no convite que aparece no topo da tela.',
    onde: 'Meu perfil → Avisos neste aparelho',
    href: '/conta/perfil',
  },
  {
    id: 'npac-73-chat-novo',
    data: '2026-11-24',
    para: ['comercial'],
    tipo: 'novo',
    icone: 'chat',
    titulo: 'Chat de cara nova',
    texto:
      'Balões como no iMessage, separação por dia (Hoje, Ontem), prévia da última mensagem na lista e mensagens antigas que carregam ao rolar para cima. “Nova conversa” busca a pessoa pelo nome. Lead citado vira um cartão “Abrir ficha”.',
    onde: 'Chat',
    href: '/chat',
  },
  {
    id: 'npac-72-chat-celular',
    data: '2026-11-24',
    para: ['comercial'],
    tipo: 'corrigido',
    icone: 'phone',
    titulo: 'Chat no celular abre com as mensagens',
    texto:
      'A conversa às vezes abria vazia e as não lidas sumiam sozinhas. Agora abre com as mensagens e só marca como lida o que você viu.',
    onde: 'Chat',
    href: '/chat',
  },
  {
    id: 'npac-70-excluir-registro',
    data: '2026-11-24',
    para: ['acompanhamento-admin'],
    tipo: 'novo',
    icone: 'trash',
    titulo: 'Excluir contato e anotação',
    texto:
      'Na aba Histórico, cada contato e anotação tem “Excluir”, com confirmação. Só a Admin vê o botão. O histórico guarda “Anotação excluída por …”, sem o texto.',
    onde: 'Ficha do mentorado → Histórico',
  },
  {
    id: 'npac-69-listas-rapidas',
    data: '2026-11-24',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'],
    tipo: 'melhorou',
    icone: 'bolt',
    titulo: 'Onboarding e Mentorados mais rápidos',
    texto:
      'O painel do Onboarding e os filtros de mês e semáforo em Mentorados abrem em menos de 0,1 segundo (antes, até meio segundo).',
    onde: 'Acompanhamento → Mentorados',
    href: '/acompanhamento/mentorados',
  },
  {
    id: 'npac-73-tablet',
    data: '2026-11-24',
    para: ['todos'],
    tipo: 'melhorou',
    icone: 'tablet',
    titulo: 'Tablet em pé: barra lateral em ícones',
    texto:
      'Entre 768 e 1023 px a barra lateral fica recolhida, só com os ícones. Um toque abre; escolher a tela recolhe de novo.',
    onde: 'Barra lateral',
  },
  {
    id: 'npac-65-venda-direta',
    data: '2026-11-23',
    para: ['sdr'],
    cargos: ['SDR'],
    tipo: 'novo',
    icone: 'cash',
    titulo: 'Venda direta',
    texto:
      'Vendeu sem reunião, à vista, no cartão ou no boleto? Use “Venda direta” ao lado de “Mover para”: escolha o closer e o produto. A renda extra entra para você; o closer põe o valor.',
    onde: 'Ficha do lead',
  },
  {
    id: 'npac-68-sdr-marca-venda',
    data: '2026-11-23',
    para: ['sdr'],
    cargos: ['SDR'],
    tipo: 'novo',
    icone: 'check',
    titulo: 'Você marca a venda de quem pagou',
    texto:
      'Em Agendou Pagamento, “Marcar venda” fica ao lado de “Mover para”, já com o produto. Sem esperar o closer.',
    onde: 'Ficha do lead → Agendou Pagamento',
  },
  {
    id: 'npac-68-closer-vendas',
    data: '2026-11-23',
    para: ['closer'],
    tipo: 'novo',
    icone: 'cash',
    titulo: 'Vendas que o SDR marcou chegam para você',
    texto:
      'Venda direta ou marcada em Agendou Pagamento vira “Venda a registrar” com o seu nome: você recebe o aviso e põe o valor na ficha. Venda direta é só à vista, cartão ou boleto.',
    onde: 'Hoje → Vendas a registrar',
    href: '/hoje',
  },
  {
    id: 'npac-67-concluir-tarefa',
    data: '2026-11-23',
    para: ['sdr'],
    tipo: 'novo',
    icone: 'check',
    titulo: 'Concluir tarefa pede o próximo passo',
    texto:
      'Ao concluir, conte o que aconteceu e escolha: Agendou reunião, Novo follow-up ou Ligar para a pessoa. O lead já anda sozinho para a etapa certa.',
    onde: 'Hoje e ficha do lead → Tarefas',
    href: '/hoje',
  },
  {
    id: 'npac-65-reuniao-na-etapa',
    data: '2026-11-23',
    para: ['sdr'],
    tipo: 'melhorou',
    icone: 'calendar',
    titulo: 'Agendou Pagamento com a reunião que já aconteceu',
    texto:
      'Sem reunião realizada? Informe ali mesmo quando foi e com qual closer, ao mover ou ao cadastrar.',
    onde: 'Pipeline, lista e ficha do lead',
    href: '/pipeline',
  },
  {
    id: 'npac-63-busca-digitando',
    data: '2026-11-23',
    para: ['comercial'],
    tipo: 'melhorou',
    icone: 'search',
    titulo: 'Busca enquanto você digita',
    texto:
      'Leads e Pipeline buscam enquanto você digita, sem Enter. Apagar o texto traz a lista de volta. Telefone e e-mail continuam só completos.',
    onde: 'Leads e Pipeline',
    href: '/leads',
  },
  {
    id: 'npac-64-coluna-oculta',
    data: '2026-11-23',
    para: ['comercial'],
    tipo: 'corrigido',
    icone: 'search',
    titulo: 'Pipeline acha leads em coluna oculta',
    texto: 'Com texto buscado, a coluna oculta que tem resultado aparece, marcada “Oculta”.',
    onde: 'Pipeline',
    href: '/pipeline',
  },
  {
    id: 'npac-66-filtro-sdr',
    data: '2026-11-23',
    para: ['sdr'],
    cargos: ['SDR'],
    tipo: 'melhorou',
    icone: 'filter',
    titulo: 'Filtro de SDR fica no seu nome',
    texto: 'Em Relatórios, Leads e Pipeline, o filtro de SDR mostra só você.',
    onde: 'Relatórios, Leads e Pipeline',
    href: '/relatorios',
  },
  {
    id: 'npac-56-venda-vira-mentorado',
    data: '2026-11-23',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO'],
    tipo: 'novo',
    icone: 'user',
    titulo: 'Venda vira mentorado sozinha',
    texto:
      'Venda de RDV, 2M ou 6M no comercial cria o mentorado em Onboarding, com nome e contato. Ele aparece na Fila da Admin para escolher a responsável. Estorno da venda cancela a inscrição.',
    onde: 'Acompanhamento → Fila',
    href: '/acompanhamento/fila',
  },
  {
    id: 'npac-57-evolucao',
    data: '2026-11-23',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO'],
    tipo: 'novo',
    icone: 'growth',
    titulo: 'Aba Evolução',
    texto:
      'Antes → hoje em cartões, Momento inicial × Momento atual com foto, os 4 pilares e as conquistas. “Baixar PDF” gera o relatório para entregar.',
    onde: 'Ficha do mentorado → Evolução',
  },
  {
    id: 'npac-56-envios',
    data: '2026-11-23',
    para: ['acompanhamento'],
    perfis: ['ACOMPANHAMENTO', 'OPERACAO', 'ENVIOS'],
    tipo: 'novo',
    icone: 'box',
    titulo: 'Envios físicos',
    texto:
      'Caixa, presente da família, kit e certificado numa lista só, do pedido à entrega. A Caixa entregue conclui a etapa do onboarding sozinha.',
    onde: 'Acompanhamento → Envios',
    href: '/acompanhamento/envios',
  },
  {
    id: 'npac-62-reuniao-realizada',
    data: '2026-11-23',
    para: ['sdr'],
    tipo: 'novo',
    icone: 'calendar',
    titulo: 'Lançar reunião que já aconteceu',
    texto:
      '“A reunião já aconteceu” na ficha registra uma reunião passada. O valor por reunião conta no dia em que ela aconteceu.',
    onde: 'Ficha do lead → Reuniões',
  },
  {
    id: 'npac-59-pagamento-depois-reuniao',
    data: '2026-11-23',
    para: ['comercial'],
    tipo: 'melhorou',
    icone: 'calendar',
    titulo: 'Agendou Pagamento só depois da reunião',
    texto:
      'Para pôr em Agendou Pagamento, a reunião precisa estar marcada como realizada. Ordem: cadastrou → reunião → realizada → agendou pagamento → pagou.',
    onde: 'Pipeline e ficha do lead',
    href: '/pipeline',
  },
  {
    id: 'npac-59-renda-extra',
    data: '2026-11-23',
    para: ['sdr'],
    cargos: ['SDR'],
    tipo: 'corrigido',
    icone: 'cash',
    titulo: 'Renda extra da venda de Agendou Pagamento',
    texto:
      'A venda registrada a partir de Agendou Pagamento passa a contar como venda sua, com a renda extra do produto (vendas desde 17/11 foram acertadas).',
    onde: 'Dashboard → Valor a receber por venda feita',
    href: '/dashboard',
  },
];

/** A mais nova: o que uma conta nova (ou coluna vazia) grava como "já vi" (S2). */
export const ULTIMA_NOVIDADE: string = NOVIDADES[0]!.id;

const POSICAO = new Map(NOVIDADES.map((n, i) => [n.id, i]));

/** O id existe no arquivo. */
export const novidadeExiste = (id: string): boolean => POSICAO.has(id);

/**
 * Número da versão na tela (D1): a tag no ar sem o "v" e sem `-rc`, `-hf`, `-hf-rc` ou `-rc.N`
 * (a produção roda a última rc, que tem o mesmo número da final). Sem tag (local, e2e) ou fora do
 * formato: "dev".
 */
export function versaoNaTela(tag: string | null | undefined): string {
  const m = /^v?(\d+\.\d+\.\d+)(?:-(?:hf-rc|hf|rc(?:\.\d+)?))?$/.exec((tag ?? '').trim());
  return m ? m[1]! : 'dev';
}

/** A pessoa vê a entrada. A Diretoria vê tudo. */
export function novidadeVisivel(n: Novidade, p: PessoaNovidades): boolean {
  if (p.mestre) return true;
  const comercial = p.areas.find((a) => a.area === 'COMERCIAL');
  const acomp = p.areas.find((a) => a.area === 'ACOMPANHAMENTO');
  const lider = comercial?.cargo === 'HEAD';
  const publico = n.para.some((x) => {
    switch (x) {
      case 'todos':
        return true;
      case 'comercial':
        return !!comercial;
      case 'sdr':
        return comercial?.cargo === 'SDR' || lider;
      case 'closer':
        return comercial?.cargo === 'CLOSER' || lider;
      case 'acompanhamento':
        return !!acomp;
      case 'acompanhamento-admin':
        return !!acomp?.head;
    }
  });
  if (!publico) return false;
  if (n.cargos && !(comercial?.cargo && n.cargos.includes(comercial.cargo))) return false;
  if (n.perfis && !(acomp?.cargo && n.perfis.includes(acomp.cargo))) return false;
  return true;
}

/** Todas as entradas que a pessoa vê, a mais nova primeiro (histórico do "O que mudou"). */
export const novidadesPara = (p: PessoaNovidades, lista: readonly Novidade[] = NOVIDADES) =>
  lista.filter((n) => novidadeVisivel(n, p));

/**
 * O que a pessoa ainda não viu: as entradas visíveis acima de `vista` (id da mais nova que ela
 * viu). Sem `vista` ou id que saiu do arquivo: nada (não despeja o histórico, S2).
 */
export function naoVistas(
  p: PessoaNovidades,
  vista: string | null | undefined,
  lista: readonly Novidade[] = NOVIDADES,
): Novidade[] {
  if (!vista) return [];
  const ate = lista.findIndex((n) => n.id === vista);
  if (ate < 0) return [];
  return lista.slice(0, ate).filter((n) => novidadeVisivel(n, p));
}

/**
 * Marcar "já vi até `ate`" só avança: `ate` precisa existir e ser mais nova que `atual`. Sem
 * `atual` ou com um id que saiu do arquivo, qualquer id existente vale.
 */
export function vistaAvanca(atual: string | null | undefined, ate: string): boolean {
  const novo = POSICAO.get(ate);
  if (novo === undefined) return false;
  const antes = atual ? POSICAO.get(atual) : undefined;
  return antes === undefined || novo < antes;
}
