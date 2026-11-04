'use client';
import { useState } from 'react';
import { baixarBackup } from '@/lib/acompanhamento-download';
import { FormError, quietButton } from '@/components/crm-ui';
import { ImportarGaveta, NOME_MODULO, type ModuloImport } from './importar-gaveta';

const ENTRADA: Record<ModuloImport, string> = {
  dashboard: 'Colar planilha · importar .json',
  'linha-do-tempo': 'Importar .json · cadastro manual',
  rdv: 'Novo mentorado · colar diagnóstico · colar vários eventos · importar .json',
};

/** Tela Importação e backup: entrada e saída de cada módulo (o .json é o backup oficial). */
export function BackupView({ extra }: { extra?: React.ReactNode }) {
  const [gaveta, setGaveta] = useState<ModuloImport | null>(null);
  const [erro, setErro] = useState('');
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em]">
          Importação, exportação e backup
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          Cada módulo tem sua própria entrada e saída de dados. O .json exportado é o backup oficial
          e restaura a base inteira de um módulo.
        </p>
      </div>
      <FormError message={erro} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="glass-card min-w-0 overflow-hidden">
          <h2 className="px-4 pt-4 text-base font-semibold">Entrada e saída por módulo</h2>
          <ul className="mt-2 divide-y divide-line">
            {(Object.keys(NOME_MODULO) as ModuloImport[]).map((m) => (
              <li key={m} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-semibold">{NOME_MODULO[m]}</b>
                  <span className="block text-[13px] text-ink2">{ENTRADA[m]}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${quietButton} min-h-10 active:scale-[.98]`}
                    aria-label={`Importar no ${NOME_MODULO[m]}`}
                    onClick={() => setGaveta(m)}
                  >
                    Importar
                  </button>
                  <button
                    type="button"
                    className={`${quietButton} min-h-10 active:scale-[.98]`}
                    aria-label={`Exportar .json do ${NOME_MODULO[m]}`}
                    onClick={() => {
                      setErro('');
                      void baixarBackup(m).catch((e: Error) => setErro(e.message));
                    }}
                  >
                    Exportar .json
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-3 text-xs text-ink2">
            Toda importação mostra quantos registros entram e pede confirmação antes de gravar.
            Nomes já existentes são ignorados. Fotos, vídeos e PDFs não vão dentro do .json: ficam
            no armazenamento de mídia e no backup cifrado.
          </p>
        </section>
        {extra}
      </div>
      {gaveta && <ImportarGaveta modulo={gaveta} onClose={() => setGaveta(null)} />}
    </div>
  );
}
