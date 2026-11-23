'use client';
import {
  DATA_MAX,
  DATA_MIN,
  type ConquistaDTO,
  LIMITE_DESCRICAO_CONQUISTA,
} from '@npac/shared/mentoria';
import { useState } from 'react';
import { control, quietButton } from '@/components/crm-ui';
import { showToast } from '@/components/toast';
import { avisar } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';
import { enviarFoto } from './midia';
import { dataBR, diaBR } from './ui';

const MIDIAS = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

function Midia({ c }: { c: ConquistaDTO }) {
  if (!c.midia) return <div className="img vazia">Sem foto</div>;
  const src = `/api/mentoria/midia/${c.midia.id}`;
  if (c.midia.tipo === 'VIDEO')
    return (
      <div className="img">
        <video
          src={src}
          controls
          preload="metadata"
          aria-label={c.descricao ?? 'Vídeo da conquista'}
        />
      </div>
    );
  // Clicar abre a foto em tamanho maior (spec §5.6).
  return (
    <a className="img" href={src} target="_blank" rel="noopener">
      <img src={src} alt={c.descricao ?? 'Foto da conquista'} />
    </a>
  );
}

/** Janelinha "Adicionar conquista": mídia obrigatória, data com hoje sugerido, descrição. */
function Adicionar({
  inscricaoId,
  onFeito,
  onFechar,
}: {
  inscricaoId: string;
  onFeito: () => Promise<void>;
  onFechar: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [data, setData] = useState(() => diaBR(new Date().toISOString()));
  const [descricao, setDescricao] = useState('');
  return (
    <Dialogo
      titulo="Adicionar conquista"
      rotulo="Adicionar"
      podeConfirmar={arquivo !== null}
      onConfirmar={async () => {
        if (!arquivo) return;
        const c = await clientApi<ConquistaDTO>(
          `/api/mentoria/inscricoes/${inscricaoId}/conquistas`,
          'POST',
          { data: data || null, descricao: descricao.trim() || null },
        );
        try {
          await enviarFoto('conquista', c.id, arquivo);
        } catch (e) {
          // Sem a mídia a conquista nova não fica (mídia obrigatória).
          await clientApi(`/api/mentoria/conquistas/${c.id}`, 'DELETE').catch(() => undefined);
          throw e;
        }
        await onFeito();
        showToast();
      }}
      onFechar={onFechar}
    >
      <label className="f">
        <span>Foto ou vídeo</span>
        <input
          className={control}
          type="file"
          accept={MIDIAS}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="f">
        <span>Data</span>
        <input
          className={control}
          type="date"
          min={DATA_MIN}
          max={DATA_MAX}
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </label>
      <label className="f">
        <span>Descrição</span>
        <textarea
          className={control}
          rows={3}
          maxLength={LIMITE_DESCRICAO_CONQUISTA}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </label>
    </Dialogo>
  );
}

/** Conquistas (spec §5.6): da mais antiga à mais recente, sem data por último. */
export function Conquistas({
  inscricaoId,
  conquistas,
  edita,
  recarregar,
}: {
  inscricaoId: string;
  conquistas: ConquistaDTO[];
  edita: boolean;
  recarregar: () => Promise<void>;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const n = conquistas.length;

  async function remover(c: ConquistaDTO) {
    if (!confirm('Remover essa conquista?')) return;
    try {
      await clientApi(`/api/mentoria/conquistas/${c.id}`, 'DELETE');
      await recarregar();
      showToast();
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  return (
    <div>
      <div className="sec-h">
        <span className="sec-t">Conquistas</span>
        {n > 0 && <small>{n} · da mais antiga à mais recente</small>}
      </div>
      <div className="gal">
        {conquistas.map((c) => (
          <div key={c.id} className="cq">
            <Midia c={c} />
            <div className="tx2">
              {c.data && <time dateTime={c.data}>{dataBR(c.data)}</time>}
              {c.descricao && <b>{c.descricao}</b>}
              {edita && (
                <button
                  type="button"
                  className={`${quietButton} sm cq-rem`}
                  onClick={() => void remover(c)}
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        ))}
        {n === 0 && <p className="gal-vazia">Nenhuma conquista ainda.</p>}
        {edita && (
          <button type="button" className="cq-add" onClick={() => setAdicionando(true)}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Adicionar conquista
          </button>
        )}
      </div>
      {adicionando && (
        <Adicionar
          inscricaoId={inscricaoId}
          onFeito={recarregar}
          onFechar={() => setAdicionando(false)}
        />
      )}
    </div>
  );
}
