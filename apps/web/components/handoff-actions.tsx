'use client';
import { useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { quietButton } from './crm-ui';

type Handoff = { text: string; calendarUrl: string | null };

/** Texto e link montados no servidor, sem telefone/Instagram; abrem só por clique. */
export function HandoffActions({ leadId }: { leadId: string }) {
  const [status, setStatus] = useState('');
  const load = () => clientApi<Handoff>(`/api/leads/${leadId}/handoff`);
  return (
    <>
      <button
        type="button"
        className={quietButton}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText((await load()).text);
            setStatus('Handoff copiado');
          } catch {
            setStatus('Não foi possível copiar');
          }
        }}
      >
        Copiar handoff
      </button>
      <button
        type="button"
        className={quietButton}
        onClick={async () => {
          const tab = window.open('about:blank', '_blank');
          try {
            const { calendarUrl } = await load();
            if (!calendarUrl) {
              tab?.close();
              return setStatus('Agende uma reunião futura primeiro');
            }
            if (tab) {
              tab.opener = null;
              tab.location.href = calendarUrl;
            }
          } catch {
            tab?.close();
            setStatus('Não foi possível gerar o link');
          }
        }}
      >
        Google Agenda
      </button>
      <span role="status" className="self-center text-xs text-ink2">
        {status}
      </span>
    </>
  );
}
