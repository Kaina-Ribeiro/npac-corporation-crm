'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { clampView, cropToBlob, HOLE, placement, STAGE, ZOOM_MAX, type View } from '@/lib/crop';
import { closeWithMotion } from '@/lib/dialog-motion';

const PASSO = 8;
const PASSO_ZOOM = 0.25;

function Icone({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d={d} />
    </svg>
  );
}

async function enviar(foto: Blob): Promise<string> {
  const corpo = new FormData();
  corpo.append('foto', foto, foto.type === 'image/webp' ? 'foto.webp' : 'foto.jpg');
  const res = await fetch('/api/me/photo', { method: 'PUT', body: corpo, cache: 'no-store' });
  const dados = (await res.json().catch(() => ({}))) as { photo?: string; message?: unknown };
  if (!res.ok || !dados.photo)
    throw new Error(
      typeof dados.message === 'string' ? dados.message : 'Não foi possível salvar a foto.',
    );
  return dados.photo;
}

/** Prévia redonda no tamanho de cada tela (Mais, sidebar, listas). */
function Previa({ img, view, lado }: { img: HTMLImageElement; view: View; lado: number }) {
  const p = placement(view, img.naturalWidth, img.naturalHeight);
  const k = lado / HOLE;
  const borda = (STAGE - HOLE) / 2;
  return (
    <span
      className="relative flex-none overflow-hidden rounded-full bg-black/10"
      style={{ width: lado, height: lado }}
    >
      <img
        src={img.src}
        alt=""
        className="absolute max-w-none"
        style={{
          width: p.width * k,
          height: p.height * k,
          left: (p.left - borda) * k,
          top: (p.top - borda) * k,
        }}
      />
    </span>
  );
}

/**
 * Janelinha "Ajustar foto" (NPAC-53): arrastar ou setas movem, − / + e a barra dão zoom, prévia em
 * três tamanhos; "Salvar foto" recorta em 256 px e envia. Carregada só no perfil (`next/dynamic`).
 */
export function FotoRecorte({
  img,
  onClose,
  onSaved,
}: {
  img: HTMLImageElement;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const arrasto = useRef<{ x: number; y: number; v: View } | null>(null);
  const tituloId = useId();
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const mudar = (v: View) => setView(clampView(v, w, h));
  const p = placement(view, w, h);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const fechar = () => closeWithMotion(ref.current, onClose);

  async function salvar() {
    setOcupado(true);
    setErro(null);
    try {
      const url = await enviar(await cropToBlob(img, view));
      closeWithMotion(ref.current, () => onSaved(url));
    } catch (e) {
      setErro((e as Error).message);
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      className="dlg m-auto w-[min(460px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-start gap-3 pt-5 pr-4 pl-5 md:pl-6">
        <div className="flex-1">
          <h2 id={tituloId} className="text-xl leading-[26px] font-bold tracking-[-0.02em]">
            Ajustar foto
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Arraste a foto e use o zoom até o rosto ficar no círculo.
          </p>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={fechar}
          className="-mt-1 grid size-11 flex-none place-items-center rounded-xl text-ink2 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Icone d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>
      <div className="flex flex-col gap-3.5 px-5 py-4 md:px-6">
        <div
          role="group"
          tabIndex={0}
          aria-label="Posição da foto: arraste ou use as setas"
          className="relative mx-auto touch-none overflow-hidden rounded-[18px] bg-[#141416] select-none"
          style={{ width: STAGE, height: STAGE, cursor: 'grab' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            arrasto.current = { x: e.clientX, y: e.clientY, v: view };
          }}
          onPointerMove={(e) => {
            const a = arrasto.current;
            if (a) mudar({ ...a.v, x: a.v.x + e.clientX - a.x, y: a.v.y + e.clientY - a.y });
          }}
          onPointerUp={() => (arrasto.current = null)}
          onPointerCancel={() => (arrasto.current = null)}
          onKeyDown={(e) => {
            const d: Record<string, [number, number]> = {
              ArrowUp: [0, -PASSO],
              ArrowDown: [0, PASSO],
              ArrowLeft: [-PASSO, 0],
              ArrowRight: [PASSO, 0],
            };
            const m = d[e.key];
            if (m) {
              e.preventDefault();
              mudar({ ...view, x: view.x + m[0], y: view.y + m[1] });
            } else if (e.key === '+' || e.key === '=')
              mudar({ ...view, zoom: view.zoom + PASSO_ZOOM });
            else if (e.key === '-') mudar({ ...view, zoom: view.zoom - PASSO_ZOOM });
          }}
        >
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: p.width, height: p.height, left: p.left, top: p.top }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 rounded-full shadow-[0_0_0_999px_rgba(10,10,12,.62),inset_0_0_0_2px_rgba(255,255,255,.92)]"
            style={{ width: HOLE, height: HOLE }}
          />
        </div>
        <div className="flex items-center gap-3 text-ink2">
          <button
            type="button"
            aria-label="Diminuir zoom"
            className="grid size-11 flex-none place-items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => mudar({ ...view, zoom: view.zoom - PASSO_ZOOM })}
          >
            <Icone d="M5 12h14" />
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={view.zoom}
            onChange={(e) => mudar({ ...view, zoom: Number(e.currentTarget.value) })}
            className="h-11 flex-1 accent-[var(--gold-deep)]"
          />
          <button
            type="button"
            aria-label="Aumentar zoom"
            className="grid size-11 flex-none place-items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => mudar({ ...view, zoom: view.zoom + PASSO_ZOOM })}
          >
            <Icone d="M12 5v14M5 12h14" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-ink2" aria-hidden="true">
          Prévia
          <Previa img={img} view={view} lado={56} />
          <Previa img={img} view={view} lado={36} />
          <Previa img={img} view={view} lado={24} />
        </div>
        {erro && (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {erro}
          </p>
        )}
      </div>
      <div className="flex gap-2.5 px-5 pb-5 max-md:[&>*]:flex-1 md:justify-end md:px-6 md:pb-6">
        <button type="button" className="btn btn-secondary min-h-11" onClick={fechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary min-h-11 px-5 text-[15px]"
          disabled={ocupado}
          onClick={() => void salvar()}
        >
          Salvar foto
        </button>
      </div>
    </dialog>
  );
}
