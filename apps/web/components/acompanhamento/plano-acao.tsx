'use client';
import { GATILHO_LABEL, type AcaoDTO } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { button, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion, salvarCampo } from '@/lib/acompanhamento-saver';
import { CampoPr, useCampo } from './campo';
import { IndicadorSalvo } from './indicador-salvo';
import { enviarFoto } from './midia';
import { chaveAcao, responsavelDe, TagAcao } from './plano-mentorado';
import { dataBR, ICONES, Icone } from './ui';

function Observacao({
  chave,
  valor,
  editavel,
}: {
  chave: string;
  valor: string | null;
  editavel: boolean;
}) {
  const c = useCampo(chave, 'observacao', valor);
  if (!editavel)
    return (
      <div>
        <small>Observação</small>
        <p>{valor || '—'}</p>
      </div>
    );
  return (
    <label>
      <small>Observação</small>
      <textarea
        value={c.texto}
        onChange={(e) => c.setTexto(e.target.value)}
        onFocus={c.aoFocar}
        onBlur={(e) => c.aoSair(e.target.value)}
      />
    </label>
  );
}

/** A ação aberta: página própria, com os passos e o registro do que foi feito. */
export function PlanoAcao({ acao }: { acao: AcaoDTO }) {
  const router = useRouter();
  const chave = chaveAcao(acao);
  const ed = acao.podeEditar;
  const [feitos, setFeitos] = useState(acao.itensFeitos);
  const [erro, setErro] = useState('');
  const arquivo = useRef<HTMLInputElement>(null);
  const atualizar = () =>
    void filaDeSalvamento()
      .idle()
      .then(() => router.refresh());

  useEffect(() => {
    registrarVersion(chave, acao.version);
    setFeitos(acao.itensFeitos);
  }, [acao, chave]);

  function marcar(item: string) {
    const novo = feitos.includes(item) ? feitos.filter((i) => i !== item) : [...feitos, item];
    setFeitos(novo);
    salvarCampo(chave, 'itensFeitos', novo, JSON.stringify(acao.itensFeitos));
    atualizar();
  }

  async function anexar(f: File) {
    setErro('');
    try {
      await filaDeSalvamento().idle();
      await enviarFoto('acao-evidencia', acao.id, f);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function remover() {
    setErro('');
    try {
      await clientApi(`/api/mentoria/midia/${acao.evidenciaMidiaId}`, 'DELETE');
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const feita = acao.status === 'FEITA';
  return (
    <section className="view pl-acao">
      <Link className="back" href="/acompanhamento/plano">
        <Icone d={ICONES.voltar} />
        Plano dos 12 meses
      </Link>
      <div>
        <h1 className="h1">{acao.foco}</h1>
        <p className="sub">
          Mês {acao.mes} de{' '}
          <Link
            className="underline"
            href={`/acompanhamento/ficha/${acao.inscricaoId}?aba=jornada`}
          >
            {acao.nome}
          </Link>
        </p>
        <div className="fh-tags">
          <span className="tag gold">{acao.mentoria}</span>
          <TagAcao a={acao} />
          <IndicadorSalvo />
        </div>
      </div>

      <div className="pl-a-corpo">
        <section className="card pa">
          <h3>O que fazer</h3>
          <p className="pl-a-texto">{acao.acao}</p>
          <div className="pr">
            <span>Data prevista</span>
            <span className="pv-fixo">{dataBR(acao.dataPrevista)}</span>
          </div>
          {acao.gatilho === 'FLEXIVEL' && (
            <div className="pr">
              <span>Até</span>
              <span className="pv-fixo">{dataBR(acao.dataLimite)}</span>
            </div>
          )}
          <div className="pr">
            <span>Gatilho</span>
            <span className="pv-fixo">{GATILHO_LABEL[acao.gatilho]}</span>
          </div>
          <div className="pr">
            <span>Responsável</span>
            <span className="pv-fixo">{responsavelDe(acao)}</span>
          </div>
          {feita && acao.feitaPor && (
            <div className="pr">
              <span>Feita por</span>
              <span className="pv-fixo">{acao.feitaPor}</span>
            </div>
          )}
          {!ed && <p className="ob-nota">Esta ação é de outro perfil: você só acompanha.</p>}
          {ed && (
            <div className="ob-acoes pl-a-acoes">
              <button
                type="button"
                className={feita ? quietButton : button}
                onClick={() => {
                  salvarCampo(chave, 'status', feita ? 'PENDENTE' : 'FEITA', acao.status);
                  atualizar();
                }}
              >
                {feita ? 'Reabrir' : 'Marcar feita'}
              </button>
            </div>
          )}
        </section>

        <section className="card pa">
          {acao.itens.length > 0 && (
            <>
              <h3>Passos</h3>
              <ul className="pl-passos">
                {acao.itens.map((item) => {
                  const on = feitos.includes(item);
                  return (
                    <li key={item}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={item}
                        className={`check sm ${on ? 'done' : ''}`}
                        disabled={!ed}
                        onClick={() => marcar(item)}
                      >
                        <Icone d={ICONES.check} largura={3} />
                      </button>
                      <span>{item}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <h3>Registro</h3>
          <CampoPr
            chave={chave}
            rotulo="Link"
            campo="evidenciaLink"
            valor={acao.evidenciaLink}
            editavel={ed}
            inputMode="url"
            placeholder="https://"
          />
          <div className="pr">
            <span>Foto</span>
            <div className="pl-foto">
              {acao.evidenciaMidiaId && (
                // Stream autenticado da API: <img> simples, sem o otimizador do Next.
                <img src={`/api/mentoria/midia/${acao.evidenciaMidiaId}`} alt="Evidência da ação" />
              )}
              {ed && (
                <>
                  <input
                    ref={arquivo}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="imp-input"
                    aria-label="Anexar foto"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void anexar(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className={`${quietButton} sm`}
                    onClick={() => arquivo.current?.click()}
                  >
                    {acao.evidenciaMidiaId ? 'Trocar' : 'Anexar'}
                  </button>
                  {acao.evidenciaMidiaId && (
                    <button
                      type="button"
                      className={`${quietButton} sm`}
                      onClick={() => void remover()}
                    >
                      Remover
                    </button>
                  )}
                </>
              )}
              {!ed && !acao.evidenciaMidiaId && <span className="pv-fixo">—</span>}
            </div>
          </div>
          <div className="tx pl-tx">
            <Observacao chave={chave} valor={acao.observacao} editavel={ed} />
          </div>
          <FormError message={erro} />
        </section>
      </div>
    </section>
  );
}
