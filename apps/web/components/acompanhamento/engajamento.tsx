'use client';
import {
  ENGAJAMENTOS,
  ENGAJAMENTO_COR,
  ENGAJAMENTO_LABEL,
  type Engajamento,
} from '@npac/shared/engajamento';
import { useCampo } from './campo';

/** Etiqueta do engajamento (NPAC-75): bolinha da cor + rótulo; nulo = "Sem marcação". */
export function TagEngajamento({ valor }: { valor: Engajamento | null }) {
  const g = valor ?? 'SEM';
  return (
    <span className={`tag eg-tag ${ENGAJAMENTO_COR[g]}`}>
      <i aria-hidden="true" />
      {ENGAJAMENTO_LABEL[g]}
    </span>
  );
}

/**
 * Campo "Engajamento" do aside Inscrição, logo depois de Status (NPAC-75): salva ao escolher, como os outros
 * campos, e entra no histórico só com o nome do campo. Só Admin e Acompanhamento editam.
 */
export function CampoEngajamento({
  chave,
  valor,
  editavel,
  aoSalvar,
}: {
  chave: string;
  valor: Engajamento | null;
  editavel: boolean;
  aoSalvar?: () => void;
}) {
  const c = useCampo(chave, 'engajamento', valor);
  const atual = (c.texto || null) as Engajamento | null;
  const g = atual ?? 'SEM';
  return (
    <label className={`pr eg-campo ${editavel ? '' : 'so-ler'}`}>
      <span>Engajamento</span>
      <span className={`eg-sel ${ENGAJAMENTO_COR[g]}`}>
        <i aria-hidden="true" />
        <select
          aria-label="Engajamento"
          value={c.texto}
          disabled={!editavel}
          onChange={(e) => {
            c.setTexto(e.target.value);
            if (c.salvar(e.target.value)) aoSalvar?.();
          }}
        >
          <option value="">{ENGAJAMENTO_LABEL.SEM}</option>
          {ENGAJAMENTOS.map((v) => (
            <option key={v} value={v}>
              {ENGAJAMENTO_LABEL[v]}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
