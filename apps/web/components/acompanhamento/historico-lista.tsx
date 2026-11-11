'use client';
import { ETAPA_LABEL, type FichaDTO, type HistoricoItem } from '@npac/shared/mentoria';
import { useCallback, useEffect, useState } from 'react';
import { control, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';
import { ICONES, Icone } from './ui';

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
};

const DIA = 86_400_000;

function quando(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / DIA);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

type Filtro = 'TUDO' | 'ANOTACOES' | 'ALTERACOES';
const FILTROS: [Filtro, string][] = [
  ['TUDO', 'Tudo'],
  ['ANOTACOES', 'Anotações'],
  ['ALTERACOES', 'Alterações'],
];

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
        {!anotacao && e.campos.length > 0 && (
          <p>Campos: {e.campos.map((c) => CAMPOS[c] ?? c).join(', ')}.</p>
        )}
        <time dateTime={e.quando}>{quando(e.quando)}</time>
      </div>
    </div>
  );
}

/** Aba Histórico: alterações (só nomes de campos) e anotações. */
export function HistoricoLista({ ficha }: { ficha: FichaDTO }) {
  const [itens, setItens] = useState<HistoricoItem[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TUDO');
  const [anotando, setAnotando] = useState(false);
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

  const visiveis = (itens ?? []).filter((e) =>
    filtro === 'TUDO'
      ? true
      : filtro === 'ANOTACOES'
        ? e.tipo === 'anotacao'
        : e.tipo !== 'anotacao',
  );

  return (
    <section className="card pa" role="tabpanel" aria-label="Histórico">
      <div className="hh">
        <div className="hf">
          {FILTROS.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              className={filtro === id ? 'on' : ''}
              onClick={() => setFiltro(id)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {ficha.pode.anotacao && (
          <button type="button" className={`${quietButton} sm`} onClick={() => setAnotando(true)}>
            Nova anotação
          </button>
        )}
      </div>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {erro}
        </p>
      )}
      {itens && visiveis.length === 0 && <p className="hist-vazio">Nada por aqui ainda.</p>}
      {visiveis.map((e) => (
        <Evento key={e.id} e={e} />
      ))}
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
