'use strict';
/* =========================================================
   UI base: shell, navegación, login, modales, toasts,
   componentes y gráficos.
   ========================================================= */

const SECTIONS = [
  { id: 'panel', label: 'Panel principal', short: 'Panel', icon: 'layout-dashboard', group: 'Principal', net: true },
  { id: 'calendario', label: 'Calendario', short: 'Calendario', icon: 'calendar-days', group: 'Principal', net: true },
  { id: 'ideas', label: 'Ideas', short: 'Ideas', icon: 'lightbulb', group: 'Principal' },
  { id: 'metricas', label: 'Métricas', short: 'Métricas', icon: 'chart-line', group: 'Principal', net: true },
  { id: 'guiones', label: 'Guiones IA', short: 'Guiones', icon: 'scroll-text', group: 'Crear con IA' },
  { id: 'carruseles', label: 'Carruseles IA', short: 'Carruseles', icon: 'gallery-horizontal-end', group: 'Crear con IA' },
  { id: 'editor', label: 'Editor de video', short: 'Editor', icon: 'clapperboard', group: 'Crear con IA' },
  { id: 'competencia', label: 'Competencia', short: 'Competencia', icon: 'radar', group: 'Inteligencia' },
  { id: 'conexiones', label: 'Conexiones', short: 'Conexiones', icon: 'plug-zap', group: 'Cuenta' },
  { id: 'configuracion', label: 'Configuración', short: 'Ajustes', icon: 'settings', group: 'Cuenta' },
];
const SUBTITLES = {
  panel: 'Resumen de tu semana y de todas tus redes',
  calendario: 'Tu mes completo, día por día',
  ideas: 'Capturá ideas rápidas para futuros contenidos',
  metricas: 'Números claros de cada red social',
  guiones: 'Guiones completos con gancho, desarrollo y cierre',
  carruseles: 'Filminas listas para publicar',
  editor: 'Cortá, acomodá y armá tus videos',
  competencia: 'Analizá a tu competencia y aprendé de sus movimientos',
  conexiones: 'Conectá tus plataformas y herramientas',
  configuracion: 'Perfil, seguridad y preferencias',
};
const RENDER = {}; // id -> function(el)

/* ---------- Componentes ---------- */
const netDot = (n, size = 22) => `<span class="net-dot" style="background:${NET[n].grad};width:${size}px;height:${size}px">${SVG[n]}</span>`;
const netBadge = p => `<span class="net-badge">${netDot(netOf(p))}${FORMATS[p.format].label}</span>`;
const statusBadge = s => `<span class="badge ${STATUS[s].cls}">${ico(STATUS[s].icon)}${STATUS[s].label}</span>`;
const deltaPill = (v, suffix = '%', digits = 1) => {
  const up = v >= 0;
  return `<span class="delta ${up ? 'up' : 'down'}">${ico(up ? 'arrow-up-right' : 'arrow-down-right', 'w-4 h-4')}${up ? '+' : '−'}${dec(Math.abs(v), digits)}${suffix}</span>`;
};
const brandMark = (size = 40) => `<span class="rounded-xl flex items-center justify-center font-display font-extrabold shrink-0" style="width:${size}px;height:${size}px;background:var(--gold-grad);color:var(--on-gold);font-size:${Math.round(size * .3)}px;letter-spacing:.04em;box-shadow:0 4px 20px rgba(229,172,0,.3)">HIM</span>`;
const initials = name => (name || App.settings.brand || 'HIM').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function mediaEl(p, cls) {
  if (p.media && p.media.type && p.media.type.startsWith('video')) return `<video src="${esc(p.media.url)}" class="${cls}" muted loop playsinline autoplay preload="metadata"></video>`;
  return `<img src="${esc(p.media ? p.media.url : (p.img || PLACEHOLDER))}" class="${cls}" alt="" loading="lazy" decoding="async">`;
}
function sectionHead(title, sub, right = '') {
  return `<div class="flex flex-wrap items-end justify-between gap-4 mb-6 md:mb-8">
    <div class="min-w-0"><p class="text-[11px] tracking-[.26em] uppercase text-dim font-bold">${esc(sub)}</p>
    <h1 class="font-display text-2xl md:text-4xl font-semibold mt-1.5">${title}</h1></div>${right}</div>`;
}
function emptyBlock(icon, title, text, btn = '') {
  return `<div class="card p-8 md:p-12 text-center">
    <span class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico(icon, 'w-6 h-6')}</span>
    <p class="font-display text-lg mt-4">${title}</p><p class="text-sm text-muted mt-1 max-w-md mx-auto">${text}</p>${btn ? `<div class="mt-6">${btn}</div>` : ''}</div>`;
}
const aiBadge = () => AI.ok
  ? `<span class="badge badge-soft">${ico('sparkles')}IA de Claude activa</span>`
  : `<span class="badge badge-muted" title="Abrí la app en claude.ai para usar la IA real">${ico('flask-conical')}Modo demo sin IA</span>`;

/* ---------- Toasts ---------- */
function toast(msg, { icon = 'circle-check', action, onAction, error = false, ms } = {}) {
  const el = document.createElement('div');
  el.className = 'card glass w-full px-4 py-3 flex items-center gap-3 shadow-2xl rise';
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<span style="color:${error ? 'var(--down)' : 'var(--gold)'}">${ico(icon, 'w-5 h-5')}</span><span class="text-sm flex-1">${esc(msg)}</span>${action ? `<button class="text-sm font-bold min-h-[44px] px-2" style="color:var(--gold-light)">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { onAction(); el.remove(); };
  $('#toasts').appendChild(el); icons();
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, ms || (action ? 5500 : 3400));
}

/* ---------- Modales ---------- */
const Modal = {
  lastFocus: null, onClose: null,
  open(html, { size = 'md', label = 'Diálogo', onClose = null } = {}) {
    if ($('#modalRoot').innerHTML) this.close(true);
    this.lastFocus = document.activeElement; this.onClose = onClose;
    const w = { sm: 'md:max-w-md', md: 'md:max-w-3xl', lg: 'md:max-w-5xl', xl: 'md:max-w-6xl' }[size];
    $('#modalRoot').innerHTML = `<div class="overlay" data-overlay><div class="sheet ${w}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
    icons();
    const first = $('#modalRoot [data-autofocus]') || $('#modalRoot button');
    first && first.focus({ preventScroll: true });
  },
  close(silent) {
    if (!$('#modalRoot').innerHTML) return;
    const cb = this.onClose; this.onClose = null;
    $('#modalRoot').innerHTML = '';
    document.body.style.overflow = '';
    cb && cb();
    if (!silent && this.lastFocus && this.lastFocus.isConnected) this.lastFocus.focus({ preventScroll: true });
  },
  get isOpen() { return !!$('#modalRoot').innerHTML; },
};
const modalHead = (title, sub = '', extra = '') => `<div class="sheet-head border-b border-white/5"><div class="grabber md:hidden"></div>
  <div class="flex items-center gap-3 px-5 md:px-7 py-4">${extra}<div class="min-w-0 flex-1"><h2 class="font-display text-lg md:text-xl font-semibold truncate">${title}</h2>${sub ? `<p class="text-xs text-muted mt-0.5 truncate">${sub}</p>` : ''}</div>
  <button class="icon-btn" data-action="closeModal" aria-label="Cerrar">${ico('x', 'w-5 h-5')}</button></div></div>`;
Actions.closeModal = () => Modal.close();

/** Confirmación construida en la página (confirm() no existe en el visor). */
function confirmBox({ title, text, ok = 'Confirmar', danger = false, icon = 'circle-alert' }) {
  return new Promise(resolve => {
    Modal.open(`<div class="p-6 md:p-8 text-center"><div class="grabber md:hidden -mt-4 mb-4"></div>
      <span class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${danger ? 'bg-red-500/10 text-red-300 border border-red-500/30' : ''}" style="${danger ? '' : 'background:var(--gold-soft);color:var(--gold)'}">${ico(icon, 'w-6 h-6')}</span>
      <h2 class="font-display text-xl font-semibold mt-4">${title}</h2><p class="text-sm text-muted mt-2">${text}</p>
      <div class="flex flex-col-reverse sm:flex-row gap-3 justify-center mt-6">
        <button class="btn-ghost" data-confirm="0" data-autofocus>Cancelar</button>
        <button class="${danger ? 'btn-ghost btn-danger' : 'btn-gold'}" data-confirm="1">${ok}</button></div></div>`,
      { size: 'sm', label: title, onClose: () => resolve(false) });
    $$('#modalRoot [data-confirm]').forEach(b => b.onclick = () => { const v = b.dataset.confirm === '1'; Modal.onClose = null; Modal.close(); resolve(v); });
  });
}

/* ---------- Descarga de archivos (capacidad downloads en claude.ai, enlace local fuera) ---------- */
let downloadsCap;
async function saveFile(filename, data) {
  if (downloadsCap === undefined) downloadsCap = (window.claude && typeof claude.use === 'function') ? await claude.use('downloads').catch(() => null) : null;
  if (downloadsCap) {
    try { await downloadsCap.save({ filename, data }); toast('Archivo listo: ' + filename, { icon: 'download' }); return true; }
    catch (e) { if (e?.code !== 'declined') toast(e?.code === 'rate_limited' ? 'Ya hay una descarga esperando confirmación.' : 'No se pudo descargar el archivo.', { icon: 'circle-alert', error: true }); return false; }
  }
  if (window.claude) { toast('Las descargas no están disponibles en esta vista.', { icon: 'circle-alert', error: true }); return false; }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return true;
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles', { icon: 'copy' }); }
  catch { if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Seleccioné el texto: copialo con Ctrl+C', { icon: 'copy' }); }
}

/* ---------- Gráficos ---------- */
const ChartMeta = new WeakMap();
/** Gráfico de líneas con área, grilla, etiquetas y tooltip. */
function lineChart({ series, labels, height = 240, yFormat = fmtN, xEvery = 5, pct = false }) {
  const W = 680, H = height, L = 52, R = 18, T = 18, B = 30;
  const vals = series.flatMap(s => s.values);
  let min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || Math.abs(max) || 1; min -= span * .08; max += span * .1;
  const n = series[0].values.length;
  const x = i => L + i / (n - 1) * (W - L - R), y = v => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map(i => min + (max - min) * (i / 3));
  const grid = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#1F2533"/><text x="${L - 8}" y="${y(t) + 3.5}" text-anchor="end" font-size="10.5" fill="#6B7180">${yFormat(t)}</text>`).join('');
  const xl = labels.map((lb, i) => (i % xEvery === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="#6B7180">${lb}</text>` : '').join('');
  const paths = series.map((s, si) => {
    const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const last = s.values.at(-1);
    return `${s.area ? `<path class="area-in" d="${d} L${x(n - 1)} ${H - B} L${L} ${H - B}Z" fill="url(#gArea)"/>` : ''}
      <path class="draw" pathLength="1" style="animation-delay:${si * 150}ms" d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.6}" stroke-linecap="round" stroke-linejoin="round"/>
      <circle class="area-in" cx="${x(n - 1)}" cy="${y(last)}" r="5" fill="${s.dot || s.color}" stroke="#141821" stroke-width="3"/>`;
  }).join('');
  const id = 'c' + uid();
  setTimeout(() => { const el = document.getElementById(id); if (el) ChartMeta.set(el, { series, labels, x, L, W, R, H, T, B, yFormat }); });
  return `<div class="relative" data-chart="${id}"><svg id="${id}" viewBox="0 0 ${W} ${H}" class="w-full h-auto block" role="img" aria-label="${esc(series.map(s => s.name).join(', '))}">
    ${grid}${xl}${paths}<line class="guide" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--gold)" stroke-dasharray="3 3" opacity="0"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" data-hover="${id}"/></svg><div class="chart-tip" hidden></div></div>`;
}
document.addEventListener('pointermove', e => {
  const r = e.target.closest && e.target.closest('[data-hover]');
  $$('[data-chart] .chart-tip:not([hidden])').forEach(t => { if (!r || t.parentElement.dataset.chart !== r.dataset.hover) { t.hidden = true; t.parentElement.querySelector('.guide').setAttribute('opacity', 0); } });
  if (!r) return;
  const svg = document.getElementById(r.dataset.hover), m = ChartMeta.get(svg); if (!m) return;
  const box = svg.getBoundingClientRect(), sx = (e.clientX - box.left) / box.width * m.W;
  const n = m.series[0].values.length;
  const i = clamp(Math.round((sx - m.L) / (m.W - m.L - m.R) * (n - 1)), 0, n - 1);
  const wrap = svg.parentElement, tip = wrap.querySelector('.chart-tip'), g = wrap.querySelector('.guide');
  g.setAttribute('x1', m.x(i)); g.setAttribute('x2', m.x(i)); g.setAttribute('opacity', .7);
  tip.innerHTML = `<div class="text-[11px] text-dim mb-1">${esc(m.labels[i])}</div>` + m.series.map(s => `<div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${s.dot || s.color}"></span>${esc(s.name)} <b class="ml-auto pl-3">${m.yFormat(s.values[i])}</b></div>`).join('');
  tip.hidden = false; tip.style.left = (m.x(i) / m.W * box.width) + 'px'; tip.style.top = '18px';
});
/** Barras verticales (una por red) con animación de crecimiento. */
function barChart(items, { height = 240, format = fmtN } = {}) {
  const W = 520, H = height, T = 34, B = 46, max = Math.max(...items.map(i => i.value)) * 1.08 || 1;
  const bw = Math.min(96, (W - 40) / items.length * .52), gap = (W - 40 - bw * items.length) / (items.length);
  const bars = items.map((it, i) => {
    const h = it.value / max * (H - T - B), x = 20 + gap / 2 + i * (bw + gap), y = H - B - h;
    return `<rect class="bar-grow" style="animation-delay:${i * 120}ms" x="${x}" y="${y}" width="${bw}" height="${h}" rx="12" fill="${it.fill}"/>
      <text class="area-in" x="${x + bw / 2}" y="${y - 12}" text-anchor="middle" font-size="20" font-weight="700" fill="#EFECE4" font-family="Outfit">${format(it.value)}</text>
      <text x="${x + bw / 2}" y="${H - 16}" text-anchor="middle" font-size="16" font-weight="600" fill="#9A9FAC">${esc(it.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto block" role="img" aria-label="Comparación entre redes">
    <line x1="14" x2="${W - 14}" y1="${H - B}" y2="${H - B}" stroke="#252B38"/>${bars}</svg>`;
}
function sparkline(values, color = 'url(#gGoldH)') {
  const w = 160, h = 40, max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [i / (values.length - 1) * w, h - 4 - (v - min) / ((max - min) || 1) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-10" preserveAspectRatio="none" aria-hidden="true"><path class="area-in" d="${d} L${w} ${h} L0 ${h}Z" fill="url(#gArea)"/><path class="draw" pathLength="1" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function ring(pct) {
  const r = 46, C = 2 * Math.PI * r, v = Math.min(pct, 200) / 200;
  return `<svg viewBox="0 0 120 120" class="w-28 h-28 md:w-32 md:h-32 shrink-0" role="img" aria-label="${Math.round(pct)}% del promedio">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="#252B38" stroke-width="10"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#gGoldH)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" fill="#FFD84D" font-family="Outfit" font-size="24" font-weight="600">${Math.round(pct)}%</text>
    <text x="60" y="76" text-anchor="middle" fill="#6B7180" font-size="9" letter-spacing="1">DEL PROMEDIO</text></svg>`;
}

/* ---------- Shell: sidebar, topbar, navegación ---------- */
function navList(drawer = false) {
  let last = '';
  return SECTIONS.map(s => {
    const g = s.group !== last ? `<div class="nav-group">${s.group}</div>` : ''; last = s.group;
    return g + `<button class="nav-item" data-action="go" data-to="${s.id}" ${App.section === s.id ? 'aria-current="page"' : ''}>${ico(s.icon, 'w-[18px] h-[18px]')}<span>${s.label}</span>
      ${s.id === 'ideas' && App.ideas.filter(i => i.status === 'nueva').length ? `<span class="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:var(--gold-soft);color:var(--gold-light)">${App.ideas.filter(i => i.status === 'nueva').length}</span>` : ''}</button>`;
  }).join('');
}
function renderSidebar() {
  const S = App.settings;
  $('#sidebar').innerHTML = `
    <div class="flex items-center gap-3 px-2">${brandMark(42)}<div class="leading-tight min-w-0">
      <div class="font-display font-bold tracking-[.06em] text-[14px] leading-tight gold-text">${esc(S.brand.toUpperCase())}</div>
      <div class="text-[10px] tracking-[.28em] text-dim">CONTENT STUDIO</div></div></div>
    <nav class="mt-4 flex flex-col gap-0.5" aria-label="Secciones">${navList()}</nav>
    <div class="mt-auto pt-5 flex flex-col gap-2">
      <div class="well p-3 text-xs flex flex-col gap-2">
        <div class="flex items-center gap-2">${AI.ok ? `<span class="w-2 h-2 rounded-full" style="background:var(--up)"></span>IA de Claude activa` : `<span class="w-2 h-2 rounded-full bg-zinc-500"></span>IA en modo demo`}</div>
        <div class="flex items-center gap-2 text-muted">${ico(Store.mode === 'cloud' ? 'cloud' : 'hard-drive', 'w-3.5 h-3.5')}${Store.mode === 'cloud' ? 'Datos sincronizados en tu cuenta' : 'Datos guardados en este navegador'}</div>
      </div>
      <div class="flex items-center gap-3 p-2 rounded-2xl">
        <span class="w-10 h-10 rounded-full flex items-center justify-center font-display font-semibold text-sm shrink-0" style="background:#1A1F2B;box-shadow:0 0 0 2px var(--gold);color:var(--gold-light)">${esc(initials(S.displayName || Auth.record?.username))}</span>
        <div class="min-w-0 flex-1 leading-tight"><div class="text-sm font-semibold truncate">${esc(S.displayName || Auth.record?.username || 'Creador')}</div><div class="text-[11px] text-gold truncate">${esc(S.handle)}</div></div>
        <button class="icon-btn sm" data-action="logout" aria-label="Cerrar sesión">${ico('log-out')}</button>
      </div>
    </div>`;
}
function renderTopbar() {
  const s = SECTIONS.find(x => x.id === App.section);
  const opts = [['all', 'Todas'], ...NETS.map(n => [n, NET[n].label])];
  const netIcon = k => k === 'all' ? ico('layers') : `<span class="w-4 h-4 inline-flex">${SVG[k]}</span>`;
  $('#topbar').innerHTML = `<div class="max-w-[1400px] mx-auto px-4 md:px-8 h-16 md:h-[72px] flex items-center gap-3">
      <button class="icon-btn lg:hidden -ml-2" data-action="drawer" aria-label="Abrir menú">${ico('menu', 'w-5 h-5')}</button>
      <div class="lg:hidden flex items-center gap-2 min-w-0">${brandMark(34)}<span class="font-display font-bold text-sm tracking-[.08em] gold-text truncate">${esc(s.short.toUpperCase())}</span></div>
      <div class="hidden lg:block min-w-0"><div class="text-[11px] text-dim tracking-[.2em] uppercase font-bold">${esc(App.settings.brand)}</div><div class="font-display font-semibold text-lg truncate">${s.label}</div></div>
      ${s.net ? `<div class="seg hidden md:inline-flex ml-auto lg:ml-6" role="group" aria-label="Filtrar por red social">${opts.map(([k, l]) => `<button data-action="net" data-net="${k}" aria-pressed="${App.network === k}">${netIcon(k)}<span class="hidden xl:inline">${l}</span></button>`).join('')}</div>` : ''}
      <div class="ml-auto flex items-center gap-1.5 md:gap-2">
        <button class="btn-gold hidden md:inline-flex" data-action="create">${ico('plus')}Crear Publicación</button>
        <div class="relative">
          <button class="icon-btn relative" id="bellBtn" data-action="notif" aria-label="Notificaciones" aria-haspopup="true" aria-expanded="false">${ico('bell', 'w-5 h-5')}<span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full" style="background:var(--gold);box-shadow:0 0 0 3px var(--bg)"></span></button>
          <div id="notifPanel" class="hidden absolute right-0 top-14 w-[min(92vw,360px)] card p-2 shadow-2xl z-50" role="menu"></div>
        </div>
        <button class="w-10 h-10 rounded-full flex items-center justify-center font-display font-semibold text-sm" data-action="go" data-to="configuracion" aria-label="Configuración de perfil" style="background:#1A1F2B;box-shadow:0 0 0 2px var(--gold);color:var(--gold-light)">${esc(initials(App.settings.displayName || Auth.record?.username))}</button>
      </div>
    </div>
    ${s.net ? `<div class="md:hidden px-4 pb-3"><div class="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Filtrar por red social">${opts.map(([k, l]) => `<button class="chip" data-action="net" data-net="${k}" aria-pressed="${App.network === k}">${netIcon(k)}${l}</button>`).join('')}</div></div>` : ''}`;
}
function renderBottomNav() {
  const items = ['panel', 'calendario', 'ideas', 'metricas'].map(id => SECTIONS.find(s => s.id === id));
  const more = !items.some(s => s.id === App.section);
  $('#bottomNav').innerHTML = `<div class="grid grid-cols-5 h-[68px]">${items.map(s => `
    <button data-action="go" data-to="${s.id}" ${App.section === s.id ? 'aria-current="page"' : ''} class="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold" style="color:${App.section === s.id ? 'var(--gold-light)' : '#7D8394'}">
      <span class="w-12 h-7 rounded-full flex items-center justify-center" style="${App.section === s.id ? 'background:var(--gold-soft)' : ''}">${ico(s.icon, 'w-5 h-5')}</span>${s.short}</button>`).join('')}
    <button data-action="drawer" class="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold" style="color:${more ? 'var(--gold-light)' : '#7D8394'}">
      <span class="w-12 h-7 rounded-full flex items-center justify-center" style="${more ? 'background:var(--gold-soft)' : ''}">${ico('grid-2x2', 'w-5 h-5')}</span>Más</button></div>`;
}
Actions.drawer = () => {
  $('#drawer').innerHTML = `<div class="overlay !items-stretch !justify-start !p-0" data-drawer>
    <div class="h-full w-[min(86vw,320px)] overflow-y-auto px-4 py-5 flex flex-col" style="background:#0E1219;border-right:1px solid var(--gold-line);animation:fade .25s" role="dialog" aria-modal="true" aria-label="Menú">
      <div class="flex items-center gap-3 px-2">${brandMark(40)}<div class="font-display font-bold tracking-[.1em] gold-text flex-1 truncate">${esc(App.settings.brand.toUpperCase())}</div>
      <button class="icon-btn" data-action="closeDrawer" aria-label="Cerrar menú">${ico('x', 'w-5 h-5')}</button></div>
      <nav class="mt-3 flex flex-col gap-0.5">${navList(true)}</nav>
      <button class="nav-item mt-4" data-action="logout">${ico('log-out', 'w-[18px] h-[18px]')}Cerrar sesión</button>
    </div></div>`;
  icons();
};
Actions.closeDrawer = () => { $('#drawer').innerHTML = ''; };

function go(id, { scroll = true } = {}) {
  if (!SECTIONS.some(s => s.id === id)) id = 'panel';
  if (App.section === 'editor' && id !== 'editor' && window.Editor) Editor.pause();
  App.section = id;
  track('section_view', { id });
  try { history.replaceState(null, '', '#' + id); } catch {}
  $('#drawer').innerHTML = '';
  renderShell();
  renderSection();
  if (scroll) window.scrollTo({ top: 0 });
}
function renderShell() { renderSidebar(); renderTopbar(); renderBottomNav(); $('#fab').hidden = App.section === 'editor'; }
function renderSection() {
  const el = $('#view');
  el.innerHTML = '';
  (RENDER[App.section] || RENDER.panel)(el);
  icons();
}
Actions.go = el => go(el.dataset.to);
Actions.net = el => { App.network = el.dataset.net; renderTopbar(); renderSection(); icons(); };

/* ---------- Notificaciones ---------- */
function toggleNotif(force) {
  const panel = $('#notifPanel'); if (!panel) return;
  const open = force ?? panel.classList.contains('hidden');
  if (open) {
    const pub = App.posts.filter(p => p.status === 'published').sort((a, b) => b.m.views - a.m.views)[0];
    const next = App.posts.filter(p => p.status === 'scheduled' && new Date(p.date) > new Date()).sort((a, b) => a.date.localeCompare(b.date))[0];
    const st = netStats('all');
    const items = [
      pub && ['trending-up', `“${pub.title}” superó ${fmtN(pub.m.views)} vistas`, 'Rendimiento', `data-action="analytics" data-id="${pub.id}"`],
      next && ['calendar-clock', `“${next.title}” ${relLabel(next.date).toLowerCase()}`, fmtDate(next.date), `data-action="editPost" data-id="${next.id}"`],
      ['users', `Sumaste ${fmtInt(st.newFollowers)} seguidores en 30 días`, 'Hito de crecimiento', 'data-action="go" data-to="metricas"'],
      App.ideas.length ? ['lightbulb', `Tenés ${App.ideas.filter(i => i.status === 'nueva').length} ideas sin desarrollar`, 'Ideas', 'data-action="go" data-to="ideas"'] : null,
    ].filter(Boolean);
    panel.innerHTML = `<p class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-[.2em] text-dim font-bold">Notificaciones</p>` + items.map(([i, t, s, a]) => `
      <button ${a} role="menuitem" class="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-white/[.04] text-left transition">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:var(--gold-soft);color:var(--gold)">${ico(i)}</span>
        <span class="min-w-0"><span class="block text-sm leading-snug">${esc(t)}</span><span class="block text-[11px] text-dim mt-0.5">${esc(s)}</span></span></button>`).join('');
    icons();
  }
  panel.classList.toggle('hidden', !open);
  $('#bellBtn')?.setAttribute('aria-expanded', open);
}
Actions.notif = () => toggleNotif();

/* =========================================================
   LOGIN / REGISTRO
   ========================================================= */
const eyeBtn = id => `<button type="button" class="icon-btn absolute right-1 top-1/2 -translate-y-1/2" data-action="toggleEye" data-for="${id}" aria-label="Mostrar contraseña" aria-pressed="false">${ico('eye', 'w-[18px] h-[18px]')}</button>`;
Actions.toggleEye = el => {
  const inp = document.getElementById(el.dataset.for); if (!inp) return;
  const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
  el.setAttribute('aria-pressed', show); el.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  el.innerHTML = ico(show ? 'eye-off' : 'eye', 'w-[18px] h-[18px]'); icons();
};
const pwField = (id, label, auto = 'current-password', extra = '') => `<div><label class="label" for="${id}">${label}</label>
  <div class="relative"><input id="${id}" type="password" class="input pr-12" autocomplete="${auto}" maxlength="128" ${extra}>${eyeBtn(id)}</div></div>`;
const strengthBar = id => `<div class="mt-2"><div class="h-1.5 rounded-full bg-[#252B38] overflow-hidden"><div id="${id}" class="h-full rounded-full transition-all" style="width:0"></div></div><p id="${id}L" class="help"></p></div>`;
function paintStrength(barId, pw) {
  const s = pwStrength(pw), b = document.getElementById(barId), l = document.getElementById(barId + 'L');
  if (!b) return; b.style.width = pw ? (s.lvl + 1) * 25 + '%' : '0'; b.style.background = s.color;
  l.textContent = pw ? `Seguridad: ${s.label}. Usá 8+ caracteres con mayúsculas, números y símbolos.` : 'Mínimo 8 caracteres.';
}

/* Páginas legales (carpeta legal/, publicada junto a la app) */
const LEGAL = [['legal/terminos.html', 'Términos'], ['legal/privacidad.html', 'Privacidad'], ['legal/cookies.html', 'Cookies']];
const legalLinks = () => LEGAL.map(([href, t]) => `<a href="${href}" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-gold-light min-h-[24px] inline-flex items-center">${t}</a>`).join('');

function renderAuth(mode) {
  const cloud = Cloud.on;
  if (cloud && mode === 'create') mode = 'signup';
  const first = mode === 'create';
  $('#auth').hidden = false; $('#app').hidden = true; $('#boot').hidden = true;
  $('#auth').innerHTML = `<div class="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
    <section class="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden" style="background:linear-gradient(160deg,#141821,#0A0D14)">
      <div class="flex items-center gap-3">${brandMark(48)}<div class="font-display font-bold tracking-[.16em] gold-text text-lg">${esc(App.settings.brand.toUpperCase())}</div></div>
      <div class="max-w-lg">
        <p class="text-[11px] tracking-[.3em] uppercase text-gold font-bold">Content Studio</p>
        <h1 class="font-display text-5xl font-semibold leading-[1.05] mt-4">Planificá, creá con IA y medí tu contenido en un solo lugar.</h1>
        <ul class="mt-8 flex flex-col gap-3 text-muted">${[['scroll-text', 'Guiones y carruseles generados con IA'], ['clapperboard', 'Editor de video con asistente por prompts'], ['radar', 'Análisis de competencia y métricas por red']].map(([i, t]) => `<li class="flex items-center gap-3"><span class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico(i)}</span>${t}</li>`).join('')}</ul>
      </div>
      <div class="flex gap-3">${NETS.map(n => netDot(n, 36)).join('')}</div>
    </section>
    <section class="flex items-center justify-center px-4 py-10">
      <form id="authForm" class="w-full max-w-md card p-6 md:p-9 flex flex-col gap-5" novalidate>
        <div class="lg:hidden flex items-center gap-3">${brandMark(42)}<div class="font-display font-bold tracking-[.14em] gold-text">${esc(App.settings.brand.toUpperCase())}</div></div>
        ${cloud ? cloudAuthForm(mode) : `<div><h2 class="font-display text-2xl md:text-3xl font-semibold">${first ? 'Creá tu acceso' : 'Iniciar sesión'}</h2>
        <p class="text-sm text-muted mt-1.5">${first ? 'Elegí un usuario y una contraseña para proteger tu estudio.' : 'Ingresá con tu usuario y contraseña.'}</p></div>
        <div><label class="label" for="aUser">Usuario</label><input id="aUser" class="input" autocomplete="username" maxlength="40" value="${first ? '' : esc(Auth.record?.username || '')}" data-autofocus></div>
        ${pwField('aPass', 'Contraseña', first ? 'new-password' : 'current-password', first ? 'data-input="authStrength"' : '')}
        ${first ? strengthBar('aStr') + pwField('aPass2', 'Repetir contraseña', 'new-password') : ''}
        ${first ? '' : `<label class="flex items-center gap-2.5 text-sm text-muted cursor-pointer min-h-[44px]"><input id="aRemember" type="checkbox"> Recordarme en este dispositivo por 30 días</label>`}
        <p id="aErr" class="err hidden" role="alert"></p>
        <button class="btn-gold w-full" type="submit" id="aBtn">${ico(first ? 'shield-check' : 'log-in')}${first ? 'Crear acceso' : 'Entrar'}</button>
        ${first ? '' : `<button type="button" class="text-sm text-gold-light underline underline-offset-4 self-center min-h-[44px]" data-action="forgotPw">¿Olvidaste tu contraseña?</button>`}
        <p class="text-[11px] text-dim leading-relaxed flex gap-2">${ico('lock', 'w-3.5 h-3.5 shrink-0 mt-0.5')}La contraseña se guarda cifrada (PBKDF2-SHA256), nunca en texto plano.</p>`}
        <p class="text-[11px] text-dim flex flex-wrap gap-x-4 gap-y-1">${first ? 'Al crear tu acceso aceptás los ' : ''}${legalLinks()}</p>
      </form>
    </section></div>`;
  icons();
  $('#authForm').onsubmit = e => { e.preventDefault(); cloud ? cloudAuthSubmit(mode) : first ? doCreate() : doLogin(); };
  setTimeout(() => (cloud ? $('#aEmail') || $('#aPass') : first || !Auth.record?.username ? $('#aUser') : $('#aPass'))?.focus(), 50);
}
Inputs.authStrength = el => paintStrength('aStr', el.value);
function authErr(msg) { const e = $('#aErr'); e.textContent = msg; e.classList.toggle('hidden', !msg); }
async function doCreate() {
  const u = $('#aUser').value.trim(), p = $('#aPass').value, p2 = $('#aPass2').value;
  if (!/^[\w.\-]{3,40}$/.test(u)) return authErr('El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o guion bajo).');
  if (p.length < 8) return authErr('La contraseña debe tener al menos 8 caracteres.');
  if (pwStrength(p).lvl < 1) return authErr('La contraseña es muy débil. Sumá mayúsculas, números o símbolos.');
  if (p !== p2) return authErr('Las contraseñas no coinciden.');
  $('#aBtn').disabled = true;
  try { await Auth.create(u, p); Auth.startSession(false); if (!App.settings.displayName) await saveSettings({ displayName: u }); enterApp(); toast('Acceso creado. ¡Bienvenido!', { icon: 'shield-check' }); }
  catch (e) { console.warn(e); authErr('No se pudo crear el acceso. Intentá de nuevo.'); $('#aBtn').disabled = false; }
}
async function doLogin() {
  const lock = Auth.lockState();
  if (lock.until > Date.now()) return authErr(`Demasiados intentos. Esperá ${Math.ceil((lock.until - Date.now()) / 1000)} segundos.`);
  const u = $('#aUser').value, p = $('#aPass').value;
  if (!u.trim() || !p) return authErr('Completá usuario y contraseña.');
  $('#aBtn').disabled = true;
  try {
    if (await Auth.verify(u, p)) { Auth.clearFails(); Auth.startSession($('#aRemember')?.checked); enterApp(); }
    else { const s = Auth.registerFail(); authErr(s.until > Date.now() ? 'Demasiados intentos fallidos. Probá de nuevo en 60 segundos.' : 'Usuario o contraseña incorrectos.'); $('#aPass').value = ''; $('#aPass').focus(); }
  } catch (e) { authErr('No se pudo verificar. Intentá de nuevo.'); }
  $('#aBtn') && ($('#aBtn').disabled = false);
}
Actions.forgotPw = async () => {
  const ok = await confirmBox({ title: '¿Restablecer tu acceso?', text: 'Como la app ya está protegida por tu cuenta de claude.ai, podés crear un usuario y contraseña nuevos. Tus ideas, guiones y demás datos se mantienen.', ok: 'Crear nuevo acceso', icon: 'key-round' });
  if (!ok) return;
  Auth.record = null; Auth.endSession(); renderAuth('create');
};
Actions.logout = () => { if (Cloud.on) Cloud.sb.auth.signOut({ scope: 'local' }).catch(e => reportError(e, 'signOut')); Auth.endSession(); if (window.Editor) Editor.pause(); Modal.close(true); $('#drawer').innerHTML = ''; renderAuth('login'); toast('Sesión cerrada', { icon: 'log-out' }); };

/* Bloqueo automático por inactividad */
let lastActivity = Date.now();
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => {
  const min = +App.settings.autolock;
  if (!min || $('#app').hidden || (window.Editor && Editor.busy)) return;
  if (Date.now() - lastActivity > min * 60000) { if (Cloud.on) Cloud.sb.auth.signOut({ scope: 'local' }).catch(() => {}); ssSet('him:session', null); try { localStorage.removeItem('him:remember'); } catch {} Modal.close(true); renderAuth('login'); toast('Sesión bloqueada por inactividad', { icon: 'lock' }); }
}, 30000);
