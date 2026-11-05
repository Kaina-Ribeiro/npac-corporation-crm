'use client';
import { PENDENCIAS_PDF } from '@npac/shared/mentoria';
import { useState } from 'react';

export type Medidor = { bytes: number; arquivos: number };
export type Limites = {
  registroBytes: number;
  registrosTotal: number;
  arquivoBytes: number;
  registrosUsados: number;
};

const num = (n: number) => n.toLocaleString('pt-BR');
/** Bytes em KB, MB ou GB, com vírgula (1,5 MB). */
export function tamanho(bytes: number): string {
  const un = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < un.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${un[i]}`;
}

/**
 * Coluna da tela Backup: pendências do PDF (marcar não persiste, D26), medidor real de mídia
 * (soma de tamanho, sem número fixo) e limites técnicos do PDF com o uso atual.
 */
export function BackupPainel({ medidor, limites }: { medidor: Medidor; limites: Limites }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby="medidor-t" className="glass-card flex flex-col gap-2 p-4">
        <h2 id="medidor-t" className="text-base font-semibold">
          Medidor de espaço de mídia
        </h2>
        <div className="flex items-end justify-between gap-2">
          <b className="text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums">
            {tamanho(medidor.bytes)}
          </b>
          <span className="text-xs text-ink2">
            {medidor.arquivos === 1 ? '1 arquivo' : `${num(medidor.arquivos)} arquivos`}
          </span>
        </div>
        <p className="text-xs text-ink3">
          Soma real das fotos, vídeos e PDFs guardados fora do registro. Sem cota fixa publicada.
        </p>
      </section>

      <section aria-labelledby="limites-t" className="glass-card flex flex-col gap-3 p-4">
        <h2 id="limites-t" className="text-base font-semibold">
          Limites técnicos
        </h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink2">Tamanho de cada registro (um mentorado)</dt>
          <dd className="text-right font-semibold">{tamanho(limites.registroBytes)}</dd>
          <dt className="text-ink2">Registros no total, somando os 3 módulos</dt>
          <dd className="text-right font-semibold">
            {num(limites.registrosUsados)} de {num(limites.registrosTotal)}
          </dd>
          <dt className="text-ink2">Foto, vídeo ou PDF</dt>
          <dd className="text-right font-semibold">{tamanho(limites.arquivoBytes)} por arquivo</dd>
          <dt className="text-ink2">Espaço total de mídia</dt>
          <dd className="text-right font-semibold">soma real (medidor)</dd>
        </dl>
      </section>
    </div>
  );
}

/** Pendências do documento de escopo, texto literal; marcar não persiste (D26). */
export function Pendencias() {
  const [feitas, setFeitas] = useState<boolean[]>(PENDENCIAS_PDF.map(() => false));
  return (
    <section className="glass-card flex flex-col gap-1 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="pend-t" className="text-base font-semibold">
          Pendências
        </h2>
        <span className="text-xs text-ink3">do documento de escopo</span>
      </div>
      <ul aria-labelledby="pend-t" className="divide-y divide-line">
        {PENDENCIAS_PDF.map((p, i) => (
          <li key={p} className="py-2.5 text-[13px] leading-relaxed">
            <label className="flex cursor-pointer gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 flex-none accent-[var(--ink)]"
                checked={feitas[i]}
                onChange={(e) =>
                  setFeitas((f) => f.map((x, j) => (j === i ? e.target.checked : x)))
                }
              />
              <span className={feitas[i] ? 'text-ink3 line-through' : ''}>{p}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink3">
        Marcar aqui não fica salvo: serve só para conferir na hora.
      </p>
    </section>
  );
}
