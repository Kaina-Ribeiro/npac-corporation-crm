'use client';
import {
  MENTORADO_STATUS,
  MENTORADO_STATUS_LABEL,
  parseData,
  type MentoradoItem,
  type MentoradoStatus,
} from '@npac/shared/mentoria';
import { useEffect, useState } from 'react';

/** Fundo da linha pela cor do status (o mesmo tom dos cards). */
const FUNDO: Record<MentoradoStatus, string> = {
  ENGAJADO: 'bg-emerald-500/[0.06]',
  EM_ATENCAO: 'bg-amber-500/[0.07]',
  EM_RISCO: 'bg-rose-500/[0.07]',
};
const PONTO: Record<MentoradoStatus, string> = {
  ENGAJADO: 'bg-emerald-600',
  EM_ATENCAO: 'bg-amber-500',
  EM_RISCO: 'bg-rose-600',
};

const celula =
  'w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink transition-colors hover:border-line focus:border-ink/30 focus:bg-white/70 dark:focus:bg-white/10';

type Campo = 'nome' | 'tipoCadastro' | 'tipoMentoria' | 'dataEntrada' | 'status';

/**
 * Uma linha do Dashboard com edição direto na célula: salva ao sair do campo (regra 2), pela
 * fila. Status muda a cor da linha na hora. Data aceita o texto como veio; se não for
 * DD/MM/AAAA ou MM/AAAA, a célula avisa (a data fica nula e vai para o fim da ordem).
 */
export function MentoradoLinha({
  m,
  onSalvar,
  onRemover,
}: {
  m: MentoradoItem;
  onSalvar: (campo: Campo, valor: string | null) => void;
  onRemover: () => void;
}) {
  const [v, setV] = useState({
    nome: m.nome,
    tipoCadastro: m.tipoCadastro ?? '',
    tipoMentoria: m.tipoMentoria ?? '',
    dataEntrada: m.dataEntradaTexto ?? '',
  });
  useEffect(() => {
    setV({
      nome: m.nome,
      tipoCadastro: m.tipoCadastro ?? '',
      tipoMentoria: m.tipoMentoria ?? '',
      dataEntrada: m.dataEntradaTexto ?? '',
    });
  }, [m.id]);
  const original = {
    nome: m.nome,
    tipoCadastro: m.tipoCadastro ?? '',
    tipoMentoria: m.tipoMentoria ?? '',
    dataEntrada: m.dataEntradaTexto ?? '',
  };
  const sair = (campo: Exclude<Campo, 'status'>) => () => {
    const novo = v[campo].trim();
    if (campo === 'nome' && !novo) return setV((s) => ({ ...s, nome: original.nome }));
    if (novo !== original[campo]) onSalvar(campo, novo || null);
  };
  const dataRuim = !!v.dataEntrada.trim() && !parseData(v.dataEntrada).data;

  return (
    <tr data-status={m.status} className={`${FUNDO[m.status]} transition-colors`}>
      <td className="px-2 py-1.5">
        <input
          aria-label={`Nome de ${m.nome}`}
          className={`${celula} font-semibold`}
          value={v.nome}
          onChange={(e) => setV((s) => ({ ...s, nome: e.target.value }))}
          onBlur={sair('nome')}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          aria-label={`Tipo de ${m.nome}`}
          className={celula}
          value={v.tipoCadastro}
          onChange={(e) => setV((s) => ({ ...s, tipoCadastro: e.target.value }))}
          onBlur={sair('tipoCadastro')}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          aria-label={`Tipo de mentoria de ${m.nome}`}
          list="mentorias"
          className={`${celula} min-w-[150px]`}
          value={v.tipoMentoria}
          onChange={(e) => setV((s) => ({ ...s, tipoMentoria: e.target.value }))}
          onBlur={sair('tipoMentoria')}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          aria-label={`Data de entrada de ${m.nome}`}
          placeholder="DD/MM/AAAA"
          aria-invalid={dataRuim || undefined}
          title={
            dataRuim
              ? 'Data fora do formato DD/MM/AAAA ou MM/AAAA: fica no fim da ordem'
              : undefined
          }
          className={`${celula} min-w-[110px] ${dataRuim ? '!border-rose-500/60' : ''}`}
          value={v.dataEntrada}
          onChange={(e) => setV((s) => ({ ...s, dataEntrada: e.target.value }))}
          onBlur={sair('dataEntrada')}
        />
      </td>
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-1.5">
          <i aria-hidden="true" className={`size-2.5 flex-none rounded-full ${PONTO[m.status]}`} />
          <select
            aria-label={`Status de ${m.nome}`}
            className={`${celula} min-w-[120px] cursor-pointer`}
            value={m.status}
            onChange={(e) => onSalvar('status', e.target.value)}
          >
            {MENTORADO_STATUS.map((s) => (
              <option key={s} value={s}>
                {MENTORADO_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </span>
      </td>
      <td className="w-12 px-2 py-1.5 text-right">
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover ${m.nome}`}
          title="Remover (pede confirmação)"
          className="inline-flex size-9 items-center justify-center rounded-lg text-ink3 hover:bg-rose-500/10 hover:text-rose-700 active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
