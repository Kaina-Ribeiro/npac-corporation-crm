'use client';
import { renderMensagem, type MensagemModelo } from '@npac/shared/mentoria';
import { useState } from 'react';
import { button } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';

const EXEMPLO_UM = [{ nome: 'Mentorado Fictício', apelido: 'Fictício' }];
const EXEMPLO_CASAL = [
  { nome: 'Ana Fictícia', apelido: null },
  { nome: 'Bia Fictícia', apelido: null },
];

function Modelo({ inicial }: { inicial: MensagemModelo }) {
  const [m, setM] = useState(inicial);
  const [individual, setIndividual] = useState(inicial.textoIndividual);
  const [casal, setCasal] = useState(inicial.textoCasal);
  const [estado, setEstado] = useState<{ ok?: boolean; erro?: string }>({});
  const mudou = individual !== m.textoIndividual || casal !== m.textoCasal;

  const salvar = async () => {
    setEstado({});
    try {
      const r = await clientApi<{ version: number }>('/api/mentoria/mensagens', 'PUT', {
        momento: m.momento,
        version: m.version,
        textoIndividual: individual,
        textoCasal: casal,
      });
      setM({ ...m, version: r.version, textoIndividual: individual, textoCasal: casal });
      setEstado({ ok: true });
    } catch (e) {
      setEstado({ erro: (e as Error).message });
    }
  };

  const id = `msg-${m.momento.toLowerCase()}`;
  return (
    <li className="msg-modelo">
      <h2>{m.nome}</h2>
      <label htmlFor={`${id}-i`}>Individual</label>
      <textarea
        id={`${id}-i`}
        className="field"
        rows={3}
        maxLength={4000}
        value={individual}
        onChange={(e) => setIndividual(e.target.value)}
      />
      <label htmlFor={`${id}-c`}>Casal</label>
      <textarea
        id={`${id}-c`}
        className="field"
        rows={3}
        maxLength={4000}
        placeholder="Vazio: o casal recebe a versão individual"
        value={casal}
        onChange={(e) => setCasal(e.target.value)}
      />
      {(individual || casal) && (
        <p className="msg-previa">
          <b>Prévia:</b> {renderMensagem(casal || individual, casal ? EXEMPLO_CASAL : EXEMPLO_UM)}
        </p>
      )}
      <div className="msg-acoes">
        <button type="button" className={`${button} sm`} disabled={!mudou} onClick={salvar}>
          Salvar
        </button>
        {estado.ok && !mudou && <span className="msg-ok">Salvo</span>}
        {estado.erro && (
          <span role="alert" className="msg-erro">
            {estado.erro}
          </span>
        )}
      </div>
    </li>
  );
}

/** Configurações > Mensagens-modelo: um texto por momento, com `{nome}` e `{nomes}`. */
export function MensagensAdmin({ mensagens }: { mensagens: MensagemModelo[] }) {
  return (
    <>
      <p className="pf-nota">
        Use <code>{'{nome}'}</code> para o primeiro nome (ou apelido) e <code>{'{nomes}'}</code>{' '}
        para o casal (&quot;Ana e Bia&quot;). Os botões de WhatsApp copiam o texto pronto e abrem a
        conversa; o texto nunca vai no link.
      </p>
      <ul className="card msg-lista">
        {mensagens.map((m) => (
          <Modelo key={m.momento} inicial={m} />
        ))}
      </ul>
    </>
  );
}
