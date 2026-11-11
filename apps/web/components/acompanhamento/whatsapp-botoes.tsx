'use client';
import { chamar, linkGrupoValido, linkWhatsApp, type FilaPessoa } from '@npac/shared/mentoria';
import { ICONES, Icone } from './ui';

/** Copia sem esperar: o navegador abre a conversa no mesmo clique. Falha só some em silêncio. */
function copiar(texto: string | null) {
  if (!texto) return;
  void navigator.clipboard?.writeText(texto).catch(() => {});
}

/**
 * WhatsApp (§6, D9): "Grupo" abre o convite do grupo individual; um botão por pessoa abre
 * `wa.me/<número>` sem texto. Os dois copiam antes a mensagem pronta. Quem não tem número não
 * ganha botão, e sem link do grupo não há "Grupo" (Review Focus 4).
 */
export function WhatsappBotoes({
  pessoas,
  linkGrupo,
  texto,
  notas = true,
}: {
  pessoas: FilaPessoa[];
  linkGrupo: string | null;
  texto: string | null;
  notas?: boolean;
}) {
  const grupo = linkGrupoValido(linkGrupo);
  const comNumero = pessoas
    .map((p) => ({ p, link: linkWhatsApp(p.whatsapp) }))
    .filter((x): x is { p: FilaPessoa; link: string } => !!x.link);
  const semNumero = pessoas.filter((p) => !linkWhatsApp(p.whatsapp));
  const dica = texto ? 'Copia a mensagem e abre' : 'Abre';
  return (
    <>
      {(grupo || comNumero.length > 0) && (
        <div className="pn-wa">
          {grupo && (
            <a
              className="btn btn-secondary sm wa"
              href={grupo}
              target="_blank"
              rel="noopener noreferrer"
              title={`${dica} o grupo`}
              onClick={() => copiar(texto)}
            >
              <Icone d={ICONES.mentorados} />
              Grupo
            </a>
          )}
          {comNumero.map(({ p, link }) => (
            <a
              key={link}
              className="btn btn-secondary sm wa"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              title={`${dica} a conversa com ${chamar(p)}`}
              onClick={() => copiar(texto)}
            >
              <Icone d={ICONES.whatsapp} />
              {chamar(p)}
            </a>
          ))}
        </div>
      )}
      {notas && (
        <>
          {(grupo || comNumero.length > 0) && (
            <small>
              {texto
                ? 'Cada botão copia o texto e abre a conversa.'
                : 'Cada botão abre a conversa.'}
            </small>
          )}
          {semNumero.map((p) => (
            <small key={p.nome}>{chamar(p)} não tem WhatsApp cadastrado.</small>
          ))}
          {!grupo && (
            <small>O botão Grupo aparece depois que o link do grupo for salvo na ficha.</small>
          )}
        </>
      )}
    </>
  );
}
