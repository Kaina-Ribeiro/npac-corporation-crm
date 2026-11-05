'use client';
import { useState } from 'react';
import { control, quietButton } from './crm-ui';

type Option = { label: string; body: () => object };

/** Baixa um CSV por POST (corpo JSON); erro vira mensagem em português. */
export async function downloadCsv(endpoint: string, body: object, filename: string) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(
      typeof msg?.message === 'string' && msg.message !== 'Dados inválidos'
        ? msg.message
        : 'Não foi possível exportar; confira o período e seu acesso.',
    );
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Menu "exportar CSV": por período, com os filtros da tela ou tudo. Corpo por POST (nada de
 * filtro ou contato em URL); o servidor audita e recusa acima de 10 mil linhas.
 */
export function CsvExport({
  label,
  endpoint,
  filename,
  options,
  period,
  align = 'right',
}: {
  /** Lado em que o menu se ancora ao botão (à esquerda quando o botão fica no começo da linha). */
  align?: 'left' | 'right';
  label: string;
  endpoint: string;
  filename: string;
  options: Option[];
  /** Campos "Criados de/até" (data de criação) que viram o corpo do botão "Exportar período". */
  period?: (from: string, to: string) => object;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  async function download(body: object) {
    setBusy(true);
    setError('');
    try {
      await downloadCsv(endpoint, body, filename);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="group relative">
      <summary
        className={`${quietButton} cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden`}
      >
        {label}
      </summary>
      <div
        className={`glass-card absolute ${align === 'left' ? 'left-0' : 'right-0'} z-20 mt-2 flex w-72 max-w-[calc(100vw-32px)] flex-col gap-2 p-3 shadow-xl`}
      >
        {period && (
          <div className="flex flex-col gap-2 border-b border-line pb-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-ink2">
                Criados de
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={control}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink2">
                Criados até
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={control}
                />
              </label>
            </div>
            <button
              type="button"
              className={quietButton}
              disabled={busy || !from || !to}
              onClick={() => void download(period(from, to))}
            >
              Exportar período
            </button>
          </div>
        )}
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`${quietButton} justify-start text-left`}
            disabled={busy}
            onClick={() => void download(o.body())}
          >
            {o.label}
          </button>
        ))}
        {error && (
          <p role="status" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
