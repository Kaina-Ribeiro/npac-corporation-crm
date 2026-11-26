import { BLOCO_LABEL, type Bloco, type TarefaStatus } from '@npac/shared/mentoria';

/**
 * Peças do cronograma do PME (NPAC-60) sem estado: ícone de cada bloco, título e link do EAP e a
 * etiqueta do resultado. Servem à janela de envio, ao card do PME e à aba da ficha.
 */
export const ICONE_BLOCO: Record<Bloco, string> = {
  EXPERIENCIA:
    'M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9zM19 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z',
  DESAFIO: 'M5 21V4m0 0h11l-1.6 4L16 12H5',
  FILME: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  LIVRO:
    'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  EAP: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.6l5 3.4-5 3.4z',
};
export const ICONE_BUSCA = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4';

/** Ícone de 16 px (ou 14 px com `pequeno`) de um bloco. */
export function IconeBloco({ bloco, pequeno = false }: { bloco: Bloco; pequeno?: boolean }) {
  return <IconeCr d={ICONE_BLOCO[bloco]} classe={pequeno ? 'cr-s' : 'cr-i'} />;
}

export function IconeCr({ d, classe = 'cr-s' }: { d: string; classe?: string }) {
  return (
    <svg
      className={classe}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const URL_NO_TEXTO = /\s*(https?:\/\/\S+)\s*$/i;

/** O EAP vem como "TÍTULO https://…": a tela mostra o título e o endereço à parte. */
export function partesItem(texto: string): { titulo: string; url: string | null; site: string } {
  const m = URL_NO_TEXTO.exec(texto);
  if (!m) return { titulo: texto, url: null, site: '' };
  let site = '';
  try {
    site = new URL(m[1]!).hostname.replace(/^www\./, '');
  } catch {
    return { titulo: texto, url: null, site: '' };
  }
  return { titulo: texto.slice(0, m.index).trim() || texto, url: m[1]!, site };
}

/** "EAP · youtube.com" (aba e card), com o endereço como link. */
export function DetalheItem({
  bloco,
  texto,
  prefixo,
}: {
  bloco: Bloco;
  texto: string;
  prefixo?: string;
}) {
  const { url, site } = partesItem(texto);
  const nome = prefixo ?? BLOCO_LABEL[bloco];
  if (!url) return <>{nome}</>;
  return (
    <>
      {nome} ·{' '}
      <a className="cr-link" href={url} target="_blank" rel="noopener noreferrer">
        {site}
      </a>
    </>
  );
}

const CLASSE_RESULTADO: Record<TarefaStatus, string> = {
  FEITA: 'ativo',
  NAO_FEITA: 'canc',
  PARCIAL: 'gold',
  PENDENTE: '',
};
const ROTULO_RESULTADO: Record<TarefaStatus, string> = {
  FEITA: 'Feita',
  NAO_FEITA: 'Não feita',
  PARCIAL: 'Parcial',
  PENDENTE: 'Pendente',
};
export function TagResultado({ status }: { status: TarefaStatus }) {
  return (
    <span className={`tag ${CLASSE_RESULTADO[status]}`.trim()}>{ROTULO_RESULTADO[status]}</span>
  );
}
