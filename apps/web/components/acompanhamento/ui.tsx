import { INSCRICAO_STATUS_LABEL, type InscricaoStatus } from '@npac/shared/mentoria';

/** Peças visuais do módulo, sem estado: servem a telas de servidor e de cliente. */

export const ICONES = {
  fila: 'M4 6h16M4 12h16M4 18h10',
  mentorados:
    'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  ficha: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7',
  onboarding: 'M4 5h16l-6 7v6l-4 2v-8z',
  plano: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  reunioes: 'M3 7h13v10H3zM16 11l5-3v8l-5-3',
  pmes: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  linha: 'M4 6h16M4 12h10M4 18h7',
  envios: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  eventos: 'M5 4h14v17H5zM5 9h14',
  renovacoes: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v3M12 18v3M3 12h3M18 12h3',
  sino: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  whatsapp: 'M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z',
  seta: 'M9 6l6 6-6 6',
  voltar: 'M15 18l-6-6 6-6',
  abaixo: 'M6 9l6 6 6-6',
  cadeado: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  mais: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
} as const;

export function Icone({
  d,
  className,
  largura = 1.8,
}: {
  d: string;
  className?: string;
  largura?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={largura}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

export type Aba = 'jornada' | 'inscricao' | 'pessoas' | 'momento' | 'historico';
const ABAS: Aba[] = ['jornada', 'inscricao', 'pessoas', 'momento', 'historico'];
/** Aba da ficha pedida na URL; fica aqui porque a página de servidor a lê. */
export const abaValida = (a: string | undefined): Aba =>
  ABAS.includes(a as Aba) ? (a as Aba) : 'jornada';

/** Foco de cada mês do RDV (PDF): 2M e 6M não têm nome por mês. */
export const FOCOS_RDV = [
  'Adaptação',
  'Conexão',
  'Momento mágico',
  'Evolução',
  'Posicionamento',
  'Inspiração',
  'Cartões e milhas',
  'Evolução financeira',
  'Villa NPAC',
  'Jornada',
  'Família',
  'Renovação',
];

export const CLASSE_STATUS: Record<InscricaoStatus, string> = {
  ONBOARDING: 'onb',
  ATIVO: 'ativo',
  PAUSADO: 'pausa',
  CANCELADO: 'canc',
  CONCLUIDO: '',
  RENOVADO: 'gold',
};

export function TagStatus({
  status,
  className = '',
}: {
  status: InscricaoStatus;
  className?: string;
}) {
  return (
    <span className={`tag ${CLASSE_STATUS[status]} ${className}`}>
      {INSCRICAO_STATUS_LABEL[status]}
    </span>
  );
}

/** A trilha de 12 meses. `alerta` pinta o mês atual de vermelho (ficha por completar). */
export function Trilha({ mes, alerta = false }: { mes: number | null; alerta?: boolean }) {
  return (
    <span className="trail">
      {Array.from({ length: 12 }, (_, k) => {
        const m = k + 1;
        const atual = mes !== null && m === mes;
        const feito = mes !== null && m < mes;
        return <i key={m} className={feito ? 'f' : atual ? (alerta ? 'l' : 'c') : ''} />;
      })}
    </span>
  );
}

const corDe = (nome: string) => {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h % 7;
};

const inicial = (nome: string) => nome.trim().slice(0, 1).toUpperCase();

export type Rosto = { nome: string; fotoMidiaId: string | null };

/** Foto ou inicial; duas sobrepostas no casal. */
export function Rostos({ pessoas }: { pessoas: Rosto[] }) {
  return (
    <span className={pessoas.length > 1 ? 'pair' : 'solo'} aria-hidden="true">
      {pessoas.map((p, i) => (
        <span key={i} className={`ava g${corDe(p.nome)}${i ? ' b' : ''}`}>
          {p.fotoMidiaId ? (
            // Stream autenticado da API: <img> simples, sem o otimizador do Next.
            <img src={`/api/mentoria/midia/${p.fotoMidiaId}`} alt="" />
          ) : (
            inicial(p.nome)
          )}
        </span>
      ))}
    </span>
  );
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`, sem passar por fuso. */
export const dataBR = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';

/** Rótulo do mês da jornada na lista e na ficha. */
export function rotuloMes(mes: number | null) {
  if (mes === null) return 'Antes da IDR';
  return mes > 12 ? 'Jornada concluída' : `Mês ${mes}`;
}
