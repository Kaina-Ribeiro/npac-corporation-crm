'use client';
import { type EvolucaoDTO, LIMITE_CAMPO_EVOLUCAO, type CampoEvolucao } from '@npac/shared/mentoria';
import { useState } from 'react';
import { showToast } from '@/components/toast';
import { filaDeSalvamento } from '@/lib/acompanhamento-saver';
import { useCampo } from './campo';
import { CARTOES, type Def } from './evolucao-topicos';

export const SETA = 'M5 12h14M13 6l6 6-6 6';
const LAPIS = 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4';

/** Valor como a fila grava (sem espaço nas pontas; vazio vira nulo). */
const normalizar = (t: string) => (t.trim() === '' ? null : t.trim());

/** "Salvo" quando a fila termina sem erro (spec §5.3). */
export function avisarSalvo(depois?: () => void) {
  const q = filaDeSalvamento();
  void q.idle().then(() => {
    if (q.status() === 'saved') showToast();
    depois?.();
  });
}

export type AoMudar = (campo: CampoEvolucao, valor: string | null) => void;

/**
 * Caixa de texto da evolução: salva ao sair (fila do módulo, chave `evolucao:<id>`). Texto antigo maior
 * que 2.000 caracteres abre inteiro; dá para encurtar, não para crescer.
 */
export function CaixaTexto({
  chave,
  campo,
  valor,
  rotulo,
  aoMudar,
  autoFocus = false,
  classe = 'ta',
}: {
  chave: string;
  campo: CampoEvolucao;
  valor: string | null;
  rotulo: string;
  aoMudar: AoMudar;
  autoFocus?: boolean;
  classe?: string;
}) {
  const c = useCampo(chave, campo, valor);
  return (
    <textarea
      className={classe}
      aria-label={rotulo}
      value={c.texto}
      maxLength={Math.max(LIMITE_CAMPO_EVOLUCAO, valor?.length ?? 0)}
      // A caixa abre no clique do cartão ou do "Editar": o foco vai para ela.
      autoFocus={autoFocus}
      onFocus={c.aoFocar}
      onChange={(e) => c.setTexto(e.target.value)}
      onBlur={(e) => {
        const t = e.target.value;
        if (c.aoSair(t)) {
          aoMudar(campo, normalizar(t));
          avisarSalvo();
        }
      }}
    />
  );
}

export function Icone16({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

function Texto({ v, depois = false }: { v: string | null; depois?: boolean }) {
  return v ? (
    <span className={`txt ${depois ? 'depois' : ''}`}>{v}</span>
  ) : (
    <span className="txt nao-inf">não informado</span>
  );
}

function Cartao({
  def,
  campos,
  edita,
  chave,
  aoMudar,
}: {
  def: Def;
  campos: EvolucaoDTO['campos'];
  edita: boolean;
  chave: string;
  aoMudar: AoMudar;
}) {
  const [editando, setEditando] = useState(false);
  const vazio = def.campos.every((c) => !campos[c]);
  // Quem só lê não vê o cartão vazio (spec §5.3).
  if (!edita && vazio) return null;
  const [a, b] = def.campos as [CampoEvolucao, CampoEvolucao | undefined];
  const caixa = (campo: CampoEvolucao, rotulo: string, foco: boolean) => (
    <CaixaTexto
      chave={chave}
      campo={campo}
      valor={campos[campo]}
      rotulo={rotulo}
      aoMudar={aoMudar}
      autoFocus={foco}
      classe="ta curta"
    />
  );
  return (
    <div
      className={`evo-c ${def.largo ? 'largo' : ''} ${editando ? 'editando' : ''}`}
      onBlur={(e) => {
        if (editando && !e.currentTarget.contains(e.relatedTarget as Node | null))
          setEditando(false);
      }}
    >
      <small>{def.rotulo}</small>
      {b ? (
        <div className="cmp">
          <span className="txt">
            <span className="lado">Antes</span>
            {editando ? caixa(a, `${def.rotulo}, antes`, true) : <Texto v={campos[a]} />}
          </span>
          <span className="seta">
            <Icone16 d={SETA} />
          </span>
          <span className="txt depois">
            <span className="lado">Hoje</span>
            {editando ? caixa(b, `${def.rotulo}, hoje`, false) : <Texto v={campos[b]} depois />}
          </span>
        </div>
      ) : editando ? (
        caixa(a, def.rotulo, true)
      ) : (
        <Texto v={campos[a]} />
      )}
      {edita && !editando && (
        <>
          <button
            type="button"
            className="cobre"
            aria-label={`Editar ${def.rotulo.toLowerCase()}`}
            onClick={() => setEditando(true)}
          />
          <Icone16 d={LAPIS} className="lapis" />
        </>
      )}
    </div>
  );
}

/** Cartões "antes → hoje" (spec §5.3): o cartão inteiro é o botão de editar. */
export function CartoesEvolucao({
  campos,
  edita,
  chave,
  aoMudar,
}: {
  campos: EvolucaoDTO['campos'];
  edita: boolean;
  chave: string;
  aoMudar: AoMudar;
}) {
  const visiveis = CARTOES.filter((d) => edita || d.campos.some((c) => campos[c]));
  if (!visiveis.length) return null;
  return (
    <div>
      <div className="sec-h">
        <span className="sec-t">Evolução</span>
        <small>Antes e hoje</small>
      </div>
      <div className="evo">
        {visiveis.map((d) => (
          <Cartao
            key={d.rotulo}
            def={d}
            campos={campos}
            edita={edita}
            chave={chave}
            aoMudar={aoMudar}
          />
        ))}
      </div>
    </div>
  );
}
