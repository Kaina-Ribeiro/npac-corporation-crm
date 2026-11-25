/*
 * Protótipo do NPAC-60 (cronograma do PME), versão 2: achatado no padrão do sistema.
 * Roda DENTRO da tela real do módulo (dev, conta duda) e usa as peças que já existem: seletor `.seg`,
 * título de seção `.ob-h` ("Título N"), lista `.pl-lista` com linhas `.pl-mod` (Configurações → PMEs),
 * `.tag`, `.btn`. Só para aprovação: não é código do produto. Nomes = mentorados fictícios do seed.
 */
(() => {
  const ICON = {
    EXPERIENCIA: 'M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9zM19 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z',
    DESAFIO: 'M5 21V4m0 0h11l-1.6 4L16 12H5',
    FILME: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
    LIVRO: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    EAP: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.6l5 3.4-5 3.4z',
  };
  const NOME = { EXPERIENCIA: 'Experiência', DESAFIO: 'Desafio', FILME: 'Filme', LIVRO: 'Livro', EAP: 'EAP' };
  const PLURAL = { EXPERIENCIA: 'Experiências', DESAFIO: 'Desafios', FILME: 'Filmes', LIVRO: 'Livros', EAP: 'EAP' };
  const MODELO = { EAP: 3, EXPERIENCIA: 1, DESAFIO: 1, FILME: 2, LIVRO: 1 };
  const ORDEM = ['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP'];
  const svg = (d, cls = 'cr-i') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const MAIS = 'M12 5v14M5 12h14';
  const BUSCA = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4';
  const SETA = 'M9 6l6 6-6 6';
  const VOLTA = 'M15 18l-6-6 6-6';
  const ARQ = 'M14 3H6v18h12V7zM14 3v4h4';
  const OK = 'M5 12l4 4 10-10';
  const seta = svg(SETA, 'seta cr-seta');
  const tituloEap = (t) => t.split(' https')[0];

  const css = `
  .ac{--cr-surf:#fff;--cr-bd:rgba(60,60,67,.16)}
  .dark .ac{--cr-surf:rgba(255,255,255,.06);--cr-bd:rgba(235,235,245,.16)}
  .ac .cr-i{width:16px;height:16px;flex:none}
  .ac .cr-s{width:14px;height:14px;flex:none}
  .ac .cr-seta{width:16px;height:16px;color:var(--ink3)}
  .ac .cr-lst{list-style:none;margin:0;padding:0;border:1px solid var(--cr-bd);border-radius:14px;background:var(--cr-surf);overflow:hidden}
  .ac .cr-lst>li+li>*{border-top:1px solid var(--line)}
  .ac .pl-mod.cr-row{grid-template-columns:minmax(0,1fr) auto;min-height:52px;padding:10px 14px 10px 16px}
  .ac .cr-lst>li:first-child>*{border-top:0}
  .ac .pl-mod.cr-row.ic{grid-template-columns:24px minmax(0,1fr) auto}
  .ac .pl-mod.cr-row .t{font-weight:500;font-size:15px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .ac .pl-mod.cr-row .d{font-size:13px;color:var(--ink2)}
  .ac .pl-mod.cr-row .ico{color:var(--ink2);display:flex}
  .ac .pl-mod.cr-row.off .t{color:var(--ink2)}
  .ac .pl-mod.cr-row .q{font-size:13px;color:var(--ink2);white-space:nowrap}
  .ac .cr-gh{display:flex;align-items:center;gap:8px;padding:10px 16px 8px;font-size:13px;font-weight:600;color:var(--ink2);background:rgba(120,120,128,.05)}
  .ac .cr-gh .n{margin-left:auto;color:var(--gold-text);font-weight:600}
  .ac .cr-add{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;font-size:14px;font-weight:600;color:var(--ink2);cursor:pointer}
  .ac .cr-link{color:var(--tag-info);font-weight:600}
  .ac .cr-cab{display:flex;align-items:baseline;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;margin:4px 0 8px}
  .ac .cr-cab h3{font-size:15px;font-weight:600;letter-spacing:-.015em;margin:0;display:flex;gap:8px;align-items:baseline}
  .ac .cr-cab h3 span{font-size:13px;color:var(--ink3)}
  .ac .cr-cab small{font-size:13px;color:var(--ink2)}
  .ac .cr-nota{font-size:13px;color:var(--ink2);margin:0}
  .cr-dlg .cr-rodape{position:sticky;bottom:-24px;margin:4px -24px -24px;padding:12px 24px 16px;background:var(--gl-solid);border-top:1px solid var(--line);justify-content:space-between!important;align-items:center;z-index:2}
  .cr-dlg .cr-rodape .cr-cont{font-size:13px;color:var(--ink2);margin-right:auto}
  .ac-dialogo.cr-dlg{position:fixed;width:min(620px,calc(100vw - 24px));max-height:calc(100dvh - 32px)}
  .ac-dialogo.cr-dlg form{max-height:calc(100dvh - 32px);overflow:auto}
  .cr-sheet{position:absolute;inset:0;z-index:5;background:var(--gl-solid);display:flex;flex-direction:column;border-radius:inherit}
  .cr-sheet-h{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 12px 8px 6px;border-bottom:1px solid var(--line);font-size:16px;font-weight:600}
  .cr-volta{display:inline-flex;align-items:center;gap:2px;justify-self:start;min-height:44px;padding:0 10px 0 4px;border:0;background:transparent;color:var(--ink);font-size:15px;font-weight:500}
  .cr-sheet-c{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px}
  .cr-sheet-c>*{flex:none}
  .cr-sheet-f{display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid var(--line)}
  .cr-sheet-f .btn{flex:1;white-space:normal}
  .ac .cr-ctx{font-size:13px;color:var(--ink2);margin:0}
  .ac .cr-ctx b{color:var(--ink);font-weight:600}
  .ac .cr-busca{display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--cr-bd);background:var(--cr-surf);color:var(--ink3);font-size:15px}
  .cr-pop{position:absolute;z-index:6;width:440px;border-radius:16px;background:var(--gl-solid);box-shadow:0 18px 50px rgba(0,0,0,.22),0 0 0 1px var(--cr-bd, rgba(60,60,67,.16));overflow:hidden}
  .cr-pop .cr-busca{border:0;border-bottom:1px solid var(--line);border-radius:0;height:46px;background:transparent}
  .cr-pop .cr-pop-sec{padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--ink2)}
  .cr-pop .cr-op{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 16px;font-size:14px;line-height:1.35;color:var(--ink)}
  .cr-pop .cr-op.foco{background:rgba(120,120,128,.1)}
  .cr-pop .cr-op.off{color:var(--ink2)}
  .cr-pop .cr-op small{font-size:12px;color:var(--ink2);white-space:nowrap}
  .cr-pop .cr-pop-f{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;border-top:1px solid var(--line)}
  .ac .cr-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 12px;margin-bottom:14px}
  .ac .cr-rola{max-width:100%;overflow-x:auto;scrollbar-width:none}
  .ac .cr-rola .seg{flex:none}
  .ac .cr-rola .seg button{white-space:nowrap}
  .ac .cr-rola .seg em{font-style:normal;color:var(--ink3);font-weight:500;margin-left:4px}
  .ac .cr-grupo{margin-top:14px}
  .ac .cr-passos{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink2);margin-bottom:14px}
  .ac .cr-passos span{display:inline-flex;align-items:center;gap:6px}
  .ac .cr-passos i{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-style:normal;font-size:12px;font-weight:700;background:rgba(120,120,128,.14);color:var(--ink2)}
  .ac .cr-passos .on{color:var(--ink);font-weight:600}
  .ac .cr-passos .on i{background:var(--ink);color:var(--bg,#fff)}
  .ac .cr-passos .feito i{background:var(--tag-ok-bg);color:var(--tag-ok)}
  .ac .cr-passos .lin{width:24px;height:1px;background:var(--cr-bd)}
  .ac .cr-col{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.9fr);gap:6px 16px;align-items:center;padding:12px 16px;min-height:60px}
  .ac .cr-col .t{font-size:15px;font-weight:600}
  .ac .cr-col .d{display:block;font-size:13px;color:var(--ink2)}
  .ac .cr-col select{height:40px;border-radius:10px;border:1px solid var(--cr-bd);background:var(--cr-surf);padding:0 10px;font-size:14px;color:var(--ink);width:100%}
  .ac .cr-col .dica{grid-column:2;font-size:13px;color:var(--tag-info)}
  .ac .cr-fim{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}
  .ac .cr-grupo-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2)}
  .ac .cr-grupo-h .cr-ok{color:var(--gold-text);text-transform:none;letter-spacing:0;font-weight:600}
  @media (max-width:640px),(pointer:coarse){.ac .pl-mod.cr-row{min-height:56px}}
  @media (max-width:640px){
    .ac .cr-col{grid-template-columns:1fr}
    .ac .cr-col .dica{grid-column:1}
    .ac .cr-col select{font-size:16px;height:44px}
    .cr-dlg .cr-rodape .cr-cont{width:100%}
    .cr-dlg .cr-rodape .btn{flex:1}
    .ac .cr-top{flex-direction:column;align-items:stretch}
  }`;
  const estilo = () => {
    if (document.getElementById('cr-css')) return;
    const s = document.createElement('style');
    s.id = 'cr-css';
    s.textContent = css;
    document.head.appendChild(s);
  };

  /* Itens de exemplo: textos genéricos do banco da planilha (material do programa, sem dado pessoal). */
  const SUG = {
    EXPERIENCIA: ['Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).'],
    DESAFIO: ['Passar 24 horas em jejum, ingerindo apenas água. (Ao iniciar e ao finalizar o jejum, envie uma foto com o horário no grupo.)'],
    FILME: ['O Pacto', 'Pra Sempre Vencedor'],
    LIVRO: ['Em busca de um sentido'],
    EAP: [
      'POR QUE É TÃO DIFÍCIL MUDAR https://www.youtube.com/watch?v=x',
      'INTELIGENCIA LTDA https://www.youtube.com/watch?v=x',
      'O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER https://www.youtube.com/watch?v=x',
    ],
  };
  const OPS = [
    'Durante 7 dias, beber pelo menos 3 litros de água por dia.',
    'Fazer 100 agachamentos em um único dia.',
    'Durante 7 dias, fazer pelo menos um elogio sincero por dia para alguém.',
    'Ficar 12 horas sem utilizar cadeira.',
  ];
  const JA = [
    ['Durante 3 dias colocar despertador no celular de uma em uma hora…', '1º PME'],
    ['Dormir no chão durante uma noite.', 'RDV'],
  ];

  /* 1. Janela "Enviar o 2º PME": uma lista, cada item uma linha (tocar = trocar). */
  function envio({ trocar = false } = {}) {
    estilo();
    const dl = document.querySelector('dialog[open]');
    dl.classList.add('cr-dlg');
    const form = dl.querySelector('form');
    form.querySelector('h2').textContent = 'Enviar o 2º PME';
    form.querySelector('h2 + p').textContent =
      'O ciclo nasce com as atividades extras, o cronograma abaixo e o encerramento. Prazo de 30 dias.';
    form.querySelector('.flex.flex-wrap.justify-end button.btn-primary').textContent = 'Enviar o 2º PME';
    const linhas = ORDEM.map((b) => {
      const itens = SUG[b]
        .map((t, i) => {
          const d =
            b === 'EAP'
              ? 'Vídeo · youtube.com'
              : b === 'FILME' && i === 0
                ? 'Estava na planilha para este PME'
                : '';
          return `<li><div class="pl-mod cr-row" data-b="${b}"><div class="min-w-0"><span class="t">${tituloEap(t)}</span>${d ? `<span class="d">${d}</span>` : ''}</div>${seta}</div></li>`;
        })
        .join('');
      return `<li><div class="cr-gh">${svg(ICON[b], 'cr-s')}${PLURAL[b]}<span class="n">${SUG[b].length} de ${MODELO[b]}</span></div></li>${itens}<li><div class="cr-add">${svg(MAIS, 'cr-s')}Adicionar ${b === 'EAP' ? 'EAP' : NOME[b].toLowerCase()}</div></li>`;
    }).join('');
    const sec = document.createElement('div');
    sec.style.cssText = 'display:grid;gap:8px';
    sec.innerHTML = `<div class="cr-cab" style="margin:6px 0 0"><h3>Cronograma deste PME<span>8</span></h3><small>Modelo da planilha: 3 EAP · 1 experiência · 1 desafio · 2 filmes · 1 livro</small></div>
      <p class="cr-nota">Já vem com o que Mentorado Fictício 01 ainda não recebeu, nem no RDV. Toque num item para trocar.</p>
      <ul class="cr-lst">${linhas}</ul>`;
    const aviso = form.querySelector('.pme-aviso');
    const rodape = form.querySelector('.flex.flex-wrap.justify-end');
    (aviso || rodape).before(sec);
    rodape.classList.add('cr-rodape');
    rodape.insertAdjacentHTML('afterbegin', '<span class="cr-cont">8 itens do cronograma</span>');
    if (!trocar) return;

    const alvo = sec.querySelector('[data-b="DESAFIO"]');
    if (window.innerWidth >= 768) {
      /* Computador: caixa suspensa presa ao item, busca primeiro (como o menu de status do Linear). */
      alvo.style.background = 'rgba(120,120,128,.1)';
      alvo.scrollIntoView({ block: 'center' });
      const r = alvo.getBoundingClientRect();
      const base = dl.getBoundingClientRect();
      const pop = document.createElement('div');
      pop.className = 'cr-pop';
      pop.style.top = `${r.bottom - base.top + 4}px`;
      pop.style.right = `${base.right - r.right + 8}px`;
      pop.innerHTML = `<div class="cr-busca">${svg(BUSCA, 'cr-s')} Trocar por outro desafio…</div>
        <div class="cr-pop-sec">Ainda não recebeu · 89</div>
        ${OPS.map((t, i) => `<div class="cr-op ${i === 0 ? 'foco' : ''}"><span>${t}</span></div>`).join('')}
        <div class="cr-pop-sec">Já recebeu · não dá para repetir</div>
        ${JA.map(([t, q]) => `<div class="cr-op off"><span>${t}</span><small>${q}</small></div>`).join('')}
        <div class="cr-pop-f"><button type="button" class="btn btn-ghost sm">Tirar do PME</button><button type="button" class="btn btn-ghost sm">${svg(MAIS, 'cr-s')}Escrever só para ele</button></div>`;
      dl.appendChild(pop);
      return;
    }
    /* Celular: tela própria com "Voltar" (a escolha B), miolo em linhas tocáveis. */
    const sheet = document.createElement('div');
    sheet.className = 'cr-sheet';
    sheet.innerHTML = `<div class="cr-sheet-h"><button type="button" class="cr-volta">${svg(VOLTA)}Voltar</button><span>Trocar desafio</span><span></span></div>
      <div class="cr-sheet-c">
        <p class="cr-ctx">No lugar de: <b>Passar 24 horas em jejum, ingerindo apenas água.</b></p>
        <div class="cr-busca">${svg(BUSCA, 'cr-s')} Buscar desafio</div>
        <div class="cr-cab" style="margin:6px 0 0"><h3>Ainda não recebeu<span>89</span></h3></div>
        <ul class="cr-lst">${OPS.map((t) => `<li><div class="pl-mod cr-row"><div class="min-w-0"><span class="t">${t}</span></div></div></li>`).join('')}</ul>
        <div class="cr-cab" style="margin:6px 0 0"><h3>Já recebeu<span>2</span></h3><small>não dá para repetir</small></div>
        <ul class="cr-lst">${JA.map(([t, q]) => `<li><div class="pl-mod cr-row off"><div class="min-w-0"><span class="t">${t}</span></div><span class="q">${q}</span></div></li>`).join('')}</ul>
      </div>
      <div class="cr-sheet-f"><button type="button" class="btn btn-secondary">Tirar do PME</button><button type="button" class="btn btn-secondary">${svg(MAIS, 'cr-s')}Escrever só para ele</button></div>`;
    dl.appendChild(sheet);
  }

  /* 2. Card "PME atual" com as tarefas do cronograma (Jornada). */
  function card() {
    estilo();
    const ul = document.querySelector('.pme-ciclo.atual ul.pme-tarefas');
    const modelo = ul.querySelector('li.pme-tarefa:not(.enc)');
    const enc = ul.querySelector('li.pme-tarefa.enc');
    const itens = [
      ['EXPERIENCIA', 'Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).', 'feita'],
      ['DESAFIO', 'Passar 24 horas em jejum, ingerindo apenas água.', 'nao_feita'],
      ['FILME', 'O Pacto', 'feita'],
      ['FILME', 'Pra Sempre Vencedor', 'feita'],
      ['LIVRO', 'Em busca de um sentido', 'pendente'],
      ['EAP', 'POR QUE É TÃO DIFÍCIL MUDAR', 'pendente'],
      ['EAP', 'INTELIGENCIA LTDA', 'pendente'],
      ['EAP', 'O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER', 'pendente'],
    ];
    const cab = document.createElement('li');
    cab.className = 'cr-grupo-h';
    cab.style.cssText = 'list-style:none;padding:14px 2px 4px';
    cab.innerHTML = `<span>Cronograma deste PME</span><span class="cr-ok">3 de 8 feitos</span>`;
    enc.before(cab);
    for (const [b, t, st] of itens) {
      const li = modelo.cloneNode(true);
      li.querySelector('.pme-orig').innerHTML = `${NOME[b]}`;
      li.querySelector('.pme-orig').style.cssText = 'display:inline-flex;align-items:center;gap:4px';
      li.querySelector('.pme-orig').insertAdjacentHTML('afterbegin', svg(ICON[b], 'cr-s'));
      li.querySelector('b').textContent = t;
      const meta = li.querySelector('.meta');
      const sel = li.querySelector('select');
      const check = li.querySelector('button.check');
      li.className = 'pme-tarefa ' + (st === 'feita' ? 'feita' : '');
      check.classList.toggle('done', st === 'feita');
      sel.className = 'pme-st ' + st;
      sel.value = st === 'feita' ? 'FEITA' : st === 'nao_feita' ? 'NAO_FEITA' : 'PENDENTE';
      [...sel.options].forEach((o, i) => (o.selected = i === (st === 'feita' ? 1 : st === 'nao_feita' ? 3 : 0)));
      meta.textContent =
        st === 'feita' ? 'Feita em 30/11/2026, Duda · prazo 24/12/2026' : st === 'nao_feita' ? 'Não feita: viajou a trabalho · prazo 24/12/2026' : 'Prazo 24/12/2026';
      if (st !== 'feita') li.querySelector('.pme-comp')?.remove();
      enc.before(li);
    }
    const ciclo = document.querySelector('.pme-ciclo.atual');
    ciclo.querySelector('.pme-nome').textContent = '2º PME';
    document.querySelectorAll('.pme-cab button').forEach((b) => b.lastChild && (b.lastChild.textContent = b.lastChild.textContent.replace('2º PME', '3º PME')));
    const dds = ciclo.querySelectorAll('dl.pme-datas dd');
    if (dds[0]) dds[0].firstChild.textContent = '24/11/2026 ';
    if (dds[1]) dds[1].firstChild.textContent = '24/12/2026 ';
    const extras = [...ul.querySelectorAll('li.pme-tarefa:not(.enc)')].slice(0, 2);
    const tx = ['Praticar um esporte diferente', 'Comer uma fruta nunca provada e enviar a foto no grupo'];
    extras.forEach((li, i) => (li.querySelector('b').textContent = tx[i]));
    enc.querySelector('b').textContent = 'Encerramento do 2º PME';
    ul.querySelectorAll('.meta').forEach((m) => (m.textContent = m.textContent.replace('03/12/2026', '24/12/2026').replace('17/11/2026', '28/11/2026')));
    const pct = document.querySelector('.pme-ciclo.atual .pme-barra-t b');
    if (pct) pct.textContent = '45%';
    const trilho = document.querySelector('.pme-ciclo.atual .pme-trilho span');
    if (trilho) trilho.style.width = '45%';
    document.querySelector('.pme-cab').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -12);
  }


  /* 3. Aba "Cronograma": seletor de bloco + uma lista agrupada por PME (como "Em trânsito / Entregues"). */
  function aba() {
    estilo();
    const tabs = document.querySelector('.fc-main .tabs');
    tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    const hist = [...tabs.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Histórico');
    const nova = hist.cloneNode(true);
    nova.textContent = 'Cronograma';
    nova.classList.add('on');
    hist.before(nova);
    document.querySelector('.fh-tags .tag').textContent = '2M';
    const ment = [...document.querySelectorAll('aside.fc-lado label.pr')].find((l) => l.textContent.includes('Mentoria'));
    if (ment) ment.querySelector('select').value = '2M';
    const painel = document.querySelector('.fc-main section[role=tabpanel]');
    const linha = (b, t, tag, d) =>
      `<li><div class="pl-mod cr-row ic"><span class="ico">${svg(ICON[b])}</span><div class="min-w-0"><span class="t">${tituloEap(t)}</span><span class="d">${d ?? NOME[b]}</span></div>${tag ?? ''}</div></li>`;
    const st = (c, l) => `<span class="tag ${c}">${l}</span>`;
    const grupo = (titulo, n, extra, itens) =>
      `<div class="cr-grupo"><div class="cr-cab"><h3>${titulo}<span>${n}</span></h3><small>${extra}</small></div><ul class="cr-lst">${itens}</ul></div>`;
    const seg = `<div class="cr-rola"><div class="seg" role="group"><button type="button" class="on">Todos</button>${ORDEM.map((b, i) => `<button type="button">${PLURAL[b]}<em>${[14, 14, 28, 14, 42][i]}</em></button>`).join('')}</div></div>`;
    painel.innerHTML = `
      <div class="cr-top"><div><h2 style="font-size:17px;font-weight:600;margin:0;letter-spacing:-.015em">Cronograma</h2><p class="cr-nota">112 itens recebidos, contando o RDV. Nada se repete.</p></div>${seg}</div>
      ${grupo('2º PME', '3 de 8 feitos', 'enviado em 24/11/2026',
        linha('EXPERIENCIA', 'Subir em uma árvore em família e tirar uma foto (mandar a foto no nosso grupo).', st('ativo', 'Feita')) +
        linha('DESAFIO', 'Passar 24 horas em jejum, ingerindo apenas água.', st('canc', 'Não feita')) +
        linha('FILME', 'O Pacto', st('ativo', 'Feita')) +
        linha('FILME', 'Pra Sempre Vencedor', st('ativo', 'Feita')) +
        linha('LIVRO', 'Em busca de um sentido', st('', 'Pendente')) +
        linha('EAP', 'POR QUE É TÃO DIFÍCIL MUDAR', st('', 'Pendente'), 'EAP · <span class="cr-link">youtube.com</span>') +
        linha('EAP', 'INTELIGENCIA LTDA', st('', 'Pendente'), 'EAP · <span class="cr-link">youtube.com</span>') +
        linha('EAP', 'O QUE TODA PESSOA PRECISA APRENDER PARA CRESCER', st('', 'Pendente'), 'EAP · <span class="cr-link">youtube.com</span>'))}
      ${grupo('1º PME', '8', 'antes do sistema · da planilha',
        linha('EXPERIENCIA', 'Fazer um quadro do sonhos com recortes de imagens em uma cartolina', st('canc', 'Não fez')) +
        linha('DESAFIO', 'Durante 3 dias colocar despertador no celular de uma em uma hora') +
        linha('FILME', 'Um sonho possível') +
        linha('FILME', 'Coach Carter') +
        linha('LIVRO', 'Comece pelo Porquê') +
        `<li><div class="pl-mod cr-row ic"><span></span><div class="min-w-0"><span class="t" style="color:var(--ink2);font-size:14px">e mais 3 EAP</span></div>${seta}</div></li>`)}
      ${grupo('No RDV', '96', 'outra inscrição · concluída em 10/2026',
        linha('EXPERIENCIA', 'A partir das 19h, apagar as luzes e deixá-las desligadas') +
        linha('DESAFIO', 'Dormir no chão durante uma noite') +
        `<li><div class="pl-mod cr-row ic"><span></span><div class="min-w-0"><span class="t" style="color:var(--ink2);font-size:14px">Ver os 96 itens do RDV</span></div>${seta}</div></li>`)}
      ${grupo('Já tinha antes', '2', 'leu ou viu antes da mentoria',
        linha('LIVRO', 'Pai Rico, Pai Pobre') + linha('LIVRO', 'Os Segredos da Mente Milionária'))}`;
  }

  /* 4. Configurações → Cronograma: igual a Configurações → PMEs (linha com número, texto, uso, ›). */
  function banco() {
    estilo();
    const tabs = document.querySelector('.view .tabs');
    tabs.querySelectorAll('a').forEach((a) => a.classList.remove('on'));
    const pmes = [...tabs.querySelectorAll('a')].find((a) => a.textContent.trim() === 'PMEs');
    const nova = pmes.cloneNode(true);
    nova.textContent = 'Cronograma';
    nova.classList.add('on');
    pmes.after(nova);
    document.querySelector('.hrow p.sub').textContent =
      'Os itens que vão em cada PME. Item já enviado não se apaga: esconda para ele sair das sugestões.';
    const antigo = tabs.nextElementSibling;
    const corpo = document.createElement('div');
    antigo.replaceWith(corpo);
    [...document.querySelectorAll('.ac p')].filter((p) => p.textContent.includes('PME de Aquecimento')).forEach((p) => p.remove());
    const dados = [
      ['Durante 3 dias colocar despertador no celular de uma em uma hora com a escrita: isso que estou prestes a fazer está me aproximando ou distanciando dos meus sonhos?', '43 envios'],
      ['Passar 24 horas em jejum, ingerindo apenas água. (Ao iniciar e ao finalizar o jejum, envie uma foto com o horário no grupo.)', '10 envios'],
      ['Fazer 100 agachamentos em um único dia. (Grave um pequeno vídeo realizando parte dos agachamentos ou envie uma foto ao concluir.)', '6 envios'],
      ['Guardar o máximo de dinheiro que conseguir', 'Escondido · 8 envios', true],
      ['Dormir no chão durante uma noite. (Envie uma foto do local onde dormiu.)', '5 envios'],
      ['Durante 7 dias, beber pelo menos 3 litros de água por dia. (Envie uma foto da garrafa utilizada ou um registro diário da quantidade consumida.)', 'Nunca enviado'],
      ['Durante 30 dias, manter sua cama arrumada antes de sair do quarto. (Envie uma foto da cama arrumada no primeiro e no último dia do desafio.)', 'Nunca enviado'],
    ];
    const seg = `<div class="cr-rola"><div class="seg" role="group">${ORDEM.map((b, i) => `<button type="button" class="${i === 1 ? 'on' : ''}">${PLURAL[b]}<em>${[48, 103, 35, 29, 78][i]}</em></button>`).join('')}</div></div>`;
    corpo.innerHTML = `
      <div class="cr-top">${seg}<div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:flex-end;min-width:0"><div class="cr-busca" style="flex:1;max-width:300px;min-width:0">${svg(BUSCA, 'cr-s')} Buscar desafio</div><button type="button" class="btn btn-primary" style="flex:none">Novo desafio</button></div></div>
      <section class="card overflow-hidden"><ul class="pl-lista">${dados
        .map(
          ([t, m, esc], i) =>
            `<li><a class="pl-mod ${esc ? 'off' : ''}" href="#"><b class="pl-n">${i + 1}</b><div class="min-w-0"><span class="t cr-t">${t}</span><span class="d">${m}</span></div>${seta}</a></li>`,
        )
        .join('')}</ul></section>`;
    const s = document.createElement('style');
    s.textContent = `.ac .pl-mod .cr-t{font-weight:500;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`;
    document.head.appendChild(s);
  }

  /* 5. Configurações → Importação: em 3 passos, como a importação do Linear. */
  function importacao() {
    estilo();
    document.querySelector('.hrow p.sub').textContent = 'Traga a carteira e a planilha do cronograma, sem redigitar.';
    const tabs = document.querySelector('.view .tabs');
    const pmes = [...tabs.querySelectorAll('a')].find((a) => a.textContent.trim() === 'PMEs');
    const nova = pmes.cloneNode(true);
    nova.textContent = 'Cronograma';
    nova.classList.remove('on');
    pmes.after(nova);
    const corpo = tabs.nextElementSibling;
    const col = (nome, sub, sel, dica = '') =>
      `<li><div class="cr-col"><div class="min-w-0"><span class="t">${nome}</span><span class="d">${sub}</span></div><select>${sel.map((o, i) => `<option ${i === 0 ? 'selected' : ''}>${o}</option>`).join('')}</select>${dica ? `<span class="dica">${dica}</span>` : ''}</div></li>`;
    const sec = document.createElement('section');
    sec.className = 'card sec';
    sec.style.marginTop = '16px';
    sec.innerHTML = `
      <header><h2>Planilha do cronograma</h2></header>
      <div class="cr-passos"><span class="feito"><i>${svg(OK, 'cr-s')}</i>Arquivo</span><span class="lin"></span><span class="on"><i>2</i>Revisar colunas</span><span class="lin"></span><span><i>3</i>Importar</span></div>
      <ul class="cr-lst" style="margin-bottom:16px"><li><div class="pl-mod cr-row ic"><span class="ico">${svg(ARQ)}</span><div class="min-w-0"><span class="t">CRONOGRAMA - CRONOGRAMA.csv</span><span class="d">293 itens em 5 blocos · 249 colunas · 196 já ligadas a uma ficha</span></div><button type="button" class="btn btn-secondary sm">Trocar</button></div></li></ul>
      <div class="cr-top" style="margin-bottom:8px"><div class="cr-cab" style="margin:0"><h3>Para revisar<span>34</span></h3><small>sem escolha, a coluna fica de fora</small></div><div class="cr-rola"><div class="seg" role="group"><button type="button" class="on">Em dúvida<em>25</em></button><button type="button">Sem ficha<em>9</em></button></div></div></div>
      <ul class="cr-lst">
        ${col('Mentorado Fictício 01', 'Coluna 4 · vai até o 12º mês · 61 itens', ['RDV · Concluído · 12º PME', '2M · Ativo · 2º PME', 'Ignorar esta coluna'], 'Vai até o 12º mês: deve ser o RDV. Vale também na 2M.')}
        ${col('Mentorada 04', 'Coluna 9 · vai até o 5º mês · 26 itens', ['Escolher a ficha…', 'Mentorada Fictícia 04 · RDV · 5º PME', 'Mentorada Fictícia 06 · 6M · 1º PME', 'Ignorar esta coluna'])}
        ${col('Mentorada 07', 'Coluna 12 · vai até o 3º mês · 18 itens', ['Escolher a ficha…', 'Mentorada Fictícia 07 · RDV · 3º PME', 'Ignorar esta coluna'])}
        <li><div class="pl-mod cr-row"><div class="min-w-0"><span class="t" style="color:var(--ink2);font-size:14px">Ver as outras 22</span></div>${seta}</div></li>
      </ul>
      <div class="cr-fim"><span class="cr-nota">Rodar de novo não duplica nada: só entra o que falta.</span><div style="display:flex;gap:8px"><button type="button" class="btn btn-secondary">Voltar</button><button type="button" class="btn btn-primary">Continuar</button></div></div>`;
    corpo.append(sec);
  }

  window.__cr = { envio, card, aba, banco, importacao };
})();
