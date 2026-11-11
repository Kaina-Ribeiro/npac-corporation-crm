'use client';
import { useState } from 'react';
import { quietButton } from '@/components/crm-ui';

type Aba = 'MENTORADOS' | 'FILA' | 'PLANO' | 'REUNIOES';
type Filtros = { status?: string; mentoria?: string; responsavelId?: string; escopo?: string };

/**
 * Planilha da aba (§6): Admin e Acompanhamento. Pedido por POST (filtros no corpo, nunca na URL);
 * o arquivo é baixado sem abrir outra página. A API audita e neutraliza fórmulas.
 */
export function ExportarBotao({ aba, filtros }: { aba: Aba; filtros?: Filtros }) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState('');
  const baixar = async () => {
    setBaixando(true);
    setErro('');
    try {
      const res = await fetch('/api/mentoria/exportar', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aba, ...(filtros ? { filtros } : {}) }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(d.message ?? 'Não foi possível gerar a planilha.');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `acompanhamento-${aba.toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(false);
    }
  };
  return (
    <>
      <button type="button" className={quietButton} disabled={baixando} onClick={baixar}>
        {baixando ? 'Gerando…' : 'Exportar'}
      </button>
      {erro && (
        <span role="alert" className="msg-erro">
          {erro}
        </span>
      )}
    </>
  );
}
