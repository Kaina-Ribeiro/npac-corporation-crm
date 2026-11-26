'use client';
import {
  BLOCO_PLURAL,
  INSCRICAO_STATUS_LABEL,
  MOTIVO_IGNORADA_LABEL,
  MOTIVOS_IGNORADA,
  type ColunaCronogramaPrevia,
  type FichaCronogramaImportacao,
  type PreviaCronograma,
  type ResultadoCronograma,
} from '@npac/shared/mentoria';
import { useRef, useState } from 'react';
import { button, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { IconeCr } from './cronograma-ui';
import { ICONES, Icone } from './ui';

const SO_CSV = 'Baixe a aba CRONOGRAMA em CSV';
const ICONE_ARQUIVO = 'M6 3h8l4 4v14H6zM14 3v4h4';
/** Linhas de revisão à vista antes do "Ver as outras N". */
const A_VISTA = 3;

type Passo = 1 | 2 | 3;
type Filtro = 'DUVIDA' | 'SEM_FICHA';
type Arquivo = { nome: string; csv: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Mentorada Fictícia 04 · RDV · Ativo · 5º PME"; sem o nome quando é o mesmo da coluna. */
function rotuloFicha(f: FichaCronogramaImportacao, nomeDaColuna: string) {
  return [
    f.nome === nomeDaColuna ? null : f.nome,
    f.mentoria,
    INSCRICAO_STATUS_LABEL[f.status],
    f.pmeAtual ? `${f.pmeAtual}º PME` : 'sem PME',
  ]
    .filter(Boolean)
    .join(' · ');
}

function detalheColuna(c: ColunaCronogramaPrevia) {
  return [
    `Coluna ${c.coluna}`,
    c.maiorMes ? `vai até o ${c.maiorMes}º mês` : null,
    plural(c.marcas, 'item', 'itens'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function Passos({ passo, feito }: { passo: Passo; feito: boolean }) {
  const nomes = ['Arquivo', 'Revisar colunas', 'Importar'];
  return (
    <ol className="cr-passos" aria-label="Passos da importação">
      {nomes.map((nome, k) => {
        const n = (k + 1) as Passo;
        const pronto = feito || n < passo;
        return (
          <li
            key={nome}
            className={pronto ? 'feito' : n === passo ? 'on' : ''}
            aria-current={!feito && n === passo ? 'step' : undefined}
          >
            {k > 0 && <span className="lin" aria-hidden="true" />}
            <i>{pronto ? <IconeCr d={ICONES.check} /> : n}</i>
            {nome}
          </li>
        );
      })}
    </ol>
  );
}

function LinhaArquivo({
  arquivo,
  previa,
  trocar,
}: {
  arquivo: Arquivo;
  previa: PreviaCronograma;
  trocar?: () => void;
}) {
  const itens = previa.itens.reduce((s, i) => s + i.novos + i.existentes, 0);
  return (
    <ul className="cr-lst cr-arquivo">
      <li>
        <div className="pl-mod cr-row ic">
          <span className="ico">
            <IconeCr d={ICONE_ARQUIVO} classe="cr-i" />
          </span>
          <div className="min-w-0">
            <span className="t">{arquivo.nome}</span>
            <span className="d">
              {plural(itens, 'item', 'itens')} em 5 blocos ·{' '}
              {plural(previa.colunas.length, 'coluna', 'colunas')} ·{' '}
              {previa.ligadas === 1 ? '1 já ligada' : `${previa.ligadas} já ligadas`} a uma ficha
            </span>
          </div>
          {trocar && (
            <button type="button" className={`${quietButton} sm`} onClick={trocar}>
              Trocar
            </button>
          )}
        </div>
      </li>
    </ul>
  );
}

function Numero({ rotulo, detalhe, n }: { rotulo: string; detalhe?: string; n: number }) {
  return (
    <li>
      <div className="pl-mod cr-row">
        <div className="min-w-0">
          <span className="t">{rotulo}</span>
          {detalhe && <span className="d">{detalhe}</span>}
        </div>
        <b className="cr-num">{n}</b>
      </div>
    </li>
  );
}

/**
 * Configurações → Importação, card "Planilha do cronograma" (NPAC-60, fase 3; só a Admin): o CSV da aba
 * CRONOGRAMA em 3 passos (Arquivo → Revisar colunas → Importar). A tela não lê o arquivo: manda o texto
 * para a prévia, que casa as colunas com as fichas; a Admin decide as dúvidas e importa.
 */
export function ImportarCronograma() {
  const entrada = useRef<HTMLInputElement>(null);
  const [passo, setPasso] = useState<Passo>(1);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [previa, setPrevia] = useState<PreviaCronograma | null>(null);
  const [decisoes, setDecisoes] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>('DUVIDA');
  const [todas, setTodas] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<ResultadoCronograma | null>(null);

  const corpo = (a: Arquivo, d: Record<string, string>) => ({
    csv: a.csv,
    arquivo: a.nome,
    decisoes: Object.fromEntries(Object.entries(d).filter(([, v]) => v)),
  });

  async function pedirPrevia(a: Arquivo, d: Record<string, string>) {
    return clientApi<PreviaCronograma>(
      '/api/mentoria/cronograma/importar/previa',
      'POST',
      corpo(a, d),
    );
  }

  async function escolher(lista: FileList | null) {
    const f = lista?.[0];
    if (entrada.current) entrada.current.value = '';
    if (!f) return;
    setErro('');
    if (!/\.csv$/i.test(f.name)) {
      setErro(SO_CSV);
      return;
    }
    setOcupado(true);
    try {
      const a = { nome: f.name, csv: await f.text() };
      const p = await pedirPrevia(a, {});
      setArquivo(a);
      setPrevia(p);
      setDecisoes({});
      setTodas(false);
      setFeito(null);
      const duvidas = p.colunas.filter((c) => c.situacao === 'DUVIDA').length;
      setFiltro(
        duvidas || !p.colunas.some((c) => c.situacao === 'SEM_FICHA') ? 'DUVIDA' : 'SEM_FICHA',
      );
      setPasso(2);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function continuar() {
    if (!arquivo) return;
    setErro('');
    setOcupado(true);
    try {
      setPrevia(await pedirPrevia(arquivo, decisoes));
      setPasso(3);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function importar() {
    if (!arquivo) return;
    setErro('');
    setOcupado(true);
    try {
      setFeito(
        await clientApi<ResultadoCronograma>(
          '/api/mentoria/cronograma/importar',
          'POST',
          corpo(arquivo, decisoes),
        ),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const recomecar = () => {
    setPasso(1);
    setArquivo(null);
    setPrevia(null);
    setDecisoes({});
    setFeito(null);
    setErro('');
    entrada.current?.click();
  };

  const revisar = previa?.colunas.filter(
    (c) => c.situacao === 'DUVIDA' || c.situacao === 'SEM_FICHA',
  );
  const contagem = {
    DUVIDA: revisar?.filter((c) => c.situacao === 'DUVIDA').length ?? 0,
    SEM_FICHA: revisar?.filter((c) => c.situacao === 'SEM_FICHA').length ?? 0,
  };
  const doFiltro = revisar?.filter((c) => c.situacao === filtro) ?? [];
  const visiveis = todas ? doFiltro : doFiltro.slice(0, A_VISTA);

  return (
    <section className="card sec cr-imp">
      <header>
        <h2>Planilha do cronograma</h2>
      </header>
      <Passos passo={passo} feito={!!feito} />
      <input
        ref={entrada}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Escolher o CSV do cronograma"
        onChange={(e) => void escolher(e.target.files)}
      />

      {passo === 1 && (
        <>
          <p className="cr-nota cr-imp-txt">
            O arquivo .csv da aba CRONOGRAMA: no Google Planilhas, abra a aba e use Arquivo → Fazer
            download → Valores separados por vírgula (.csv).
          </p>
          <div className="cr-fim">
            <span className="cr-nota">Rodar de novo não duplica nada: só entra o que falta.</span>
            <button
              type="button"
              className={button}
              disabled={ocupado}
              onClick={() => entrada.current?.click()}
            >
              {ocupado ? 'Lendo…' : 'Escolher arquivo'}
            </button>
          </div>
        </>
      )}

      {passo === 2 && arquivo && previa && revisar && (
        <>
          <LinhaArquivo arquivo={arquivo} previa={previa} trocar={recomecar} />
          <div className="cr-top cr-rev">
            <div className="cr-cab">
              <h3>
                Para revisar<span>{revisar.length}</span>
              </h3>
              <small>sem escolha, a coluna fica de fora</small>
            </div>
            {revisar.length > 0 && (
              <div className="cr-rola">
                <div className="seg" role="group" aria-label="Colunas para revisar">
                  {(['DUVIDA', 'SEM_FICHA'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={filtro === f ? 'on' : ''}
                      aria-pressed={filtro === f}
                      onClick={() => {
                        setFiltro(f);
                        setTodas(false);
                      }}
                    >
                      {f === 'DUVIDA' ? 'Em dúvida' : 'Sem ficha'}
                      <em>{contagem[f]}</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {doFiltro.length ? (
            <ul className="cr-lst">
              {visiveis.map((c) => {
                const opcoes = c.situacao === 'DUVIDA' ? c.candidatas : previa.fichas;
                const id = `cr-col-${c.indice}`;
                return (
                  <li key={c.indice}>
                    <div className="cr-col">
                      <div className="min-w-0">
                        <label className="t" htmlFor={id}>
                          {c.nome || 'Sem nome'}
                        </label>
                        <span className="d">{detalheColuna(c)}</span>
                      </div>
                      <select
                        id={id}
                        value={decisoes[c.indice] ?? ''}
                        onChange={(e) => setDecisoes({ ...decisoes, [c.indice]: e.target.value })}
                      >
                        <option value="">Escolher a ficha…</option>
                        {opcoes.map((f) => (
                          <option key={f.id} value={f.id}>
                            {rotuloFicha(f, c.nome)}
                          </option>
                        ))}
                        <option value="IGNORAR">Ignorar esta coluna</option>
                      </select>
                      {c.dica && <span className="dica">{c.dica}</span>}
                    </div>
                  </li>
                );
              })}
              {!todas && doFiltro.length > A_VISTA && (
                <li>
                  <button
                    type="button"
                    className="pl-mod cr-row cr-mais"
                    onClick={() => setTodas(true)}
                  >
                    <div className="min-w-0">
                      <span className="t">Ver as outras {doFiltro.length - A_VISTA}</span>
                    </div>
                    <Icone d={ICONES.seta} />
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="cr-nota">
              {revisar.length
                ? 'Nada nesta lista.'
                : 'Todas as colunas com marcação já estão ligadas a uma ficha.'}
            </p>
          )}
          <div className="cr-fim">
            <span className="cr-nota">Rodar de novo não duplica nada: só entra o que falta.</span>
            <div className="cr-fim-acts">
              <button type="button" className={quietButton} onClick={recomecar}>
                Voltar
              </button>
              <button
                type="button"
                className={button}
                disabled={ocupado}
                onClick={() => void continuar()}
              >
                {ocupado ? 'Conferindo…' : 'Continuar'}
              </button>
            </div>
          </div>
        </>
      )}

      {passo === 3 && arquivo && previa && (
        <>
          <LinhaArquivo arquivo={arquivo} previa={previa} />
          {feito ? (
            <>
              <div className="cr-cab">
                <h3>Importado</h3>
                <small>
                  {feito.colunas
                    ? `${plural(feito.colunas, 'ficha recebeu', 'fichas receberam')} o cronograma.`
                    : 'Nada novo: tudo já estava no sistema.'}
                </small>
              </div>
              <ul className="cr-lst">
                <Numero rotulo="Itens novos no banco" n={feito.itens} />
                <Numero rotulo="Tarefas do PME em andamento" n={feito.tarefas} />
                <Numero rotulo="Recebidos antes do sistema" n={feito.recebidos} />
                <Numero rotulo="Planejados na planilha" n={feito.planejados} />
                <Numero rotulo="Já tinham antes" n={feito.jaTinha} />
                <Numero rotulo="Não fizeram" n={feito.naoFez} />
              </ul>
              <div className="cr-fim">
                <span className="cr-nota">
                  Confira algumas fichas na aba Cronograma antes de aposentar a planilha.
                </span>
                <button type="button" className={quietButton} onClick={recomecar}>
                  Importar outro arquivo
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="cr-cab">
                <h3>O que entra</h3>
                <small>só o que falta: o que já está no sistema fica como está</small>
              </div>
              <ul className="cr-lst">
                <Numero
                  rotulo="Itens novos no banco"
                  detalhe={previa.itens
                    .filter((i) => i.novos)
                    .map((i) => `${BLOCO_PLURAL[i.bloco]} ${i.novos}`)
                    .join(' · ')}
                  n={previa.itens.reduce((s, i) => s + i.novos, 0)}
                />
                <Numero
                  rotulo="Colunas ligadas a uma ficha"
                  detalhe={`${plural(
                    previa.colunas.length - previa.ligadas,
                    'fica',
                    'ficam',
                  )} de fora`}
                  n={previa.ligadas}
                />
                <Numero
                  rotulo="Tarefas do PME em andamento"
                  detalhe="o mês do PME aberto vira tarefa, com feita ou não feita"
                  n={previa.tarefas}
                />
                <Numero
                  rotulo="Recebidos antes do sistema"
                  detalhe="meses anteriores ao PME aberto"
                  n={previa.recebidos}
                />
                <Numero
                  rotulo="Planejados na planilha"
                  detalhe="vêm marcados no envio daquele PME"
                  n={previa.planejados}
                />
                <Numero rotulo="Já tinham antes" n={previa.jaTinha} />
                <Numero rotulo="Não fizeram" n={previa.naoFez} />
                {MOTIVOS_IGNORADA.filter((m) => previa.ignoradas[m]).map((m) => (
                  <Numero
                    key={m}
                    rotulo="Células que ficam de fora"
                    detalhe={MOTIVO_IGNORADA_LABEL[m]}
                    n={previa.ignoradas[m]}
                  />
                ))}
              </ul>
              {previa.mesmaFicha.map((m) => (
                <p key={m.inscricaoId} className="cr-nota cr-aviso">
                  As colunas {m.colunas.join(' e ')} vão para a mesma ficha ({m.nome}): juntam, e
                  fica o menor mês.
                </p>
              ))}
              <div className="cr-fim">
                <span className="cr-nota">
                  Rodar de novo não duplica nada: só entra o que falta.
                </span>
                <div className="cr-fim-acts">
                  <button
                    type="button"
                    className={quietButton}
                    onClick={() => {
                      setErro('');
                      setPasso(2);
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={ocupado}
                    onClick={() => void importar()}
                  >
                    {ocupado ? 'Importando…' : 'Importar'}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      <FormError message={erro} />
    </section>
  );
}
