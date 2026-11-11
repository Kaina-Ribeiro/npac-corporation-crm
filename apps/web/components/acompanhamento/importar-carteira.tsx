'use client';
import {
  MENTORIAS,
  chaveParecidos,
  moduloDoLegado,
  type DecisoesImportacao,
  type ItemPrevia,
  type Mentoria,
  type PreviaImportacao,
  type ResultadoImportacao,
  type StatusImportacao,
} from '@npac/shared/mentoria';
import { useEffect, useRef, useState } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';

const sm = (classe: string) => `${classe} sm`;

type Fonte = 'dashboard' | 'linhaDoTempo' | 'rdv' | 'planilha';
const FONTE_LABEL: Record<Fonte, string> = {
  dashboard: 'Dashboard',
  linhaDoTempo: 'Linha do tempo',
  rdv: 'RDV',
  planilha: 'Planilha da equipe',
};
const CHAVE_MODULO = {
  dashboard: 'dashboard',
  'linha-do-tempo': 'linhaDoTempo',
  rdv: 'rdv',
} as const;

type Arquivos = {
  gerenciador: { dashboard?: unknown[]; linhaDoTempo?: unknown[]; rdv?: unknown[] };
  planilhaBase64?: string;
};

const STATUS: [StatusImportacao, string][] = [
  ['ATIVO', 'Ativo'],
  ['CANCELADO', 'Cancelado'],
  ['CONCLUIDO', 'Concluído'],
];

/** Base64 sem carregar string gigante por concatenação: o `FileReader` já devolve pronto. */
function paraBase64(arquivo: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => erro(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(arquivo);
  });
}

function Numero({ n, rotulo }: { n: number; rotulo: string }) {
  return (
    <div className="pl">
      <small>{rotulo}</small>
      <b>{n}</b>
    </div>
  );
}

/** Configurações > Importação: arquivos, prévia com as decisões e confirmação. */
export function ImportarCarteira() {
  const entrada = useRef<HTMLInputElement>(null);
  const [nomes, setNomes] = useState<Partial<Record<Fonte, string>>>({});
  const [arquivos, setArquivos] = useState<Arquivos>({ gerenciador: {} });
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [decisoes, setDecisoes] = useState<DecisoesImportacao>({});
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null);

  // No celular a aba Importação nasce fora da tela: traz a aba ativa para o meio.
  useEffect(() => {
    document.querySelector('.ac .tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

  async function escolher(lista: FileList | null) {
    if (!lista?.length) return;
    setErro('');
    setPrevia(null);
    const novo: Arquivos = {
      gerenciador: { ...arquivos.gerenciador },
      planilhaBase64: arquivos.planilhaBase64,
    };
    const achados = { ...nomes };
    try {
      for (const f of Array.from(lista)) {
        if (f.name.toLowerCase().endsWith('.xlsx')) {
          novo.planilhaBase64 = await paraBase64(f);
          achados.planilha = f.name;
          continue;
        }
        let dados: unknown;
        try {
          dados = JSON.parse(await f.text());
        } catch {
          throw new Error(`${f.name} não é um .json válido.`);
        }
        if (!Array.isArray(dados)) throw new Error(`${f.name} não é uma lista de registros.`);
        const modulo = moduloDoLegado(dados);
        if (!modulo) throw new Error(`Não reconheci de qual módulo é ${f.name}.`);
        const chave = CHAVE_MODULO[modulo];
        novo.gerenciador[chave] = dados;
        achados[chave] = f.name;
      }
      setArquivos(novo);
      setNomes(achados);
    } catch (e) {
      setErro((e as Error).message);
    }
    if (entrada.current) entrada.current.value = '';
  }

  const corpo = (d: DecisoesImportacao) => ({
    ...(Object.keys(arquivos.gerenciador).length ? { gerenciador: arquivos.gerenciador } : {}),
    ...(arquivos.planilhaBase64 ? { planilhaBase64: arquivos.planilhaBase64 } : {}),
    decisoes: d,
  });

  async function verPrevia(d = decisoes) {
    setErro('');
    setOcupado(true);
    try {
      setPrevia(
        await clientApi<PreviaImportacao>(
          '/api/mentoria/carteira/importar/previa',
          'POST',
          corpo(d),
        ),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function decidir(d: DecisoesImportacao) {
    setDecisoes(d);
    void verPrevia(d);
  }

  if (feito)
    return (
      <section className="card vazio">
        <h2>
          {feito.importados}{' '}
          {feito.importados === 1 ? 'inscrição importada' : 'inscrições importadas'}
        </h2>
        <p>
          {feito.ignorados > 0
            ? `${feito.ignorados} já estavam cadastradas e ficaram como estavam.`
            : 'Elas já aparecem em Mentorados.'}
        </p>
      </section>
    );

  const fontes = Object.entries(nomes) as [Fonte, string][];
  const casais = previa?.novos.filter((n) => n.tipo === 'CASAL') ?? [];
  const cancelados = previa?.novos.filter((n) => n.status !== 'ATIVO') ?? [];
  const faltaRotulo = previa?.rotulosSemMentoria.length ?? 0;

  const casal = (n: ItemPrevia, campo: 'pessoa1' | 'pessoa2', valor: string) =>
    setDecisoes((d) => ({
      ...d,
      casais: {
        ...d.casais,
        [n.chave]: {
          pessoa1: d.casais?.[n.chave]?.pessoa1 ?? n.pessoa1,
          pessoa2: d.casais?.[n.chave]?.pessoa2 ?? n.pessoa2,
          [campo]: valor,
        },
      },
    }));

  return (
    <div className="view">
      <section className="card sec">
        <header>
          <h2>Arquivos</h2>
        </header>
        <p className="ob-nota imp-texto">
          Os 3 <code>.json</code> do gerenciador e a planilha <code>.xlsx</code> da equipe. Pode ser
          só um deles. O CPF da planilha nunca é lido.
        </p>
        <input
          ref={entrada}
          id="imp-arquivos"
          className="imp-input"
          type="file"
          multiple
          accept=".json,.xlsx"
          aria-label="Escolher arquivos"
          onChange={(e) => void escolher(e.target.files)}
        />
        <div className="ob-acoes imp-botoes">
          <label htmlFor="imp-arquivos" className={sm(quietButton)}>
            Escolher arquivos
          </label>
          <button
            type="button"
            className={sm(button)}
            disabled={!fontes.length || ocupado}
            onClick={() => void verPrevia()}
          >
            Ver prévia
          </button>
        </div>
        {fontes.length > 0 && (
          <ul className="imp-lista">
            {fontes.map(([fonte, nome]) => (
              <li key={fonte}>
                <b>{FONTE_LABEL[fonte]}</b>
                <span>{nome}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormError message={erro} />

      {previa && (
        <>
          <section className="card sec">
            <header>
              <h2>Prévia</h2>
            </header>
            <div className="kp">
              <Numero n={previa.totais.novos} rotulo="Novas inscrições" />
              <Numero n={previa.totais.casais} rotulo="Casais" />
              <Numero n={previa.totais.cancelados} rotulo="Canceladas" />
              <Numero n={previa.totais.ignorados} rotulo="Já cadastradas" />
            </div>
          </section>

          {previa.rotulosSemMentoria.length > 0 && (
            <section className="card sec">
              <header>
                <h2>Escolha a mentoria de cada grupo</h2>
              </header>
              {previa.rotulosSemMentoria.map((r) => (
                <label className="pr" key={r.rotulo}>
                  <span>
                    {r.rotulo} ({r.total})
                  </span>
                  <select
                    className="pv"
                    aria-label={`Mentoria de ${r.rotulo}`}
                    value={decisoes.rotulos?.[r.rotulo] ?? ''}
                    onChange={(e) =>
                      decidir({
                        ...decisoes,
                        rotulos: {
                          ...decisoes.rotulos,
                          [r.rotulo]: e.target.value as Mentoria,
                        },
                      })
                    }
                  >
                    <option value="">Escolher</option>
                    {MENTORIAS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </section>
          )}

          {previa.parecidos.length > 0 && (
            <section className="card sec">
              <header>
                <h2>Nomes parecidos</h2>
              </header>
              {previa.parecidos.map(([a, b]) => {
                const k = chaveParecidos(a, b);
                return (
                  <div className="imp-par" key={k}>
                    <div>
                      <b>{a}</b>
                      <span>e {b}</span>
                    </div>
                    <div className="ob-acoes">
                      <button
                        type="button"
                        className={sm(quietButton)}
                        onClick={() =>
                          decidir({
                            ...decisoes,
                            parecidos: { ...decisoes.parecidos, [k]: 'JUNTAR' },
                          })
                        }
                      >
                        É a mesma pessoa
                      </button>
                      <button
                        type="button"
                        className={sm(quietButton)}
                        onClick={() =>
                          decidir({
                            ...decisoes,
                            parecidos: { ...decisoes.parecidos, [k]: 'SEPARAR' },
                          })
                        }
                      >
                        São diferentes
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {casais.length > 0 && (
            <details className="card sec imp-det">
              <summary>Conferir os casais ({casais.length})</summary>
              {casais.map((n) => (
                <div className="imp-casal" key={n.chave}>
                  <input
                    className={control}
                    aria-label={`Pessoa 1 de ${n.nome}`}
                    defaultValue={n.pessoa1}
                    maxLength={200}
                    onChange={(e) => casal(n, 'pessoa1', e.target.value)}
                  />
                  <input
                    className={control}
                    aria-label={`Pessoa 2 de ${n.nome}`}
                    defaultValue={n.pessoa2 ?? ''}
                    maxLength={200}
                    onChange={(e) => casal(n, 'pessoa2', e.target.value)}
                  />
                </div>
              ))}
              <button
                type="button"
                className={`${sm(quietButton)} imp-aplicar`}
                onClick={() => void verPrevia()}
              >
                Aplicar correções
              </button>
            </details>
          )}

          {cancelados.length > 0 && (
            <details className="card sec imp-det">
              <summary>Cancelados na planilha ({cancelados.length})</summary>
              {cancelados.map((n) => (
                <label className="pr" key={n.chave}>
                  <span>{n.nome}</span>
                  <select
                    className="pv"
                    aria-label={`Status de ${n.nome}`}
                    value={n.status}
                    onChange={(e) =>
                      decidir({
                        ...decisoes,
                        status: {
                          ...decisoes.status,
                          [n.chave]: e.target.value as StatusImportacao,
                        },
                      })
                    }
                  >
                    {STATUS.map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </details>
          )}

          {(previa.naoCasados.length > 0 || previa.ignorados.length > 0) && (
            <details className="card sec imp-det">
              <summary>
                Em uma fonte só ({previa.naoCasados.length}) e já cadastrados (
                {previa.ignorados.length})
              </summary>
              {previa.naoCasados.length > 0 && (
                <p className="ob-nota">
                  <b>Em uma fonte só:</b> {previa.naoCasados.join(', ')}.
                </p>
              )}
              {previa.ignorados.length > 0 && (
                <p className="ob-nota">
                  <b>Já cadastrados, ficam de fora:</b> {previa.ignorados.join(', ')}.
                </p>
              )}
            </details>
          )}

          <div className="ob-acoes">
            <button
              type="button"
              className={button}
              disabled={ocupado || faltaRotulo > 0 || previa.totais.novos === 0}
              onClick={() => setConfirmar(true)}
            >
              Importar {previa.totais.novos}{' '}
              {previa.totais.novos === 1 ? 'inscrição' : 'inscrições'}
            </button>
            {faltaRotulo > 0 && (
              <p className="ob-nota imp-texto">Falta escolher a mentoria dos grupos acima.</p>
            )}
          </div>
        </>
      )}

      {confirmar && previa && (
        <Dialogo
          titulo={`Importar ${previa.totais.novos} ${
            previa.totais.novos === 1 ? 'inscrição' : 'inscrições'
          }?`}
          texto="Elas entram sem onboarding e sem itens na Fila. Quem já está cadastrado não muda."
          rotulo="Importar"
          onConfirmar={async () => {
            setFeito(
              await clientApi<ResultadoImportacao>(
                '/api/mentoria/carteira/importar',
                'POST',
                corpo(decisoes),
              ),
            );
          }}
          onFechar={() => setConfirmar(false)}
        />
      )}
    </div>
  );
}
