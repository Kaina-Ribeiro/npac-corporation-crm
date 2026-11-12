'use client';
import {
  META_STATUS,
  META_STATUS_LABEL,
  nomePme,
  PILAR_LABEL,
  PILARES,
  progressoMetaTexto,
  type MetaDTO,
  type MetaStatus,
} from '@npac/shared/mentoria';
import { useEffect, useState } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion } from '@/lib/acompanhamento-saver';
import { CampoPr, type Conversao } from './campo';
import { Dialogo } from './dialogo';
import { dataBR, ICONES, Icone } from './ui';

const sm = `${quietButton} sm`;
const CLASSE_STATUS: Record<MetaStatus, string> = {
  EM_ANDAMENTO: 'onb',
  ATINGIDA: 'ativo',
  NAO_ATINGIDA: 'canc',
};

/** "10.000", "2.500,50" ou "2500.5": número com até 2 casas, como o banco guarda. */
export const DECIMAL: Conversao = {
  paraTexto: (v) =>
    v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
  deTexto: (t) => {
    const l = t.replace(/[R$\s]/g, '');
    if (!l) return null;
    const norm = l.includes(',')
      ? l.replace(/\./g, '').replace(',', '.')
      : /^\d{1,3}(\.\d{3})+$/.test(l)
        ? l.replace(/\./g, '')
        : l;
    const n = Number(norm);
    if (!Number.isFinite(n) || n < 0) throw new Error('Use um número, como 2.500 ou 7,5.');
    return Math.round(n * 100) / 100;
  },
};

export type PessoaMeta = { id: string; nome: string };

const primeiroNome = (nome: string) => nome.split(' ')[0] ?? nome;
const dono = (m: MetaDTO, pessoas: PessoaMeta[]) =>
  m.pessoaId ? primeiroNome(pessoas.find((p) => p.id === m.pessoaId)?.nome ?? '') : null;

export function TagMeta({ status }: { status: MetaStatus }) {
  return <span className={`tag ${CLASSE_STATUS[status]}`}>{META_STATUS_LABEL[status]}</span>;
}

/** Uma meta: no campo para quem edita (salva ao sair); resumo para quem só lê. */
function MetaItem({
  m,
  pessoas,
  atualizar,
}: {
  m: MetaDTO;
  pessoas: PessoaMeta[];
  atualizar: () => void;
}) {
  const chave = `meta:${m.inscricaoId}:${m.id}`;
  const [excluir, setExcluir] = useState(false);
  useEffect(() => {
    registrarVersion(chave, m.version);
  }, [chave, m.version]);
  const progresso = progressoMetaTexto(m);
  const de = dono(m, pessoas);
  const descricao = m.descricao ?? 'Texto apagado (LGPD)';

  if (!m.podeEditar || m.descricao === null)
    return (
      <li className="mt-item">
        <div className="mt-topo">
          <b>{descricao}</b>
          <TagMeta status={m.status} />
        </div>
        <div className="mt-chips">
          {m.pilar && <span>{PILAR_LABEL[m.pilar]}</span>}
          {de && <span>De {de}</span>}
          {progresso && <span>{progresso}</span>}
          {m.prazo && <span>Até {dataBR(m.prazo)}</span>}
          {m.cicloNumero !== null && <span>{nomePme(m.cicloNumero)}</span>}
        </div>
      </li>
    );

  return (
    <li className="mt-item mt-ed">
      <CampoPr
        chave={chave}
        rotulo="Meta"
        campo="descricao"
        valor={m.descricao}
        classe="mt-desc"
        conversao={{
          deTexto: (t) => {
            if (!t.trim()) throw new Error('Descreva a meta.');
            return t.trim();
          },
        }}
      />
      <div className="mt-grade">
        <CampoPr
          chave={chave}
          rotulo="Status"
          campo="status"
          valor={m.status}
          tipo="select"
          semVazio
          aoSalvar={atualizar}
          opcoes={META_STATUS.map((s) => ({ valor: s, rotulo: META_STATUS_LABEL[s] }))}
        />
        <CampoPr
          chave={chave}
          rotulo="Pilar"
          campo="pilar"
          valor={m.pilar ?? ''}
          tipo="select"
          opcoes={PILARES.map((p) => ({ valor: p, rotulo: PILAR_LABEL[p] }))}
        />
        {pessoas.length > 1 && (
          <CampoPr
            chave={chave}
            rotulo="De quem"
            campo="pessoaId"
            valor={m.pessoaId ?? ''}
            tipo="select"
            semVazio
            opcoes={[
              { valor: '', rotulo: 'Do casal' },
              ...pessoas.map((p) => ({ valor: p.id, rotulo: primeiroNome(p.nome) })),
            ]}
          />
        )}
        <CampoPr
          chave={chave}
          rotulo="Atual"
          campo="valorAtual"
          valor={m.valorAtual}
          inputMode="decimal"
          placeholder="0"
          conversao={DECIMAL}
          aoSalvar={atualizar}
        />
        <CampoPr
          chave={chave}
          rotulo="Alvo"
          campo="valorAlvo"
          valor={m.valorAlvo}
          inputMode="decimal"
          placeholder="Opcional"
          conversao={DECIMAL}
          aoSalvar={atualizar}
        />
        <CampoPr
          chave={chave}
          rotulo="Unidade"
          campo="unidade"
          valor={m.unidade}
          placeholder="kg, R$, livros"
        />
        <CampoPr chave={chave} rotulo="Prazo" campo="prazo" valor={m.prazo} tipo="date" />
      </div>
      <div className="mt-pe">
        <span>
          {m.cicloNumero !== null ? `Conta no ${nomePme(m.cicloNumero)}` : 'Fora de um PME'}
        </span>
        <button type="button" className="pl-link" onClick={() => setExcluir(true)}>
          Excluir meta
        </button>
      </div>
      {excluir && (
        <Dialogo
          titulo="Excluir meta?"
          texto="As tarefas ligadas a ela continuam, sem a meta. Não dá para desfazer."
          rotulo="Excluir meta"
          perigo
          onFechar={() => setExcluir(false)}
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`/api/mentoria/metas/${m.id}`, 'DELETE');
            setExcluir(false);
            atualizar();
          }}
        />
      )}
    </li>
  );
}

/** Formulário de meta nova (descrição obrigatória; o resto, se a pessoa souber). */
function NovaMeta({
  inscricaoId,
  reuniaoId,
  pessoas,
  aoCriar,
  aoCancelar,
}: {
  inscricaoId: string;
  reuniaoId?: string;
  pessoas: PessoaMeta[];
  aoCriar: () => void;
  aoCancelar: () => void;
}) {
  const [f, setF] = useState({
    descricao: '',
    pilar: '',
    pessoaId: '',
    valorAlvo: '',
    unidade: '',
    prazo: '',
  });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    let alvo: unknown;
    try {
      alvo = DECIMAL.deTexto!(f.valorAlvo);
    } catch (x) {
      setErro((x as Error).message);
      return;
    }
    setOcupado(true);
    try {
      await clientApi(`/api/mentoria/inscricoes/${inscricaoId}/metas`, 'POST', {
        descricao: f.descricao,
        pilar: f.pilar || null,
        pessoaId: f.pessoaId || null,
        valorAlvo: alvo,
        valorAtual: alvo === null ? null : 0,
        unidade: f.unidade || null,
        prazo: f.prazo || null,
        ...(reuniaoId ? { reuniaoId } : {}),
      });
      aoCriar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="mt-nova" onSubmit={(e) => void salvar(e)} aria-label="Nova meta">
      <label className="f mt-nova-desc">
        <span>Meta</span>
        <input
          className={control}
          value={f.descricao}
          onChange={muda('descricao')}
          maxLength={2000}
          required
          placeholder="Ex.: juntar a reserva de emergência"
          autoFocus
        />
      </label>
      <label className="f">
        <span>Pilar</span>
        <select className={control} value={f.pilar} onChange={muda('pilar')}>
          <option value="">—</option>
          {PILARES.map((p) => (
            <option key={p} value={p}>
              {PILAR_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      {pessoas.length > 1 && (
        <label className="f">
          <span>De quem</span>
          <select className={control} value={f.pessoaId} onChange={muda('pessoaId')}>
            <option value="">Do casal</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {primeiroNome(p.nome)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="f">
        <span>Alvo (opcional)</span>
        <input
          className={control}
          inputMode="decimal"
          value={f.valorAlvo}
          onChange={muda('valorAlvo')}
          placeholder="10.000"
        />
      </label>
      <label className="f">
        <span>Unidade</span>
        <input
          className={control}
          value={f.unidade}
          onChange={muda('unidade')}
          maxLength={20}
          placeholder="R$, kg, livros"
        />
      </label>
      <label className="f">
        <span>Prazo</span>
        <input className={control} type="date" value={f.prazo} onChange={muda('prazo')} />
      </label>
      <div className="mt-nova-acoes">
        <FormError message={erro} />
        <button type="button" className={sm} onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className={`${button} sm`} disabled={ocupado || !f.descricao.trim()}>
          Adicionar meta
        </button>
      </div>
    </form>
  );
}

/**
 * Metas (Parte 2): lista e meta nova. Na ficha, as em andamento ficam à mostra e as encerradas
 * recolhidas; no registro da reunião, só as em andamento e as definidas nela.
 */
export function Metas({
  inscricaoId,
  metas,
  pessoas,
  podeCriar,
  atualizar,
  reuniaoId,
  titulo = 'Metas',
  vazio,
}: {
  inscricaoId: string;
  metas: MetaDTO[];
  pessoas: PessoaMeta[];
  podeCriar: boolean;
  atualizar: () => void;
  reuniaoId?: string;
  titulo?: string;
  vazio: string;
}) {
  const [nova, setNova] = useState(false);
  const abertas = metas.filter((m) => m.status === 'EM_ANDAMENTO' || m.reuniaoId === reuniaoId);
  const encerradas = reuniaoId ? [] : metas.filter((m) => !abertas.includes(m));
  return (
    <section className="mt" aria-label={titulo}>
      <div className="pme-cab">
        <h3>{titulo}</h3>
        {podeCriar && !nova && (
          <button type="button" className={sm} onClick={() => setNova(true)}>
            <Icone d={ICONES.mais} largura={2.2} />
            Nova meta
          </button>
        )}
      </div>
      {nova && (
        <NovaMeta
          inscricaoId={inscricaoId}
          reuniaoId={reuniaoId}
          pessoas={pessoas}
          aoCancelar={() => setNova(false)}
          aoCriar={() => {
            setNova(false);
            atualizar();
          }}
        />
      )}
      {abertas.length > 0 ? (
        <ul className="mt-lista">
          {abertas.map((m) => (
            <MetaItem key={m.id} m={m} pessoas={pessoas} atualizar={atualizar} />
          ))}
        </ul>
      ) : (
        !nova && <p className="pme-vazio-txt">{vazio}</p>
      )}
      {encerradas.length > 0 && (
        <details className="pme-hist">
          <summary>
            Metas encerradas <span>{encerradas.length}</span>
            <Icone d={ICONES.abaixo} />
          </summary>
          <ul className="mt-lista">
            {encerradas.map((m) => (
              <MetaItem key={m.id} m={m} pessoas={pessoas} atualizar={atualizar} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
