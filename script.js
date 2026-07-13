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
    bindFilters();
    bindPopoverDismiss();
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
 até o clique, dentro do popover.
 */
function renderChip(item) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `item-chip nivel-${normalizeNivel(item.nivel)}`;
  chip.dataset.itemId = item.id;
  chip.textContent = item.nome;
  if (state.done[item.id]) chip.classList.add('done');

  chip.addEventListener('click', (e) => {
    e.stopPropagation(); // evita que o listener global de "clique fora" feche o popover na hora
    openPopover(item, chip);
  });

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
    chip.classList.toggle('chip-hidden', !itemMatchesFilters(item));
  });

  document.querySelectorAll('.level-row').forEach((row) => {
    const visibleCount = row.querySelectorAll('.item-chip:not(.chip-hidden)').length;
    row.classList.toggle('row-collapsed', visibleCount === 0);
  });

  document.querySelectorAll('.niche-col').forEach((col) => {
    const visibleCount = col.querySelectorAll('.item-chip:not(.chip-hidden)').length;
    col.classList.toggle('col-hidden', visibleCount === 0);
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
    });
  });

  document.querySelectorAll('[data-filter-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.filterType;
      state.activeType = state.activeType === val ? null : val;
      refreshFilterButtons();
      applyFilterVisibility();
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
    chipEl.classList.toggle('done', e.target.checked);
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

init();