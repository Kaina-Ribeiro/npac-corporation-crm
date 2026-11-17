'use client';
import {
  CICLO_STATUS_LABEL,
  nomePme,
  TAREFA_ORIGEM_LABEL,
  TAREFA_STATUS,
  TAREFA_STATUS_LABEL,
  tarefaPedeMotivo,
  REUNIAO_TIPO_LABEL,
  ULTIMO_PME,
  type CicloDTO,
  type CicloStatus,
  type FichaDTO,
  type MetaDTO,
  type TarefaDTO,
} from '@npac/shared/mentoria';
import { useEffect, useRef, useState } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion, salvarCampo } from '@/lib/acompanhamento-saver';
import { CampoPr, useCampo } from './campo';
import { Dialogo } from './dialogo';
import { enviarFoto } from './midia';
import { dataBR, ICONES, Icone } from './ui';

const sm = `${quietButton} sm`;
const CLASSE_CICLO: Record<CicloStatus, string> = {
  EM_ANDAMENTO: 'onb',
  CONCLUIDO: 'ativo',
  NAO_CONCLUIDO: 'canc',
};
const chaveTarefa = (t: TarefaDTO) => `tarefa:${t.inscricaoId}:${t.id}`;
const diaBR = (iso: string) =>
  dataBR(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso)));

export function TagCiclo({ c }: { c: CicloDTO }) {
  const atraso =
    c.diasAtraso > 0 && c.status !== 'NAO_CONCLUIDO'
      ? `, ${c.diasAtraso} dia${c.diasAtraso > 1 ? 's' : ''} de atraso`
      : '';
  return (
    <span className={`tag ${CLASSE_CICLO[c.status]}`}>
      {CICLO_STATUS_LABEL[c.status]}
      {atraso}
    </span>
  );
}

/** Texto e prazo da tarefa da reunião, salvos ao sair do campo. */
function Combinado({ t, metas }: { t: TarefaDTO; metas?: MetaDTO[] }) {
  const chave = chaveTarefa(t);
  const texto = useCampo(chave, 'descricao', t.descricao);
  const prazo = useCampo(chave, 'prazo', t.prazo);
  const meta = useCampo(chave, 'metaId', t.metaId);
  return (
    <div className="tr-comb">
      <input
        className="tr-texto"
        aria-label="Tarefa"
        value={texto.texto}
        maxLength={2000}
        onChange={(e) => texto.setTexto(e.target.value)}
        onFocus={texto.aoFocar}
        onBlur={(e) => {
          if (!e.target.value.trim()) {
            texto.setTexto(t.descricao ?? '');
            return;
          }
          texto.aoSair(e.target.value);
        }}
      />
      <div className="tr-linha">
        <label>
          <span>Prazo</span>
          <input
            type="date"
            value={prazo.texto}
            required
            onChange={(e) => prazo.setTexto(e.target.value)}
            onFocus={prazo.aoFocar}
            onBlur={(e) => {
              if (!e.target.value) {
                prazo.setTexto(t.prazo ?? '');
                return;
              }
              prazo.aoSair(e.target.value);
            }}
          />
        </label>
        {metas && metas.length > 0 && (
          <label>
            <span>Meta</span>
            <select
              value={meta.texto}
              onChange={(e) => {
                meta.setTexto(e.target.value);
                meta.salvar(e.target.value);
              }}
            >
              <option value="">Nenhuma</option>
              {metas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.descricao ?? 'Meta'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

/**
 * Uma tarefa: resultado, motivo e comprovante, lançados pela equipe (E8). A da reunião mostra de
 * onde veio e, com `combinar`, edita texto, prazo e meta.
 */
export function Tarefa({
  t,
  atualizar,
  metas,
  combinar = false,
  mostrarReuniao = false,
}: {
  t: TarefaDTO;
  atualizar: () => void;
  /** Metas visíveis, para a escolha e o nome da meta (vazio para a Especialista). */
  metas?: MetaDTO[];
  combinar?: boolean;
  mostrarReuniao?: boolean;
}) {
  const chave = chaveTarefa(t);
  const arquivo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    registrarVersion(chave, t.version);
  }, [chave, t.version]);
  const ed = t.podeEditar;
  const feita = t.status === 'FEITA';
  const encerramento = t.origem === 'ENCERRAMENTO';
  const descricao = t.descricao ?? 'Texto apagado (LGPD)';
  const editaCombinado = combinar && ed && t.origem === 'REUNIAO' && t.descricao !== null;
  const nomeMeta = t.metaId ? metas?.find((m) => m.id === t.metaId)?.descricao : null;

  const mudar = (status: string) => {
    if (status === t.status) return;
    salvarCampo(chave, 'status', status, t.status);
    void filaDeSalvamento().idle().then(atualizar);
  };

  async function anexar(f: File) {
    setErro('');
    try {
      await filaDeSalvamento().idle();
      await enviarFoto('tarefa-comprovante', t.id, f);
      atualizar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  async function remover() {
    setErro('');
    try {
      await clientApi(`/api/mentoria/midia/${t.comprovanteMidiaId}`, 'DELETE');
      atualizar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <li className={`pme-tarefa ${encerramento ? 'enc' : ''} ${feita ? 'feita' : ''}`}>
      <button
        type="button"
        className={`check sm ${feita ? 'done' : ''}`}
        aria-pressed={feita}
        aria-label={`${feita ? 'Desmarcar' : 'Marcar feita'}: ${descricao}`}
        disabled={!ed}
        onClick={() => mudar(feita ? 'PENDENTE' : 'FEITA')}
      >
        <Icone d={ICONES.check} largura={3} />
      </button>
      <div className="min-w-0">
        <span className="pme-orig">
          {mostrarReuniao && t.reuniaoInicio
            ? `${t.reuniaoTipo ? REUNIAO_TIPO_LABEL[t.reuniaoTipo] : 'Reunião'} de ${diaBR(t.reuniaoInicio)}`
            : TAREFA_ORIGEM_LABEL[t.origem]}
        </span>
        {editaCombinado ? <Combinado t={t} metas={metas} /> : <b>{descricao}</b>}
        {!editaCombinado && nomeMeta && <span className="tr-meta">Meta: {nomeMeta}</span>}
        <span className="meta">
          {t.cobradaEm && t.status !== 'PENDENTE'
            ? `${TAREFA_STATUS_LABEL[t.status]} em ${diaBR(t.cobradaEm)}${t.cobradaPor ? `, ${t.cobradaPor}` : ''}${t.prazo ? ` · prazo ${dataBR(t.prazo)}` : ''}`
            : t.prazo && !editaCombinado
              ? `Prazo ${dataBR(t.prazo)}`
              : ''}
        </span>
        {(ed || t.comprovanteMidiaId) && (
          <div className="pme-comp">
            {t.comprovanteMidiaId && (
              <a
                className="pl-link"
                href={`/api/mentoria/midia/${t.comprovanteMidiaId}`}
                target="_blank"
                rel="noreferrer"
              >
                Ver comprovante
                {t.comprovanteTipo === 'PDF'
                  ? ' (PDF)'
                  : t.comprovanteTipo === 'VIDEO'
                    ? ' (vídeo)'
                    : ''}
              </a>
            )}
            {ed && (
              <>
                <input
                  ref={arquivo}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                  className="imp-input"
                  aria-label={`Comprovante: ${descricao}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void anexar(f);
                    e.target.value = '';
                  }}
                />
                <button type="button" className="pl-link" onClick={() => arquivo.current?.click()}>
                  {t.comprovanteMidiaId ? 'Trocar' : 'Anexar comprovante'}
                </button>
                {t.comprovanteMidiaId && (
                  <button type="button" className="pl-link" onClick={() => void remover()}>
                    Remover
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {tarefaPedeMotivo(t.status) && (
          <CampoPr
            chave={chave}
            rotulo="Motivo"
            campo="motivo"
            valor={t.motivo}
            editavel={ed}
            classe="pme-motivo"
            placeholder="Por que não fez tudo"
          />
        )}
        <FormError message={erro} />
      </div>
      <select
        className={`pme-st ${t.status.toLowerCase()}`}
        aria-label={`Resultado: ${descricao}`}
        value={t.status}
        disabled={!ed}
        onChange={(e) => mudar(e.target.value)}
      >
        {TAREFA_STATUS.map((s) => (
          <option key={s} value={s}>
            {TAREFA_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </li>
  );
}

type Janela =
  | { tipo: 'envio' }
  | { tipo: 'anterior' }
  | { tipo: 'data'; c: CicloDTO }
  | { tipo: 'fechar'; c: CicloDTO }
  | null;

/** Barra de progresso (0–100 %) com rótulo; `pct` nulo mostra `vazio`. O número vem do banco. */
export function Barra({
  rotulo,
  nome,
  pct,
  vazio,
  dica,
}: {
  rotulo: string;
  /** Nome acessível do medidor. */
  nome: string;
  pct: number | null;
  vazio: string;
  dica?: string;
}) {
  const texto = pct === null ? vazio : `${pct}%`;
  return (
    <div className="pme-barra" title={dica}>
      <div className="pme-barra-t">
        <span>{rotulo}</span>
        <b>{texto}</b>
      </div>
      <div
        className="pme-trilho"
        role="meter"
        aria-label={nome}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? 0}
        aria-valuetext={texto}
      >
        <span style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

/** Um ciclo: datas, status, % e as tarefas do catálogo (as da reunião ficam na seção Tarefas). */
function Ciclo({
  c,
  ficha,
  atual,
  abrir,
  atualizar,
}: {
  c: CicloDTO;
  ficha: FichaDTO;
  atual: boolean;
  abrir: (j: Janela) => void;
  atualizar: () => void;
}) {
  const doCiclo = c.tarefas.filter((t) => t.origem !== 'REUNIAO');
  const daReuniao = c.tarefas.length - doCiclo.length;
  const semEncerramento = !c.tarefas.some((t) => t.origem === 'ENCERRAMENTO');
  const fechavel = semEncerramento && c.anteriorAoSistema && ficha.pode.tarefa;
  return (
    <div className={`pme-ciclo ${atual ? 'atual' : ''}`}>
      <div className="pme-topo">
        <div className="min-w-0">
          <b className="pme-nome">{nomePme(c.numero, c.titulo)}</b>
          {c.titulo && <span className="pme-num">{nomePme(c.numero)}</span>}
        </div>
        <div className="pme-tags">
          {c.anteriorAoSistema && (
            <span className="tag" title="Registrado sem tarefas automáticas">
              Antes do sistema
            </span>
          )}
          <TagCiclo c={c} />
        </div>
      </div>
      <dl className="pme-datas">
        <div>
          <dt>Enviado</dt>
          <dd>
            {dataBR(c.enviadoEm)}
            {ficha.pode.pme && (
              <button
                type="button"
                className="pl-link"
                aria-label={`Corrigir a data de envio do ${nomePme(c.numero)}`}
                onClick={() => abrir({ tipo: 'data', c })}
              >
                Corrigir
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>Prazo</dt>
          <dd>{dataBR(c.prazo)}</dd>
        </div>
        {(c.concluidoEm || fechavel) && (
          <div>
            <dt>Concluído</dt>
            <dd>
              {c.concluidoEm ? dataBR(c.concluidoEm) : '—'}
              {fechavel && (
                <button
                  type="button"
                  className="pl-link"
                  aria-label={`${c.concluidoEm ? 'Reabrir' : 'Concluir'} o ${nomePme(c.numero)}`}
                  onClick={() => abrir({ tipo: 'fechar', c })}
                >
                  {c.concluidoEm ? 'Reabrir' : 'Informar'}
                </button>
              )}
            </dd>
          </div>
        )}
        {!c.concluidoEm && c.naoConcluidoEm && (
          <div>
            <dt>Encerrado</dt>
            <dd>{dataBR(c.naoConcluidoEm)}</dd>
          </div>
        )}
        {c.linkMaterial && (
          <div>
            <dt>Material</dt>
            <dd>
              <a className="pl-link" href={c.linkMaterial} target="_blank" rel="noreferrer">
                Abrir
              </a>
            </dd>
          </div>
        )}
      </dl>
      {(c.pctTarefas !== null || !c.anteriorAoSistema) && (
        // % do PME (E5): só tarefas. Juntar as metas num número único está com a Eduarda.
        <Barra
          rotulo="Tarefas feitas"
          nome={`Tarefas do ${nomePme(c.numero)}`}
          pct={c.pctTarefas}
          vazio="Sem tarefas"
          dica="Tarefas feitas ÷ todas as tarefas do PME (parcial não conta)"
        />
      )}
      {doCiclo.length > 0 && (
        <ul className="pme-tarefas">
          {doCiclo.map((t) => (
            <Tarefa key={t.id} t={t} atualizar={atualizar} />
          ))}
        </ul>
      )}
      {daReuniao > 0 && (
        <p className="pme-nota">
          {daReuniao === 1
            ? 'Mais 1 tarefa combinada em reunião conta neste PME (veja em Tarefas).'
            : `Mais ${daReuniao} tarefas combinadas em reunião contam neste PME (veja em Tarefas).`}
        </p>
      )}
    </div>
  );
}

/** Ficha > Jornada: o PME atual, o envio do próximo e os ciclos anteriores (Fase 2, §7). */
export function PmeAtual({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const [janela, setJanela] = useState<Janela>(null);
  const [data, setData] = useState(ficha.hoje);
  const [concluido, setConcluido] = useState('');
  const [numero, setNumero] = useState(1);
  const [atual, ...anteriores] = ficha.ciclos;
  const proximo = (atual?.numero ?? 0) + 1;
  const aberto = atual && !atual.concluidoEm && !atual.naoConcluidoEm ? atual : null;
  const podeEnviar = ficha.pode.pme && ficha.status === 'ATIVO' && proximo <= ULTIMO_PME;
  const podeAnterior =
    ficha.pode.pme &&
    (ficha.status === 'ATIVO' || ficha.status === 'PAUSADO') &&
    proximo <= ULTIMO_PME &&
    (ficha.importada || ficha.ciclos.length === 0);

  const abrir = (j: Janela) => {
    setData(j && j.tipo === 'data' ? j.c.enviadoEm : ficha.hoje);
    setConcluido(j && j.tipo === 'fechar' ? ficha.hoje : '');
    setNumero(proximo);
    setJanela(j);
  };
  const fechar = () => setJanela(null);
  const depois = () => {
    fechar();
    atualizar();
  };

  return (
    <section className="pme" aria-label="PME atual">
      <div className="pme-cab">
        <h3>PME atual</h3>
        {(podeEnviar || podeAnterior) && (
          <div className="pme-acoes">
            {podeAnterior && (
              <button type="button" className={sm} onClick={() => abrir({ tipo: 'anterior' })}>
                PME anterior ao sistema
              </button>
            )}
            {podeEnviar && (
              <button
                type="button"
                className={aberto ? sm : `${button} sm`}
                onClick={() => abrir({ tipo: 'envio' })}
              >
                <Icone d={ICONES.mais} largura={2.2} />
                Registrar envio do {nomePme(proximo)}
              </button>
            )}
          </div>
        )}
      </div>
      {atual ? (
        <Ciclo c={atual} ficha={ficha} atual abrir={abrir} atualizar={atualizar} />
      ) : (
        <p className="pme-vazio-txt">
          Nenhum PME enviado ainda.
          {podeEnviar ? ' Registre o envio do 1º PME para abrir o primeiro ciclo.' : ''}
        </p>
      )}
      {anteriores.length > 0 && (
        <details className="pme-hist">
          <summary>
            PMEs anteriores <span>{anteriores.length}</span>
            <Icone d={ICONES.abaixo} />
          </summary>
          {anteriores.map((c) => (
            <Ciclo
              key={c.id}
              c={c}
              ficha={ficha}
              atual={false}
              abrir={abrir}
              atualizar={atualizar}
            />
          ))}
        </details>
      )}

      {janela?.tipo === 'envio' && (
        <Dialogo
          titulo={`Registrar envio do ${nomePme(proximo)}`}
          texto="O ciclo nasce com as atividades extras do catálogo e a tarefa de encerramento, com prazo de 30 dias."
          rotulo="Registrar envio"
          podeConfirmar={!!data}
          onFechar={fechar}
          onConfirmar={async () => {
            await clientApi(`/api/mentoria/inscricoes/${ficha.id}/ciclos`, 'POST', {
              enviadoEm: data,
            });
            depois();
          }}
        >
          <label className="f">
            <span>Data do envio</span>
            <input
              className={control}
              type="date"
              max={ficha.hoje}
              value={data}
              required
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          {aberto && (
            <p className="pme-aviso">
              O {nomePme(aberto.numero)} ainda não foi encerrado e ficará como não concluído.
            </p>
          )}
        </Dialogo>
      )}
      {janela?.tipo === 'anterior' && (
        <Dialogo
          titulo="PME anterior ao sistema"
          texto="Para quem já estava na jornada: registre o PME atual com a data em que foi enviado. Não cria tarefas."
          rotulo="Registrar"
          podeConfirmar={!!data}
          onFechar={fechar}
          onConfirmar={async () => {
            await clientApi(`/api/mentoria/inscricoes/${ficha.id}/ciclos/anterior`, 'POST', {
              numero,
              enviadoEm: data,
              concluidoEm: concluido || null,
            });
            depois();
          }}
        >
          <label className="f">
            <span>PME</span>
            <select
              className={control}
              value={numero}
              onChange={(e) => setNumero(Number(e.target.value))}
            >
              {Array.from({ length: ULTIMO_PME - proximo + 1 }, (_, k) => proximo + k).map((n) => (
                <option key={n} value={n}>
                  {nomePme(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            <span>Data do envio</span>
            <input
              className={control}
              type="date"
              max={ficha.hoje}
              value={data}
              required
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <label className="f">
            <span>Concluído em (se já fechou)</span>
            <input
              className={control}
              type="date"
              max={ficha.hoje}
              value={concluido}
              onChange={(e) => setConcluido(e.target.value)}
            />
          </label>
        </Dialogo>
      )}
      {janela?.tipo === 'data' && (
        <Dialogo
          titulo={`Data de envio do ${nomePme(janela.c.numero)}`}
          texto="O prazo do ciclo e das tarefas dele acompanha a nova data."
          rotulo="Salvar"
          podeConfirmar={!!data}
          onFechar={fechar}
          onConfirmar={async () => {
            await clientApi(`/api/mentoria/ciclos/${janela.c.id}`, 'PATCH', {
              version: janela.c.version,
              enviadoEm: data,
            });
            depois();
          }}
        >
          <label className="f">
            <span>Data do envio</span>
            <input
              className={control}
              type="date"
              max={ficha.hoje}
              value={data}
              required
              onChange={(e) => setData(e.target.value)}
            />
          </label>
        </Dialogo>
      )}
      {janela?.tipo === 'fechar' && (
        <Dialogo
          titulo={
            janela.c.concluidoEm
              ? `Reabrir o ${nomePme(janela.c.numero)}`
              : `Concluir o ${nomePme(janela.c.numero)}`
          }
          texto={
            janela.c.concluidoEm
              ? 'O ciclo volta a contar o prazo.'
              : 'Ciclo de antes do sistema, sem tarefa de encerramento: informe quando o mentorado fechou.'
          }
          rotulo={janela.c.concluidoEm ? 'Reabrir' : 'Concluir'}
          podeConfirmar={!!janela.c.concluidoEm || !!concluido}
          onFechar={fechar}
          onConfirmar={async () => {
            await clientApi(`/api/mentoria/ciclos/${janela.c.id}`, 'PATCH', {
              version: janela.c.version,
              concluidoEm: janela.c.concluidoEm ? null : concluido,
            });
            depois();
          }}
        >
          {!janela.c.concluidoEm && (
            <label className="f">
              <span>Concluído em</span>
              <input
                className={control}
                type="date"
                min={janela.c.enviadoEm}
                max={ficha.hoje}
                value={concluido}
                required
                onChange={(e) => setConcluido(e.target.value)}
              />
            </label>
          )}
        </Dialogo>
      )}
    </section>
  );
}
