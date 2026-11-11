'use client';
import { type AvaliacaoDTO, type FichaDTO, type PessoaDTO } from '@npac/shared/mentoria';
import { money } from '@npac/shared/money';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { quietButton } from '@/components/crm-ui';
import { filaDeSalvamento } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { CampoPr, DINHEIRO, useCampo, type Conversao } from './campo';
import { Dialogo } from './dialogo';
import { dataBR, ICONES, Icone } from './ui';

const sm = `${quietButton} sm`;

const SIM_NAO: Conversao = {
  paraTexto: (v) => (v === true ? 'SIM' : v === false ? 'NAO' : ''),
  deTexto: (t) => (t === 'SIM' ? true : t === 'NAO' ? false : null),
};
const NOTA: Conversao = {
  deTexto: (t) => {
    if (!t.trim()) return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error('A nota vai de 0 a 10.');
    return n;
  },
};

function Numero({
  chave,
  rotulo,
  campo,
  valor,
  editavel,
}: {
  chave: string;
  rotulo: string;
  campo: string;
  valor: number | null | undefined;
  editavel: boolean;
}) {
  const c = useCampo(chave, campo, valor, DINHEIRO);
  return (
    <label className="pl">
      <small>{rotulo}</small>
      {editavel ? (
        <input
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={c.texto}
          onChange={(e) => c.setTexto(e.target.value)}
          onFocus={c.aoFocar}
          onBlur={(e) => c.aoSair(e.target.value)}
        />
      ) : (
        <b>{valor == null ? '—' : money(valor).replace(/,00$/, '')}</b>
      )}
    </label>
  );
}

function Texto({
  chave,
  rotulo,
  campo,
  valor,
  editavel,
}: {
  chave: string;
  rotulo: string;
  campo: string;
  valor: string | null | undefined;
  editavel: boolean;
}) {
  const c = useCampo(chave, campo, valor);
  if (!editavel)
    return (
      <div>
        <small>{rotulo}</small>
        <p>{valor || '—'}</p>
      </div>
    );
  return (
    <label>
      <small>{rotulo}</small>
      <textarea
        value={c.texto}
        onChange={(e) => c.setTexto(e.target.value)}
        onFocus={c.aoFocar}
        onBlur={(e) => c.aoSair(e.target.value)}
      />
    </label>
  );
}

function Nota({
  chave,
  rotulo,
  campo,
  valor,
  editavel,
  conversao,
}: {
  chave: string;
  rotulo: string;
  campo: string;
  valor: string | number | null | undefined;
  editavel: boolean;
  conversao?: Conversao;
}) {
  const c = useCampo(chave, campo, valor, conversao);
  if (!editavel)
    return (
      <div>
        <small>{rotulo}</small>
        <b>{valor ?? '—'}</b>
      </div>
    );
  return (
    <label>
      <small>{rotulo}</small>
      <input
        value={c.texto}
        inputMode={conversao ? 'numeric' : undefined}
        aria-label={`${rotulo}`}
        onChange={(e) => c.setTexto(e.target.value)}
        onFocus={c.aoFocar}
        onBlur={(e) => c.aoSair(e.target.value)}
      />
    </label>
  );
}

function Avaliacao({ p, editavel }: { p: PessoaDTO; editavel: boolean }) {
  const de = (t: AvaliacaoDTO['tipo']) => p.avaliacoes.find((a) => a.tipo === t);
  const prova = de('PROVA_10_HABILIDADES');
  const pilares = de('PILARES');
  const chaveP = `avaliacao:${p.id}:PILARES`;
  const notas = [
    ['Fé', 'notaFe', pilares?.notaFe],
    ['Saúde', 'notaSaude', pilares?.notaSaude],
    ['Dinheiro', 'notaDinheiro', pilares?.notaDinheiro],
    ['Relacionamentos', 'notaRelacionamentos', pilares?.notaRelacionamentos],
  ] as const;
  return (
    <div className="av">
      <b className="av-n">{p.apelido ?? p.nome.split(' ')[0]}</b>
      <Nota
        chave={`avaliacao:${p.id}:PROVA_10_HABILIDADES`}
        rotulo="Prova"
        campo="resultadoProva"
        valor={prova?.resultadoProva}
        editavel={editavel}
      />
      {notas.map(([rotulo, campo, valor]) => (
        <Nota
          key={campo}
          chave={chaveP}
          rotulo={rotulo}
          campo={campo}
          valor={valor}
          editavel={editavel}
          conversao={NOTA}
        />
      ))}
    </div>
  );
}

/** Aba Momento inicial: edita até concluir; concluído, só Admin destrava. */
export function FichaMomento({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const router = useRouter();
  const [pedido, setPedido] = useState<'concluir' | 'destravar' | null>(null);
  const m = ficha.momento;
  const travado = !!m?.travadoEm;
  const editavel = ficha.pode.momento && !travado;
  const chave = `momento:${ficha.id}`;
  const url = `/api/mentoria/inscricoes/${ficha.id}/momento`;

  return (
    <section className="card pa" role="tabpanel" aria-label="Momento inicial">
      <div className="mo-h">
        {travado ? (
          <span className="locked">
            <Icone d={ICONES.cadeado} largura={2} />
            Concluído em {dataBR(m.travadoEm)}
            {m.travadoPor ? ` por ${m.travadoPor}` : ''}
          </span>
        ) : (
          <span className="text-xs font-semibold text-ink2">
            {editavel ? 'Em preenchimento' : 'Ainda não concluído'}
          </span>
        )}
        {travado && ficha.pode.admin && (
          <button type="button" className={sm} onClick={() => setPedido('destravar')}>
            Destravar
          </button>
        )}
        {editavel && (
          <button type="button" className={sm} onClick={() => setPedido('concluir')}>
            Concluir
          </button>
        )}
      </div>

      {editavel && (
        <div className="props mb-2">
          <CampoPr chave={chave} rotulo="Data" campo="data" valor={m?.data} tipo="date" />
          <CampoPr
            chave={chave}
            rotulo="Tem dívidas?"
            campo="temDividas"
            valor={m?.temDividas}
            tipo="select"
            conversao={SIM_NAO}
            opcoes={[
              { valor: 'SIM', rotulo: 'Sim' },
              { valor: 'NAO', rotulo: 'Não' },
            ]}
          />
        </div>
      )}
      <div className="kp">
        <Numero
          chave={chave}
          rotulo="Recebe por mês"
          campo="recebeCentavos"
          valor={m?.recebeCentavos}
          editavel={editavel}
        />
        <Numero
          chave={chave}
          rotulo="Custo mensal"
          campo="custoCentavos"
          valor={m?.custoCentavos}
          editavel={editavel}
        />
        <Numero
          chave={chave}
          rotulo="Dívidas"
          campo="dividasCentavos"
          valor={m?.dividasCentavos}
          editavel={editavel}
        />
        <Numero
          chave={chave}
          rotulo="Guardado"
          campo="guardadoCentavos"
          valor={m?.guardadoCentavos}
          editavel={editavel}
        />
      </div>
      <div className="tx">
        <Texto
          chave={chave}
          rotulo="Principal dor"
          campo="dor"
          valor={m?.dor}
          editavel={editavel}
        />
        <Texto
          chave={chave}
          rotulo="Principal sonho"
          campo="sonho"
          valor={m?.sonho}
          editavel={editavel}
        />
        <Texto
          chave={chave}
          rotulo="Meta de 12 meses"
          campo="meta"
          valor={m?.meta}
          editavel={editavel}
        />
      </div>
      <h3>Avaliação inicial</h3>
      {ficha.pessoas.map((p) => (
        <Avaliacao key={p.id} p={p} editavel={editavel} />
      ))}

      {pedido === 'concluir' && (
        <Dialogo
          titulo="Concluir o momento inicial"
          texto="Depois de concluído, o momento inicial e a avaliação ficam travados. Só um Admin destrava."
          rotulo="Concluir"
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`${url}/concluir`, 'POST');
            atualizar();
          }}
          onFechar={() => setPedido(null)}
        />
      )}
      {pedido === 'destravar' && (
        <Dialogo
          titulo="Destravar o momento inicial"
          texto="O momento inicial e a avaliação voltam a aceitar edição. A ação fica no histórico."
          rotulo="Destravar"
          onConfirmar={async () => {
            await clientApi(`${url}/destravar`, 'POST');
            router.refresh();
          }}
          onFechar={() => setPedido(null)}
        />
      )}
    </section>
  );
}
