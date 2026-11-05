'use client';
import type { MidiaDTO } from '@npac/shared/mentoria';
import { useId, useState } from 'react';

export type DonoUrl =
  'ficha-antes' | 'ficha-depois' | 'conquista' | 'rdv-pessoa' | 'rdv-evento' | 'rdv-quadro';

const LIMITE = 20 * 1024 * 1024;

/** Envia um arquivo (até 20 MB); o servidor decide o tipo pela assinatura. */
export async function enviarMidia(dono: DonoUrl, donoId: string, arquivo: File): Promise<MidiaDTO> {
  if (arquivo.size > LIMITE) throw new Error('Arquivo acima de 20 MB.');
  const corpo = new FormData();
  corpo.append('arquivo', arquivo);
  const res = await fetch(`/api/mentoria/${dono}/${donoId}/midia`, { method: 'POST', body: corpo });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    id?: string;
    tipo?: MidiaDTO['tipo'];
    tamanhoBytes?: number;
  };
  if (!res.ok)
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Não foi possível enviar o arquivo.',
    );
  return {
    id: data.id!,
    donoTipo: dono,
    donoId,
    tipo: data.tipo!,
    urlVideo: null,
    mime: arquivo.type || null,
    tamanhoBytes: data.tamanhoBytes ?? arquivo.size,
  };
}

/** "×" de mídia anexada: remove na hora, sem confirmar (exceção da regra 6). */
export async function removerMidia(id: string): Promise<void> {
  const res = await fetch(`/api/mentoria/midia/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('Não foi possível remover agora.');
}

/** Mostra a mídia: foto como imagem; vídeo, PDF e link como cartão com link. */
export function MidiaCartao({
  m,
  rotulo,
  altura = 'h-44',
  onRemover,
}: {
  m: MidiaDTO;
  rotulo: string;
  /** Altura da foto (classe Tailwind); miniaturas da ficha usam menos. */
  altura?: string;
  onRemover: () => void;
}) {
  const src = `/api/mentoria/midia/${m.id}`;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-black/[0.03] dark:bg-white/[0.04]">
      {m.tipo === 'FOTO' ? (
        // Stream autenticado da API: <img> simples, sem o otimizador do Next.
        <img src={src} alt={rotulo} className={`${altura} w-full object-cover`} />
      ) : (
        <a
          href={m.tipo === 'LINK_VIDEO' ? (m.urlVideo ?? '#') : src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-28 flex-col items-center justify-center gap-1 px-3 text-center text-sm font-semibold text-ink2 hover:text-ink"
        >
          {m.tipo === 'VIDEO' ? 'Vídeo' : m.tipo === 'PDF' ? 'PDF' : 'Vídeo por link'}
          <small className="max-w-full truncate text-xs font-normal">
            {m.tipo === 'LINK_VIDEO' ? m.urlVideo : 'Abrir arquivo'}
          </small>
        </a>
      )}
      <button
        type="button"
        onClick={onRemover}
        aria-label={`Remover ${rotulo}`}
        title="Remove na hora, sem confirmar"
        className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-full bg-black/55 text-white shadow hover:bg-black/70 active:scale-90"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Campo de envio (foto, vídeo ou PDF), com o rótulo como nome acessível. */
export function EnviarArquivo({
  rotulo,
  aceita = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf',
  altura = 'h-32',
  onArquivo,
}: {
  rotulo: string;
  aceita?: string;
  altura?: string;
  onArquivo: (f: File) => Promise<void>;
}) {
  const id = useId();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={`flex ${altura} cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line px-3 text-center text-sm font-semibold text-ink2 transition-[color,background-color,border-color,scale] hover:bg-black/[0.03] active:scale-[.99] dark:hover:bg-white/[0.04]`}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        {ocupado ? 'Enviando…' : `${rotulo} (até 20 MB)`}
      </label>
      <input
        id={id}
        type="file"
        accept={aceita}
        aria-label={rotulo}
        className="sr-only"
        disabled={ocupado}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setErro('');
          setOcupado(true);
          void onArquivo(f)
            .catch((err: Error) => setErro(err.message))
            .finally(() => setOcupado(false));
        }}
      />
      {erro && (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
