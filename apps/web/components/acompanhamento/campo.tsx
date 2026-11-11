'use client';
import { resolverConflito } from '@npac/shared/mentoria';
import { money, parseCents } from '@npac/shared/money';
import { useEffect, useRef, useState } from 'react';
import { avisar, ouvirCampo, salvarCampo } from '@/lib/acompanhamento-saver';

export type Conversao = {
  paraTexto?: (v: unknown) => string;
  /** Texto → valor gravado, já como o servidor guarda; lança Error com a mensagem do campo. */
  deTexto?: (t: string) => unknown;
};

const textoPadrao = (v: unknown) => (v == null ? '' : String(v));
const valorPadrao = (t: string) => (t.trim() === '' ? null : t.trim());

export const DINHEIRO: Conversao = {
  paraTexto: (v) => (v == null ? '' : money(v as number)),
  deTexto: (t) => {
    const limpo = t.replace(/[R$\s]/g, '');
    if (!limpo) return null;
    // "1.234,56" e "1234,56": ponto de milhar sai; o resto é o que `parseCents` entende.
    return parseCents(limpo.includes(',') ? limpo.replace(/\./g, '') : limpo);
  },
};

export const INTEIRO: Conversao = {
  deTexto: (t) => {
    if (!t.trim()) return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) throw new Error('Use um número inteiro.');
    return n;
  },
};

/**
 * Estado de um campo salvo ao sair dele. Guarda o valor que a pessoa viu (para a fila decidir o
 * que fazer num 409) e acompanha o servidor enquanto o campo não está em edição.
 */
export function useCampo(chave: string, campo: string, valor: unknown, c: Conversao = {}) {
  const paraTexto = c.paraTexto ?? textoPadrao;
  const deTexto = c.deTexto ?? valorPadrao;
  const [texto, setTexto] = useState(() => paraTexto(valor));
  const visto = useRef(valor);
  const antes = useRef(valor);
  const focado = useRef(false);
  const formatar = useRef(paraTexto);
  useEffect(() => {
    formatar.current = paraTexto;
  });

  useEffect(() => {
    visto.current = valor;
    if (!focado.current) setTexto(formatar.current(valor));
  }, [valor]);

  useEffect(
    () =>
      ouvirCampo(chave, campo, {
        mudou(v) {
          visto.current = v;
          setTexto(formatar.current(v));
        },
        erro() {
          visto.current = antes.current;
        },
      }),
    [chave, campo],
  );

  /** Grava `t` se mudou; devolve true quando entrou na fila. */
  function salvar(t: string): boolean {
    let novo: unknown;
    try {
      novo = deTexto(t);
    } catch (e) {
      avisar((e as Error).message);
      return false;
    }
    if (resolverConflito(novo, visto.current) === 'REAPLICAR') {
      setTexto(paraTexto(novo));
      return false;
    }
    antes.current = visto.current;
    salvarCampo(chave, campo, novo, visto.current);
    visto.current = novo;
    setTexto(paraTexto(novo));
    return true;
  }

  return {
    texto,
    setTexto,
    salvar,
    aoFocar: () => {
      focado.current = true;
    },
    aoSair: (t: string) => {
      focado.current = false;
      return salvar(t);
    },
  };
}

export type Opcao = { valor: string; rotulo: string; desativada?: boolean };

/** Linha rótulo/valor da ficha (`.pr`, `.pv`): texto, data ou lista, salva ao sair. */
export function CampoPr({
  rotulo,
  chave,
  campo,
  valor,
  tipo = 'text',
  opcoes,
  semVazio = false,
  editavel = true,
  classe = '',
  placeholder,
  inputMode,
  conversao,
  aoSalvar,
  selo,
}: {
  rotulo: string;
  chave: string;
  campo: string;
  valor: unknown;
  tipo?: 'text' | 'date' | 'email' | 'select';
  opcoes?: Opcao[];
  /** Lista sem a opção vazia (campo obrigatório). */
  semVazio?: boolean;
  editavel?: boolean;
  classe?: string;
  placeholder?: string;
  inputMode?: 'tel' | 'decimal' | 'numeric' | 'email' | 'url';
  conversao?: Conversao;
  /** Depois de enfileirar: atualiza o que depende do campo (nome no cabeçalho, botões). */
  aoSalvar?: () => void;
  /** Selo ao lado do rótulo (ex.: "Interno"). */
  selo?: React.ReactNode;
}) {
  const c = useCampo(chave, campo, valor, conversao);
  return (
    <label className={`pr ${classe}`}>
      <span className={selo ? 'rn-rot' : undefined}>
        {rotulo}
        {selo}
      </span>
      {tipo === 'select' ? (
        <select
          className="pv"
          aria-label={rotulo}
          value={c.texto}
          disabled={!editavel}
          onChange={(e) => {
            c.setTexto(e.target.value);
            if (c.salvar(e.target.value)) aoSalvar?.();
          }}
        >
          {!semVazio && <option value="">—</option>}
          {opcoes?.map((o) => (
            <option key={o.valor} value={o.valor} disabled={o.desativada}>
              {o.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={`pv ${tipo === 'date' && !c.texto ? 'vazia' : ''}`}
          type={tipo}
          value={c.texto}
          readOnly={!editavel}
          placeholder={editavel ? placeholder : undefined}
          inputMode={inputMode}
          onChange={(e) => c.setTexto(e.target.value)}
          onFocus={c.aoFocar}
          onBlur={(e) => {
            if (editavel && c.aoSair(e.target.value)) aoSalvar?.();
          }}
        />
      )}
    </label>
  );
}
