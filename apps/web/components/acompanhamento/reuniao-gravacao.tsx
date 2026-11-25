import { AVISO_GRAVACAO, idDoDrive, previewDoDrive } from '@npac/shared/mentoria';
import { CampoPr, type Conversao } from './campo';

/** Só link de arquivo do Drive vai para a API; o resto avisa no campo (NPAC-78). */
const GRAVACAO: Conversao = {
  deTexto: (t) => {
    if (!t.trim()) return null;
    if (!idDoDrive(t)) throw new Error(AVISO_GRAVACAO);
    return t.trim();
  },
};

/**
 * Gravação da reunião realizada: o link do Google Drive e o vídeo tocando aqui (prévia do Drive).
 * Quem não edita só vê o player, e nada quando não há link.
 */
export function ReuniaoGravacao({
  chave,
  link,
  editavel,
  aoSalvar,
}: {
  chave: string;
  link: string | null;
  editavel: boolean;
  aoSalvar: () => void;
}) {
  const id = link ? idDoDrive(link) : null;
  if (!editavel && !id) return null;
  return (
    <section className="card pa rn-agenda rn-gravacao">
      <h3>Gravação</h3>
      {editavel && (
        <CampoPr
          chave={chave}
          rotulo="Link da gravação (Google Drive)"
          campo="gravacao"
          valor={link}
          editavel
          inputMode="url"
          placeholder="https://drive.google.com/file/d/…"
          conversao={GRAVACAO}
          aoSalvar={aoSalvar}
        />
      )}
      {id && link && (
        <>
          <div className="rn-player">
            <iframe
              src={previewDoDrive(id)}
              title="Gravação da reunião"
              allow="autoplay; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
          <a className="rn-abrir" href={link} target="_blank" rel="noopener noreferrer">
            Abrir no Drive
          </a>
        </>
      )}
      <p className="rn-legenda">Quem for assistir precisa ter acesso ao arquivo no Drive.</p>
    </section>
  );
}
