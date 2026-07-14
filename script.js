/*
 Roadmap de Cibersegurança — script principal

 Carrega colecao-ciberseguranca.json e monta uma matriz: colunas por nicho,
 faixas por nível (iniciante/intermediário/avançado) dentro de cada coluna.
 Cada faixa tem altura livre (por conteúdo) — colunas com poucos itens ficam
 mais baixas, sem forçar alinhamento pixel a pixel entre colunas.

 Filtros (preço/tipo) escondem chips com uma transição suave, sem recriar o DOM.
 Progresso de "concluído" é salvo em localStorage — por navegador/dispositivo,
 não sincroniza entre aparelhos (não há login).
 */

const storageKey = 'roadmap-ciberseguranca-progresso';

// ordem de inserção no DOM. O container (.niche-col-body) usa
// flex-direction: column-reverse, então o 1º item da lista (iniciante)
// acaba renderizado embaixo, e o último (avançado) em cima.
const levels = ['iniciante', 'intermediário', 'avançado'];

const state = {
  niches: [],
  items: [],
  activePrice: null, // 'gratuito' | 'pago' | null (null = filtro desligado)
  activeType: null,  // 'curso' | 'certificação' | 'prática' | 'ferramenta' | 'leitura' | null
  done: loadProgress(),
  depthCache: new Map(), // itemId -> profundidade na cadeia de pré-requisitos (ver computeDepth)
  expandedIds: new Set(), // itemIds cujas ramificações (dependentes) estão abertas na matriz por pré-requisitos
};

/* Lê o progresso salvo do localStorage. Retorna {} se não houver nada ou se der erro. */
function loadProgress() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/* Persiste state.done no localStorage. Falha silenciosamente (ex: modo anônimo). */
function saveProgress() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.done));
  } catch {
    // localStorage indisponível — progresso não persiste, mas a página segue funcionando
  }
}

/*
 Ponto de entrada. Busca o JSON de dados, popula o state e dispara a
 primeira renderização + os listeners de filtro e popover.
 */
async function init() {
  try {
    const res = await fetch('./colecao-ciberseguranca.json');
    const data = await res.json();
    state.niches = data.niches || [];
    state.items = data.items || [];
    renderMatrix();
    renderDependencyGraph();
    bindFilters();
    bindPopoverDismiss();
    bindPopoverHoverKeep();
    window.addEventListener('resize', debounce(drawDependencyLines, 150));
  } catch (err) {
    document.querySelector('.niche-columns').innerHTML =
      '<p style="color:var(--text-dim);font-size:0.85rem;">Não foi possível carregar colecao-ciberseguranca.json</p>';
    console.error(err);
  }
}

/* Verifica se um item passa nos filtros de preço/tipo ativos no momento. */
function itemMatchesFilters(item) {
  if (state.activePrice === 'gratuito' && item.gratuito !== true) return false;
  if (state.activePrice === 'pago' && item.gratuito !== false) return false;
  if (state.activeType && item.tipo !== state.activeType) return false;
  return true;
}

/*
 Monta a matriz inteira do zero: uma coluna por nicho (na ordem em que
 aparecem no JSON), e dentro de cada coluna uma faixa por nível.
 Nichos sem nenhum item não geram coluna.
 */
function renderMatrix() {
  const container = document.querySelector('.niche-columns');
  container.innerHTML = '';

  state.niches.forEach((niche) => {
    const nicheItems = state.items.filter((it) => it.nicheId === niche.id);
    if (nicheItems.length === 0) return;

    const col = document.createElement('div');
    col.className = 'niche-col';
    col.dataset.nicheId = niche.id;

    const title = document.createElement('h3');
    title.className = 'niche-col-title';
    title.textContent = niche.nome;
    col.appendChild(title);

    const body = document.createElement('div');
    body.className = 'niche-col-body';

    levels.forEach((nivel) => {
      const row = document.createElement('div');
      row.className = 'level-row';
      row.dataset.level = nivel;

      // rótulo do nível fica dentro da própria faixa — garante que o nível
      // continua identificável mesmo se a faixa vizinha tiver altura diferente
      const label = document.createElement('span');
      label.className = 'level-row-label';
      label.textContent = nivel;
      row.appendChild(label);

      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'level-row-chips';

      nicheItems
        .filter((it) => it.nivel === nivel)
        .forEach((item) => chipsWrap.appendChild(renderChip(item)));

      row.appendChild(chipsWrap);
      body.appendChild(row);
    });

    col.appendChild(body);
    container.appendChild(col);
  });

  applyFilterVisibility();
}

/*
 Remove acentos e baixa a caixa de um nível (ex: "avançado" -> "avancado"),
 usado só pra montar o nome da classe CSS de cor (.nivel-avancado etc),
 já que classes CSS não devem depender de acento.
 */
function normalizeNivel(nivel) {
  return String(nivel)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/*
 Cria o botão/chip de um item. O chip só mostra o nome — todo o resto
 (preço, tipo, observação, link, checkbox de concluído) fica escondido
 até interagir, dentro do popover.

 Na matriz por nicho o popover abre no clique (comportamento padrão). Na
 matriz por pré-requisitos o clique já faz outra coisa (abre/fecha a
 ramificação — ver toggleExpansion), então lá `hoverPopover: true` faz o
 popover abrir/fechar no hover em vez de brigar com o clique.
 */
function renderChip(item, { hoverPopover = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `item-chip nivel-${normalizeNivel(item.nivel)}`;
  chip.dataset.itemId = item.id;
  chip.textContent = item.nome;
  if (state.done[item.id]) chip.classList.add('done');

  if (hoverPopover) {
    chip.addEventListener('mouseenter', () => {
      cancelPopoverClose();
      openPopover(item, chip);
    });
    chip.addEventListener('mouseleave', schedulePopoverClose);
    // foco por teclado (Tab) precisa do mesmo popover — sem isso o chip
    // fica sem qualquer forma acessível de ver os detalhes do item
    chip.addEventListener('focus', () => {
      cancelPopoverClose();
      openPopover(item, chip);
    });
    chip.addEventListener('blur', schedulePopoverClose);
  } else {
    chip.addEventListener('click', (e) => {
      e.stopPropagation(); // evita que o listener global de "clique fora" feche o popover na hora
      openPopover(item, chip);
    });
  }

  return chip;
}

/*
 Reaplica os filtros atuais em todos os chips/faixas/colunas já renderizados,
 sem recriar o DOM (só troca classes, então a transição CSS anima suave):
 - chip que não bate no filtro ganha .chip-hidden (encolhe a zero)
 - faixa que fica sem nenhum chip visível ganha .row-collapsed (some)
 - coluna que fica sem nenhum chip visível ganha .col-hidden (encolhe)
 */
function applyFilterVisibility() {
  document.querySelectorAll('.item-chip').forEach((chip) => {
    const item = state.items.find((it) => it.id === chip.dataset.itemId);
    const hidden = !itemMatchesFilters(item);
    chip.classList.toggle('chip-hidden', hidden);

    // chip alinhado na matriz por pré-requisitos (ver alignColumnToParents)
    // carrega um margin-top extra; escondido, esse espaço tem que sumir
    // junto, senão sobra um vão fantasma no lugar do chip colapsado.
    if (chip.dataset.alignTop) {
      chip.style.marginTop = hidden ? '0px' : `${chip.dataset.alignTop}px`;
    }
  });

  document.querySelectorAll('.level-row').forEach((row) => {
    const visibleCount = row.querySelectorAll('.item-chip:not(.chip-hidden)').length;
    row.classList.toggle('row-collapsed', visibleCount === 0);
  });

  document.querySelectorAll('.niche-col').forEach((col) => {
    const visibleCount = col.querySelectorAll('.item-chip:not(.chip-hidden)').length;
    col.classList.toggle('col-hidden', visibleCount === 0);
  });

  document.querySelectorAll('.depth-col').forEach((col) => {
    const visibleCount = col.querySelectorAll('.item-chip:not(.chip-hidden)').length;
    col.classList.toggle('col-hidden', visibleCount === 0);
  });

  // uma linha some se qualquer uma das pontas (origem ou destino) estiver escondida
  document.querySelectorAll('.dep-lines path').forEach((path) => {
    const fromHidden = !itemMatchesFilters(state.items.find((it) => it.id === path.dataset.from));
    const toHidden = !itemMatchesFilters(state.items.find((it) => it.id === path.dataset.to));
    path.classList.toggle('line-hidden', fromHidden || toHidden);
  });
}

/*
 Liga os cliques dos botões de filtro (preço e tipo). Clicar de novo no
 mesmo botão ativo desliga o filtro (toggle), em vez de travado sempre ligado.
 */
function bindFilters() {
  document.querySelectorAll('[data-filter-price]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.filterPrice;
      state.activePrice = state.activePrice === val ? null : val;
      refreshFilterButtons();
      applyFilterVisibility();
      redrawLinesAfterTransition();
    });
  });

  document.querySelectorAll('[data-filter-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.filterType;
      state.activeType = state.activeType === val ? null : val;
      refreshFilterButtons();
      applyFilterVisibility();
      redrawLinesAfterTransition();
    });
  });
}

/* Atualiza a classe .active dos botões de filtro pra refletir o state atual. */
function refreshFilterButtons() {
  document.querySelectorAll('[data-filter-price]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filterPrice === state.activePrice);
  });
  document.querySelectorAll('[data-filter-type]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filterType === state.activeType);
  });
}

// ---- matriz por pré-requisitos (grafo por profundidade) ----

/*
 Calcula a profundidade de um item na cadeia de pré-requisitos:
 - 0 = não depende de nada (raiz)
 - N = 1 + maior profundidade entre seus pré-requisitos
 Memoizado em state.depthCache. Guarda contra ciclo (não deveria existir
 nos dados, mas evita loop infinito se algum requisito for adicionado errado).
 */
function computeDepth(itemId, visiting = new Set()) {
  if (state.depthCache.has(itemId)) return state.depthCache.get(itemId);
  if (visiting.has(itemId)) return 0; // ciclo — trata como raiz pra não travar

  const item = state.items.find((it) => it.id === itemId);
  const requisitos = item?.requisito || [];
  if (requisitos.length === 0) {
    state.depthCache.set(itemId, 0);
    return 0;
  }

  visiting.add(itemId);
  const depth = 1 + Math.max(...requisitos.map((reqId) => computeDepth(reqId, visiting)));
  visiting.delete(itemId);

  state.depthCache.set(itemId, depth);
  return depth;
}

/* Retorna os itens que têm `itemId` como um dos pré-requisitos (dependentes diretos). */
function getChildren(itemId) {
  return state.items.filter((it) => (it.requisito || []).includes(itemId));
}

/*
 Um item aparece na matriz por pré-requisitos se:
 - for raiz (profundidade 0, sem pré-requisito) — sempre visível, é a base; ou
 - algum dos seus pré-requisitos estiver com a ramificação aberta (em state.expandedIds).
 Como só é possível clicar num chip já visível, isso já garante que a cadeia
 de visibilidade é consistente sem precisar checar recursivamente pra cima.
 */
function isItemVisibleInGraph(item) {
  if (state.depthCache.get(item.id) === 0) return true;
  return (item.requisito || []).some((reqId) => state.expandedIds.has(reqId));
}

/*
 Abre/fecha a ramificação de um item na matriz por pré-requisitos.
 - Sem dependentes: mostra um toast avisando que não há continuação.
 - Com dependentes: alterna entre mostrar (expande) e esconder (colapsa,
   levando junto qualquer sub-ramificação aberta abaixo dela).
 */
function toggleExpansion(itemId) {
  const children = getChildren(itemId);
  if (children.length === 0) {
    showToast('Item sem continuação definida no momento');
    return;
  }

  if (state.expandedIds.has(itemId)) {
    collapseSubtree(itemId);
  } else {
    state.expandedIds.add(itemId);
  }
  renderDependencyGraph();
}

/* Fecha a ramificação de um item e, em cascata, qualquer sub-ramificação que dependia dela. */
function collapseSubtree(itemId) {
  state.expandedIds.delete(itemId);
  getChildren(itemId).forEach((child) => {
    if (state.expandedIds.has(child.id)) collapseSubtree(child.id);
  });
}

/*
 Monta a matriz por pré-requisitos: uma coluna por profundidade (0, 1, 2...),
 em vez de uma coluna por nicho. Por padrão só a Base (raízes) aparece —
 as camadas seguintes só entram quando o usuário clica pra expandir um chip
 com dependentes (ver toggleExpansion). Dentro da coluna os itens ficam em
 ordem simples (nicho, depois nome) só pra dar algum agrupamento visual.
 As linhas de dependência são desenhadas depois, em drawDependencyLines().
 */
function renderDependencyGraph() {
  const container = document.querySelector('.depth-columns');
  if (!container) return;

  state.depthCache = new Map();
  state.items.forEach((it) => computeDepth(it.id));

  const maxDepth = Math.max(0, ...state.items.map((it) => state.depthCache.get(it.id)));

  // guardados do render anterior — usados só pra saber o que é realmente
  // novo nesta passada (ver comentário na entrada da animação, mais abaixo).
  // Não dá pra usar o maxDepth bruto pra isso: ele é a profundidade máxima
  // de TODO o dataset, não das colunas que de fato apareceram (a maioria
  // fica em itemsAtDepth.length === 0 e é pulada) — por isso guardamos o
  // conjunto de profundidades que realmente tiveram coluna renderizada.
  const isFirstRender = state.lastRenderedDepths === undefined;
  const previousVisibleIds = state.lastVisibleIds || new Set();
  const previousRenderedDepths = state.lastRenderedDepths || new Set();
  const renderedDepths = new Set();
  const newCols = [];
  const newChips = [];

  // posição de cada chip ANTES de recriar tudo — usada depois pra animar
  // (FLIP) quem só se deslocou (ex: recentralização ao abrir uma coluna
  // nova), em vez de "teleportar" pro lugar novo (ver animateGraphEntrance).
  const oldChipRects = new Map();
  container.querySelectorAll('.item-chip').forEach((el) => {
    oldChipRects.set(el.dataset.itemId, el.getBoundingClientRect());
  });

  container.innerHTML = '<svg class="dep-lines"></svg>';

  // rank[itemId] = posição vertical do item na sua própria coluna, propagada
  // pra frente — assim uma ramificação nasce perto de onde o pai está, em vez
  // de reordenar tudo alfabeticamente e jogar o filho lá em cima da coluna.
  const rank = new Map();
  const currentVisibleIds = new Set();

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const itemsAtDepth = state.items.filter(
      (it) => state.depthCache.get(it.id) === depth && isItemVisibleInGraph(it)
    );

    if (depth === 0) {
      itemsAtDepth.sort((a, b) => a.nicheId.localeCompare(b.nicheId) || a.nome.localeCompare(b.nome));
    } else {
      itemsAtDepth.sort((a, b) => {
        const rankA = averageParentRank(a, rank);
        const rankB = averageParentRank(b, rank);
        return rankA - rankB || a.nome.localeCompare(b.nome);
      });
    }

    if (itemsAtDepth.length === 0) continue;

    renderedDepths.add(depth);
    itemsAtDepth.forEach((item, idx) => rank.set(item.id, idx));

    const col = document.createElement('div');
    col.className = 'depth-col';
    const isNewCol = !previousRenderedDepths.has(depth);

    const title = document.createElement('h3');
    title.className = 'depth-col-title';
    title.textContent = depth === 0 ? 'Base' : `Camada ${depth}`;
    col.appendChild(title);

    itemsAtDepth.forEach((item) => {
      currentVisibleIds.add(item.id);
      const chip = renderChip(item, { hoverPopover: true });
      const niche = state.niches.find((n) => n.id === item.nicheId);
      if (niche) chip.title = niche.nome; // tooltip nativo — nicho some das colunas aqui

      const children = getChildren(item.id);
      if (children.length > 0) {
        chip.classList.add('has-children');
        chip.classList.toggle('is-expanded', state.expandedIds.has(item.id));
      }
      chip.addEventListener('click', () => toggleExpansion(item.id));

      // só entra na lista de "novo" se a coluna inteira já existia antes —
      // senão a coluna já cobre a entrada com sua própria transição e
      // animar os dois ao mesmo tempo duplicaria o efeito.
      if (!isNewCol && !previousVisibleIds.has(item.id)) newChips.push(chip);

      col.appendChild(chip);
    });

    container.appendChild(col);
    if (isNewCol) newCols.push(col);
    if (depth > 0) alignColumnToParents(container, itemsAtDepth);
  }

  applyFilterVisibility();
  drawDependencyLines();

  state.lastVisibleIds = currentVisibleIds;
  state.lastRenderedDepths = renderedDepths;

  if (!isFirstRender) {
    animateGraphEntrance(container, newCols, newChips, oldChipRects, previousVisibleIds);
  }
}

/*
 Anima a entrada de colunas/chips que acabaram de aparecer (usuário expandiu
 uma ramificação) e o reposicionamento dos que já existiam (ex: colunas
 anteriores deslizam um pouco quando uma nova entra, já que .depth-columns
 centraliza o conteúdo — sem isso elas só "teleportam" pro lugar novo).
 O grafo inteiro é remontado a cada render (ver acima), e nesse ponto as
 posições/linhas já estão calculadas com o layout final — por isso toda
 animação parte de um estado inicial (opacidade/posição do frame anterior)
 aplicado DEPOIS de medir tudo, e só então transiciona pro estado normal.
 Fazer isso antes da medição (drawDependencyLines/alignColumnToParents)
 bagunçaria os getBoundingClientRect e desenharia as linhas na posição errada.
 */
function animateGraphEntrance(container, newCols, newChips, oldChipRects, previousVisibleIds) {
  // chips que já existiam e só mudaram de posição (FLIP: volta pro rect
  // antigo via transform, depois anima até 0 — desliza em vez de saltar).
  const movedChips = [];
  container.querySelectorAll('.item-chip').forEach((chip) => {
    const oldRect = oldChipRects.get(chip.dataset.itemId);
    if (!oldRect) return; // chip novo — já coberto por newChips/newCols
    const newRect = chip.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) movedChips.push({ chip, dx, dy });
  });

  // linha nova de verdade é a que aponta pra um chip que acabou de aparecer;
  // as demais já existiam e só tiveram a ponta reajustada (o chip que se
  // move via FLIP acima já dá a sensação de a linha "seguir" o chip).
  const svg = container.querySelector('.dep-lines');
  const newLines = svg
    ? Array.from(svg.querySelectorAll('path')).filter((p) => !previousVisibleIds.has(p.dataset.to))
    : [];

  if (newCols.length === 0 && newChips.length === 0 && movedChips.length === 0 && newLines.length === 0) return;

  newCols.forEach((col) => {
    col.style.transition = 'none';
    col.style.opacity = '0';
    col.style.transform = 'translateY(10px)';
  });
  newChips.forEach((chip) => {
    chip.style.transition = 'none';
    chip.style.opacity = '0';
  });
  movedChips.forEach(({ chip, dx, dy }) => {
    chip.style.transition = 'none';
    chip.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  newLines.forEach((path) => {
    path.style.transition = 'none';
    path.style.opacity = '0';
  });

  // força o navegador a "commitar" o estado inicial antes de mudar pro
  // estado final no próximo frame (mesmo truque usado em alignColumnToParents).
  void container.getBoundingClientRect();

  requestAnimationFrame(() => {
    newCols.forEach((col) => {
      col.style.transition = '';
      col.style.opacity = '';
      col.style.transform = '';
    });
    newChips.forEach((chip) => {
      chip.style.transition = '';
      chip.style.opacity = '';
    });
    movedChips.forEach(({ chip }) => {
      chip.style.transition = '';
      chip.style.transform = '';
    });
    newLines.forEach((path) => {
      path.style.transition = '';
      path.style.opacity = '';
    });
  });
}

/* Média do rank (posição vertical já atribuída) dos pré-requisitos de um item, usado só pra ordenação. */
function averageParentRank(item, rank) {
  const parentRanks = (item.requisito || [])
    .map((reqId) => rank.get(reqId))
    .filter((r) => r !== undefined);
  if (parentRanks.length === 0) return Infinity;
  return parentRanks.reduce((sum, r) => sum + r, 0) / parentRanks.length;
}

/*
 Aproxima cada chip da coluna da posição Y real (média dos centros) dos
 seus pré-requisitos já renderizados em colunas anteriores — em vez de
 só ordenar (ver averageParentRank), empurra o chip pra baixo com
 margin-top quando o pai está mais abaixo do que a posição natural dele
 na pilha. Nunca reordena e nunca sobrepõe o chip anterior: só puxa pra
 baixo (extra <= 0 é ignorado), então a coluna anterior sempre "vence"
 quando é mais densa. Como as colunas são processadas em ordem crescente
 de profundidade, toda coluna anterior já está com seu alinhamento
 definitivo quando esta função mede as posições dos pais.
 */
function alignColumnToParents(wrap, itemsAtDepth) {
  itemsAtDepth.forEach((item) => {
    const chip = wrap.querySelector(`.item-chip[data-item-id="${item.id}"]`);
    if (!chip) return;

    const parentCenters = (item.requisito || [])
      .map((reqId) => wrap.querySelector(`.item-chip[data-item-id="${reqId}"]`))
      .filter(Boolean)
      .map((parentChip) => {
        const r = parentChip.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    if (parentCenters.length === 0) return;

    const avgParentCenter = parentCenters.reduce((sum, c) => sum + c, 0) / parentCenters.length;
    const chipRect = chip.getBoundingClientRect();
    const extra = avgParentCenter - chipRect.height / 2 - chipRect.top;

    if (extra > 0) {
      // sem isso, o margin-top novo dispara a transition de margin do
      // .item-chip (o getBoundingClientRect logo acima já forçou um
      // reflow com o valor antigo) — o chip só chegaria na posição
      // certa 0.25s depois, e o drawDependencyLines() (chamado no fim
      // do render, no mesmo tick) desenharia a linha pra posição velha.
      chip.style.transition = 'none';
      chip.dataset.alignTop = extra;
      chip.style.marginTop = `${extra}px`;
      chip.getBoundingClientRect();
      chip.style.transition = '';
    }
  });
}

/*
 Os chips levam ~0.25s (CSS) pra encolher/reaparecer quando um filtro muda,
 e isso empurra os outros chips da coluna pra cima/baixo. Se recalculássemos
 as linhas na hora, pegaríamos a posição antiga (meio da transição) — por
 isso espera a transição acabar antes de redesenhar.
 */
const redrawLinesAfterTransition = debounce(drawDependencyLines, 280);

/*
 Desenha as linhas (curvas bezier) conectando cada pré-requisito ao item
 que depende dele, dentro do <svg> que já está posicionado como filho de
 .depth-columns (por isso rola junto com o scroll horizontal das colunas).
 Recalculado no resize e sempre que o grafo é remontado.
 */
function drawDependencyLines() {
  const wrap = document.querySelector('.depth-columns');
  const svg = wrap?.querySelector('.dep-lines');
  if (!wrap || !svg) return;

  svg.setAttribute('width', wrap.scrollWidth);
  svg.setAttribute('height', wrap.scrollHeight);

  const wrapRect = wrap.getBoundingClientRect();
  const paths = [];

  state.items.forEach((item) => {
    const requisitos = item.requisito || [];
    const toChip = wrap.querySelector(`.item-chip[data-item-id="${item.id}"]`);
    if (!toChip) return;

    requisitos.forEach((reqId) => {
      const fromChip = wrap.querySelector(`.item-chip[data-item-id="${reqId}"]`);
      if (!fromChip) return;

      const fromRect = fromChip.getBoundingClientRect();
      const toRect = toChip.getBoundingClientRect();

      const x1 = fromRect.right - wrapRect.left + wrap.scrollLeft;
      const y1 = fromRect.top - wrapRect.top + wrap.scrollTop + fromRect.height / 2;
      const x2 = toRect.left - wrapRect.left + wrap.scrollLeft;
      const y2 = toRect.top - wrapRect.top + wrap.scrollTop + toRect.height / 2;

      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

      paths.push(`<path d="${d}" data-from="${reqId}" data-to="${item.id}"></path>`);
    });
  });

  svg.innerHTML = paths.join('');
  applyFilterVisibility(); // reaplica chip-hidden/line-hidden — svg foi recriado do zero
}

// ---- popover (detalhe do item, reaproveitado por todos os chips) ----

/*
 Preenche e abre o popover único (#item-popover) com os detalhes do item
 clicado: preço/gratuito, tipo, nível, observação (se houver), link externo
 e o checkbox de "concluído".
 */
function openPopover(item, chipEl) {
  const popover = document.getElementById('item-popover');

  const priceTag = item.gratuito
    ? '<span class="tag tag-free">gratuito</span>'
    : `<span class="tag tag-paid">$${item.preco_usd ?? '?'}</span>`;

  popover.innerHTML = `
    <h4>${escapeHtml(item.nome)}</h4>
    <p>${priceTag} <span style="text-transform:capitalize">${escapeHtml(item.tipo)}</span> · ${escapeHtml(item.nivel)}</p>
    ${item.obs ? `<p>${escapeHtml(item.obs)}</p>` : ''}
    <p><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Acessar →</a></p>
    <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text-dim);cursor:pointer;">
      <input type="checkbox" id="popover-done-check" ${state.done[item.id] ? 'checked' : ''} />
      Marcar como concluído
    </label>
  `;

  popover.classList.remove('hidden');

  positionPopover(popover, chipEl);

  popover.querySelector('#popover-done-check').addEventListener('change', (e) => {
    state.done[item.id] = e.target.checked;
    saveProgress();
    // o mesmo item aparece como chips diferentes em cada matriz (por nicho
    // e por pré-requisitos) — atualiza todas as ocorrências, não só a que
    // foi clicada, senão uma fica marcada e a outra só sincroniza no reload.
    document.querySelectorAll(`.item-chip[data-item-id="${item.id}"]`).forEach((el) => {
      el.classList.toggle('done', e.target.checked);
    });
  });
}

/*
 Posiciona o popover:
 - em telas estreitas (<640px), deixa como está (CSS centraliza na tela)
 - em telas largas, calcula um ponto perto do chip clicado, e inverte pra
   abrir pra cima se não houver espaço vertical suficiente embaixo
 */
function positionPopover(popover, chipEl) {
  const isWide = window.innerWidth >= 640;

  if (!isWide) {
    popover.classList.remove('positioned');
    popover.style.top = '';
    popover.style.left = '';
    return;
  }

  const rect = chipEl.getBoundingClientRect();
  const popW = 280;
  const margin = 8;

  let left = rect.left;
  let top = rect.bottom + margin;

  if (left + popW > window.innerWidth - margin) {
    left = window.innerWidth - popW - margin;
  }
  if (top + 200 > window.innerHeight - margin) {
    top = rect.top - margin; // abre pra cima se não couber embaixo
    popover.style.transform = 'translateY(-100%)';
  } else {
    popover.style.transform = 'none';
  }

  popover.classList.add('positioned');
  popover.style.left = `${Math.max(margin, left)}px`;
  popover.style.top = `${Math.max(margin, top)}px`;
}

function closePopover() {
  const popover = document.getElementById('item-popover');
  popover.classList.add('hidden');
}

/*
 Fecha o popover em três situações: clique fora dele, tecla Esc, ou
 redimensionamento da janela (a posição calculada ficaria desatualizada).
 */
function bindPopoverDismiss() {
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('item-popover');
    if (!popover.contains(e.target)) closePopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopover();
  });

  window.addEventListener('resize', () => {
    if (!document.getElementById('item-popover').classList.contains('hidden')) {
      closePopover();
    }
  });
}

// timeout do fechamento "por hover" — dá tempo do mouse atravessar o
// espaço entre o chip e o popover sem fechar no meio do caminho
let popoverCloseTimer = null;

function schedulePopoverClose() {
  clearTimeout(popoverCloseTimer);
  popoverCloseTimer = setTimeout(closePopover, 150);
}

function cancelPopoverClose() {
  clearTimeout(popoverCloseTimer);
}

/*
 Mantém o popover aberto quando o mouse entra nele (pra dar tempo de
 clicar no link "Acessar" ou no checkbox de concluído), usado pelos chips
 da matriz por pré-requisitos (ver renderChip com hoverPopover: true).
 */
function bindPopoverHoverKeep() {
  const popover = document.getElementById('item-popover');
  popover.addEventListener('mouseenter', cancelPopoverClose);
  popover.addEventListener('mouseleave', schedulePopoverClose);
}

// ---- utils ----

/* Escapa &, < e > pra uso seguro como texto dentro de HTML (evita XSS via dados do JSON). */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* Escapa aspas duplas pra uso seguro dentro de um atributo HTML (ex: href). */
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

/* Atrasa a execução de fn até `wait`ms depois do último disparo (usado no resize). */
function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

let toastHideTimer;

/* Mostra um aviso rápido no rodapé da tela, some sozinho depois de ~2s. */
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
  raf(() => toast.classList.add('visible'));

  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

init();