'use strict';
/* =========================================================
   HIM Product Media — núcleo: utilidades, datos, almacenamiento,
   IA (Claude vía claude.ai) y autenticación local.
   ========================================================= */

/* ---------- Utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dec = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');
const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MES_L = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtDate = iso => { const d = new Date(iso); return `${d.getDate()} ${MES[d.getMonth()]}, ${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())} HS`; };
const fmtShort = iso => { const d = new Date(iso); return `${d.getDate()} ${MES[d.getMonth()]}`; };
const fmtTime = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtInt = n => Math.round(n).toLocaleString('es-AR');
const fmtN = n => {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return dec(n / 1e6, a >= 1e7 ? 0 : 1).replace(/,0$/, '') + 'M';
  if (a >= 1e3) return dec(n / 1e3, a >= 1e5 ? 0 : 1).replace(/,0$/, '') + 'K';
  return String(Math.round(n));
};
const fmtMoney = n => n >= 1000 ? 'US$' + dec(n / 1000, 1).replace(/,0$/, '') + 'K' : 'US$' + Math.round(n);
const fmtDur = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s/3600)}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}` : `${Math.floor(s/60)}:${pad(s%60)}`; };
const fmtTC = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${pad(m)}:${r.toFixed(1).padStart(4, '0')}`; };
const TODAY = new Date();
const rel = (days, hm) => { const d = new Date(TODAY); d.setDate(d.getDate() + days); const [h, m] = hm.split(':'); d.setHours(+h, +m, 0, 0); return toISO(d); };
const relLabel = iso => {
  const diff = new Date(iso) - new Date();
  const h = Math.round(Math.abs(diff) / 36e5), d = Math.round(Math.abs(diff) / 864e5);
  if (diff > 0) return h < 24 ? `Sale en ${Math.max(h,1)} h` : d === 1 ? 'Sale mañana' : `Sale en ${d} días`;
  return h < 24 ? `Hace ${Math.max(h,1)} h` : d === 1 ? 'Ayer' : `Hace ${d} días`;
};
const timeAgo = ts => { const m = Math.round((Date.now() - ts) / 6e4); if (m < 1) return 'recién'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`; const d = Math.round(h / 24); return d === 1 ? 'ayer' : `hace ${d} días`; };
const IMG = id => `img/${id}.jpg`;
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A1F2B"/><stop offset="1" stop-color="#0A0D14"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/><text x="200" y="262" font-family="Outfit,sans-serif" font-size="44" font-weight="800" fill="#E5AC00" text-anchor="middle" letter-spacing="10">HIM</text></svg>');
const ico = (name, cls = 'w-4 h-4') => `<i data-lucide="${name}" class="${cls}"></i>`;
const icons = () => { if (window.lucide) lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); };
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const ssGet = (k, def) => { try { const v = sessionStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } };
const ssSet = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

/** Anima un número desde 0 hasta su valor final (count-up). */
function countUp(el, to, format = fmtInt, dur = 1400) {
  if (REDUCED) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(to * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Registro de acciones (delegación de eventos) ---------- */
const Actions = {};   // data-action="x"  -> Actions.x(el, event)
const Inputs = {};    // data-input="x"   -> Inputs.x(el, event)
const Changes = {};   // data-change="x"  -> Changes.x(el, event)

/* ---------- Redes, formatos y datos de referencia ---------- */
const SVG = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.7a2.9 2.9 0 0 1-5.2 1.7 2.9 2.9 0 0 1 3.2-4.5V9.4a6.3 6.3 0 0 0-5.4 10.7 6.3 6.3 0 0 0 10.8-4.4V8.7a8.2 8.2 0 0 0 4.8 1.5V6.8z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/></svg>',
};
const NET = {
  instagram: { label: 'Instagram', grad: 'linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF)', color: '#E1306C', fill: 'url(#gIG)', cpm: 6.5 },
  tiktok:    { label: 'TikTok',    grad: 'linear-gradient(135deg,#25F4EE 0%,#111 40%,#111 60%,#FE2C55 100%)', color: '#25F4EE', fill: 'url(#gTT)', cpm: 3.2 },
  youtube:   { label: 'YouTube',   grad: 'linear-gradient(135deg,#FF0000,#B30000)', color: '#FF4D4D', fill: 'url(#gYT)', cpm: 9.5 },
};
const NETS = Object.keys(NET);
const FORMATS = {
  ig_reel:  { net: 'instagram', label: 'Reel',        full: 'Instagram Reels', vertical: true,  video: true },
  ig_post:  { net: 'instagram', label: 'Post',        full: 'Instagram Post',  vertical: false, video: false },
  tiktok:   { net: 'tiktok',    label: 'Video',       full: 'TikTok',          vertical: true,  video: true },
  yt_short: { net: 'youtube',   label: 'Short',       full: 'YouTube Shorts',  vertical: true,  video: true },
  yt_long:  { net: 'youtube',   label: 'Video largo', full: 'YouTube Long',    vertical: false, video: true, wide: true },
};
const BASE = {
  instagram: { views: 142000, er: 8.9, saves: 2600, shares: 1500, ctr: 3.4, ret: 61, followers: 900 },
  tiktok:    { views: 720000, er: 9.4, saves: 9800, shares: 7600, ctr: 2.5, ret: 66, followers: 3100 },
  youtube:   { views: 210000, er: 6.3, saves: 1900, shares: 1100, ctr: 6.2, ret: 55, followers: 1500 },
};
const SLOTS = [6, 9, 12, 15, 18, 21, 0];
const HOURS = {
  instagram: [6.2, 8.1, 9.4, 8.7, 10.6, 11.2, 7.5],
  tiktok:    [7.1, 8.0, 9.2, 9.8, 10.9, 11.6, 10.2],
  youtube:   [4.8, 5.6, 6.4, 7.3, 7.9, 7.4, 5.2],
};
const SUGGEST = {
  instagram: ['luxurylifestyle', 'reels', 'aesthetic', 'oldmoney', 'contentcreator', 'explorepage', 'minimalismo', 'inspiración'],
  tiktok: ['fyp', 'parati', 'viral', 'lifestyle', 'storytime', 'tendencias', 'luxury', 'tiktokargentina'],
  youtube: ['shorts', 'vlog', 'review', 'tutorial', 'emprendimiento', '4k', 'luxury', 'youtubeshorts'],
};
const STATUS = {
  draft:     { label: 'Borrador',   cls: 'badge-draft',     icon: 'pencil-line' },
  scheduled: { label: 'Programado', cls: 'badge-scheduled', icon: 'clock' },
  published: { label: 'Publicado',  cls: 'badge-published', icon: 'circle-check' },
};

/* Publicaciones de ejemplo (marcadas demo: true; se ocultan desde Configuración) */
const DEMO_POSTS = [
  { id: 'd1', format: 'ig_reel', status: 'published', date: rel(-6, '08:30'), title: 'Rutina matutina de un CEO',
    caption: '5:30 AM. Sin teléfono la primera hora, journaling, entrenamiento y un espresso doble. Así arranco los días en los que todo tiene que salir perfecto. ¿Cuál es tu hábito innegociable?',
    hashtags: ['morningroutine', 'productividad', 'luxurylifestyle', 'ceo'], img: IMG('photo-1499951360447-b19be8fe80f5'), duration: 30,
    m: { views: 284500, likes: 21840, comments: 1120, shares: 3410, saves: 5870, ctr: 4.2, retPct: 68, followers: 1840 } },
  { id: 'd2', format: 'tiktok', status: 'published', date: rel(-4, '21:00'), title: '3 trucos de estilo old money',
    caption: 'No es lo que cuesta, es cómo lo llevás. Paleta neutra, texturas nobles y cero logos visibles. Guardalo para tu próxima compra.',
    hashtags: ['oldmoney', 'estilo', 'fyp', 'moda'], img: IMG('photo-1515886657613-9f3515b0c78f'), duration: 24,
    m: { views: 1240000, likes: 98400, comments: 3210, shares: 12800, saves: 15600, ctr: 2.8, retPct: 74, followers: 6420 } },
  { id: 'd3', format: 'yt_long', status: 'published', date: rel(-9, '18:00'), title: 'Review: el reloj de lujo más infravalorado',
    caption: 'Dos meses usándolo todos los días. Acabado, movimiento, valor de reventa y por qué creo que es la mejor compra por debajo de los 10K.',
    hashtags: ['relojes', 'review', 'luxury', 'watches'], img: IMG('photo-1523275335684-37898b6baf30'), duration: 860,
    m: { views: 186300, likes: 9870, comments: 1430, shares: 820, saves: 2100, ctr: 7.9, retPct: 52, followers: 2310 } },
  { id: 'd4', format: 'ig_post', status: 'published', date: rel(-3, '12:00'), title: 'Colección Otoño · Lookbook',
    caption: 'Capas, camel y lana merino. Seis looks pensados para la transición de estación, todos con piezas que vas a usar durante años.',
    hashtags: ['lookbook', 'otoño', 'aesthetic', 'quietluxury'], img: IMG('photo-1490481651871-ab68de25d43d'), duration: 0,
    m: { views: 96400, likes: 7320, comments: 410, shares: 380, saves: 1960, ctr: 3.1, retPct: null, followers: 520 } },
  { id: 'd5', format: 'yt_short', status: 'published', date: rel(-2, '15:00'), title: 'Café de especialidad en 30 segundos',
    caption: 'V60, 15 g de café, 250 ml a 93°C y paciencia. El ritual que cambia tu mañana.',
    hashtags: ['shorts', 'café', 'barista', 'ritual'], img: IMG('photo-1495474472287-4d71bcdd2085'), duration: 30,
    m: { views: 412000, likes: 26300, comments: 690, shares: 1820, saves: 2400, ctr: 5.4, retPct: 81, followers: 1280 } },
  { id: 'd6', format: 'tiktok', status: 'published', date: rel(-1, '19:30'), title: 'Un día en Lago di Como',
    caption: 'Desayuno frente al lago, paseo en Riva y atardecer en Bellagio. Te dejo la ruta completa en los comentarios.',
    hashtags: ['italia', 'travel', 'lagodicomo', 'parati'], img: IMG('photo-1476514525535-07fb3b4ae5f1'), duration: 45,
    m: { views: 638000, likes: 54100, comments: 1870, shares: 7400, saves: 11200, ctr: 3.0, retPct: 71, followers: 3950 } },
  { id: 'd7', format: 'ig_reel', status: 'scheduled', date: rel(2, '18:30'), title: 'Setup minimalista de escritorio',
    caption: 'Menos objetos, más foco. Te muestro cada pieza de mi escritorio y por qué está ahí.',
    hashtags: ['desksetup', 'minimalismo', 'productividad'], img: IMG('photo-1498050108023-c5249f4df085'), duration: 28, m: null },
  { id: 'd8', format: 'yt_long', status: 'scheduled', date: rel(5, '17:00'), title: 'Cómo construí una marca de 7 cifras',
    caption: 'Los primeros 18 meses, los errores que costaron caro y el sistema de contenidos que hoy genera clientes todos los días.',
    hashtags: ['emprendimiento', 'negocios', 'marcapersonal'], img: IMG('photo-1522202176988-66273c2fd55f'), duration: 1340, m: null },
  { id: 'd9', format: 'tiktok', status: 'scheduled', date: rel(7, '20:00'), title: 'Unboxing: auriculares premium',
    caption: 'Cancelación de ruido, cuero vegano y 40 h de batería. ¿Valen lo que cuestan? Primeras impresiones sin filtro.',
    hashtags: ['unboxing', 'tech', 'fyp'], img: IMG('photo-1505740420928-5e560c06d30e'), duration: 38, m: null },
  { id: 'd10', format: 'ig_post', status: 'scheduled', date: rel(11, '18:30'), title: 'Cena de autor en casa',
    caption: 'Menú de tres pasos para impresionar sin pasar el día en la cocina. Receta completa en el carrusel.',
    hashtags: ['foodie', 'recetas', 'homechef'], img: IMG('photo-1504674900247-0877df9cc836'), duration: 0, m: null },
  { id: 'd11', format: 'yt_short', status: 'scheduled', date: rel(15, '07:00'), title: 'Entrenamiento express de 5 minutos',
    caption: 'Sin equipamiento, sin excusas. Cinco ejercicios para activar todo el cuerpo antes de trabajar.',
    hashtags: ['shorts', 'fitness', 'workout'], img: IMG('photo-1571019613454-1cb2f99b2d8b'), duration: 45, m: null },
  { id: 'd12', format: 'tiktok', status: 'draft', date: rel(18, '21:00'), title: 'Sneakers que valen la inversión',
    caption: 'Tres pares que duran años y combinan con todo. Spoiler: ninguno es el más caro.',
    hashtags: ['sneakers', 'moda'], img: IMG('photo-1542291026-7eec264c27ff'), duration: 32, m: null },
  { id: 'd13', format: 'ig_reel', status: 'draft', date: rel(22, '22:00'), title: 'Skincare nocturno en 4 pasos',
    caption: 'Doble limpieza, sérum, contorno y crema. Lo que realmente uso, sin publicidad.',
    hashtags: ['skincare', 'selfcare'], img: IMG('photo-1556228578-8c89e6adf883'), duration: 40, m: null },
  { id: 'd14', format: 'yt_long', status: 'draft', date: rel(25, '16:00'), title: 'Viaje a los Alpes en 4K',
    caption: 'Cinematic travel film: Zermatt, Grindelwald y el Glacier Express. Ponete auriculares.',
    hashtags: ['4k', 'travel', 'alpes', 'cinematic'], img: IMG('photo-1506905925346-21bda4d32df4'), duration: 720, m: null },
].map(p => ({ ...p, demo: true }));

/* Serie de seguidores y vistas de los últimos 30 días (datos de ejemplo, deterministas) */
const DAYS = 30;
function seeded(seed) { let s = seed % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const SERIES = {};
[['instagram', 46820, 64, 55, 3, 19500], ['tiktok', 119400, 300, 420, 5, 68000], ['youtube', 31940, 22, 38, 9, 21500]].forEach(([n, start, drift, vol, seed, baseV]) => {
  const r = seeded(seed * 7919);
  const f = [start];
  for (let i = 1; i <= DAYS; i++) { let d = drift + (r() - .45) * vol * 2; if (n === 'tiktok' && i === 18) d = -220; f.push(Math.round(f[i - 1] + d)); }
  const v = []; for (let i = 0; i < DAYS; i++) v.push(Math.round(baseV * (.72 + r() * .66)));
  SERIES[n] = { followers: f, views: v };
});
const PREV = { instagram: { er: 9.1, views: 540000 }, tiktok: { er: 10.3, views: 1720000 }, youtube: { er: 6.6, views: 700000 } };
const ER_NOW = { instagram: 9.8, tiktok: 11.1, youtube: 6.1 };
const seriesDates = () => Array.from({ length: DAYS + 1 }, (_, i) => { const d = new Date(TODAY); d.setDate(d.getDate() - DAYS + i); return d; });

function netStats(n) {
  const nets = n === 'all' ? NETS : [n];
  let followers = 0, followers0 = 0, views = 0, viewsPrev = 0, er = 0, erPrev = 0;
  nets.forEach(k => {
    const s = SERIES[k];
    followers += s.followers.at(-1); followers0 += s.followers[0];
    views += s.views.reduce((a, b) => a + b, 0); viewsPrev += PREV[k].views;
    er += ER_NOW[k]; erPrev += PREV[k].er;
  });
  er /= nets.length; erPrev /= nets.length;
  return {
    followers, followers0, newFollowers: followers - followers0, followersDelta: (followers - followers0) / followers0 * 100,
    er, erPrev, erDelta: er - erPrev, views, viewsPrev, viewsDelta: (views - viewsPrev) / viewsPrev * 100,
  };
}

/* ---------- Almacenamiento: nube (db de claude.ai, privado por usuario) o local ---------- */
const COLS = ['posts', 'ideas', 'scripts', 'carousels', 'competitors'];
const Store = {
  mode: 'local', db: null, uid: null, user: null, mem: {},
  async init() {
    if (!window.claude || typeof claude.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      this.user = user;
      if (db && user) {
        const id = await user.id();
        if (id) { this.db = db; this.uid = id; this.mode = 'cloud'; }
      }
    } catch (e) { console.warn('Store init', e); }
  },
  docRef(name) { return this.db.doc(`data/users/${this.uid}/${name}`); },
  colRef(col) { return this.db.doc(`data/users/${this.uid}/${col}`).collection('items'); },
  async getDoc(name) {
    if (this.mode === 'cloud') {
      try { const s = await this.docRef(name).get(); return s.exists ? { ...s.data() } : null; }
      catch (e) { console.warn(e); return null; }
    }
    return lsGet('him:' + name, this.mem[name] ?? null);
  },
  async setDoc(name, data) {
    const clean = JSON.parse(JSON.stringify(data));
    if (this.mode === 'cloud') return this.docRef(name).set(clean);
    this.mem[name] = clean; lsSet('him:' + name, clean);
  },
  async list(col) {
    if (this.mode === 'cloud') {
      try { const q = await this.colRef(col).get(); return q.docs.map(d => ({ ...d.data(), id: d.id })); }
      catch (e) { console.warn(e); return []; }
    }
    return Object.values(lsGet('him:col:' + col, this.mem['col:' + col] || {}));
  },
  async put(col, item) {
    const { id, ...body } = item;
    const clean = JSON.parse(JSON.stringify(body));
    if (this.mode === 'cloud') return this.colRef(col).doc(id).set(clean);
    const all = lsGet('him:col:' + col, this.mem['col:' + col] || {});
    all[id] = { ...clean, id }; this.mem['col:' + col] = all; lsSet('him:col:' + col, all);
  },
  async remove(col, id) {
    if (this.mode === 'cloud') return this.colRef(col).doc(id).delete();
    const all = lsGet('him:col:' + col, this.mem['col:' + col] || {});
    delete all[id]; this.mem['col:' + col] = all; lsSet('him:col:' + col, all);
  },
  async removeDoc(name) {
    if (this.mode === 'cloud') return this.docRef(name).delete();
    delete this.mem[name]; try { localStorage.removeItem('him:' + name); } catch {}
  },
  /** Borra TODO lo del usuario (derecho de supresión). */
  async wipe() {
    for (const col of ['posts', 'ideas', 'scripts', 'carousels', 'competitors']) {
      const items = await this.list(col);
      await Promise.all(items.map(i => this.remove(col, i.id)));
      delete this.mem['col:' + col]; try { localStorage.removeItem('him:col:' + col); } catch {}
    }
    await Promise.all(['settings', 'editor', 'auth'].map(n => this.removeDoc(n).catch(() => {})));
    try { Object.keys(localStorage).filter(k => k.startsWith('him:')).forEach(k => localStorage.removeItem(k)); } catch {}
    try { Object.keys(sessionStorage).filter(k => k.startsWith('him:')).forEach(k => sessionStorage.removeItem(k)); } catch {}
  },
};
/* ---------- Monitoreo de errores y analytics propios ----------
   Sin terceros ni cookies. Se guarda un buffer local (últimos 50) y, si hay
   un "sink" configurado (Telemetry.sink = async (tipo, datos) => …, p. ej. las
   RPC report_client_error / track_event de Supabase), se envía también. */
const Telemetry = {
  sink: null,
  push(key, entry) {
    const list = lsGet(key, []); list.push(entry); lsSet(key, list.slice(-50));
    if (this.sink) this.sink(key === 'him:errors' ? 'error' : 'event', entry).catch(() => {});
  },
};
function reportError(e, context = 'app') {
  const message = String(e?.message || e || 'Error desconocido').slice(0, 1000);
  console.warn('[HIM]', context, e);
  Telemetry.push('him:errors', { t: new Date().toISOString(), context, message, stack: String(e?.stack || '').slice(0, 4000), url: location.hash });
}
function track(name, props = {}) {
  if (!/^[a-z][a-z0-9_]{1,49}$/.test(name)) return;
  Telemetry.push('him:events', { t: new Date().toISOString(), name, props, path: location.hash });
}
addEventListener('error', ev => reportError(ev.error || ev.message, 'window'));
addEventListener('unhandledrejection', ev => reportError(ev.reason, 'promise'));

/** Guarda sin bloquear la UI y avisa si falla. */
function persist(col, item) {
  return Store.put(col, item).catch(e => { console.warn(e); toast(e?.code === 'quota_exceeded' ? 'Llegaste al límite de almacenamiento. Borrá elementos viejos para guardar nuevos.' : 'No se pudo guardar. Revisá tu conexión e intentá de nuevo.', { icon: 'circle-alert', error: true }); });
}
function unpersist(col, id) { return Store.remove(col, id).catch(e => console.warn(e)); }

/* ---------- IA: Claude a través de claude.ai (sample) ---------- */
const AI = {
  fn: null, limits: null, denied: false,
  async init() {
    if (!window.claude || typeof claude.use !== 'function') return;
    try { this.fn = await claude.use('sample'); if (this.fn) this.limits = await this.fn.limits().catch(() => null); } catch {}
  },
  get ok() { return !!this.fn && !this.denied; },
  get tools() { return this.ok && !!this.limits?.tools; },
  get images() { return this.ok && !!this.limits?.images; },
  message(e) {
    switch (e?.code) {
      case 'not_granted': case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed':
        this.denied = true; return 'La IA no está habilitada para esta página. Permitila desde el menú de permisos de la página en claude.ai.';
      case 'rate_limited': return 'Llegaste al límite de uso de IA por ahora. Probá de nuevo en unos minutos.';
      case 'session_expired': return 'Tu sesión de claude.ai venció. Volvé a iniciar sesión.';
      case 'refused': return 'La IA no pudo responder ese pedido. Reformulalo con otras palabras.';
      case 'invalid_json': return 'La respuesta llegó incompleta. Probá de nuevo o pedí algo más corto.';
      case 'prompt_too_large': return 'El texto es demasiado largo. Recortalo e intentá otra vez.';
      case 'images_unavailable': case 'image_rejected': return 'No se pudieron enviar las imágenes. Probá con JPG o PNG más livianos.';
      case 'tools_unavailable': return 'Esta vista no permite que la IA edite la línea de tiempo.';
      case 'empty_completion': return 'La IA no devolvió contenido. Simplificá el pedido.';
      case 'cancelled': return '';
      default: return 'Se cortó la conexión con la IA. Intentá de nuevo.';
    }
  },
  json(prompt, opts) { return this.fn.json(prompt, opts); },
  text(prompt, opts) { return this.fn(prompt, opts); },
};
const toneLine = () => {
  const t = App.settings.tone;
  const map = {
    cercano: 'Tono profesional pero cercano, como si le hablaras a un amigo: cálido, directo, sin exagerar ni sonar vendedor.',
    inspirador: 'Tono inspirador y cercano: motivás sin clichés, con ejemplos concretos.',
    divertido: 'Tono divertido y cercano, con humor liviano, sin perder profesionalismo.',
    experto: 'Tono experto y claro, cercano pero con autoridad y datos.',
  };
  return (map[t] || map.cercano) + ' Escribí en español rioplatense (usá "vos"), frases cortas y naturales para decir en voz alta.';
};
const brandLine = () => `Marca: ${App.settings.brand}. Nicho: ${App.settings.niche}.`;

/* ---------- Autenticación local (usuario + contraseña, hash PBKDF2) ---------- */
const Auth = {
  record: null,
  async load() { this.record = await Store.getDoc('auth'); return this.record; },
  async hash(pw, salt) {
    if (!window.crypto?.subtle) throw new Error('crypto');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  salt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); },
  async create(username, pw) {
    const salt = this.salt();
    this.record = { username: username.trim(), salt, hash: await this.hash(pw, salt), createdAt: Date.now(), changedAt: Date.now() };
    await Store.setDoc('auth', this.record);
  },
  async verify(username, pw) {
    if (!this.record) return false;
    if (username.trim().toLowerCase() !== this.record.username.toLowerCase()) { await this.hash(pw, this.record.salt); return false; }
    return (await this.hash(pw, this.record.salt)) === this.record.hash;
  },
  async change(newPw) {
    const salt = this.salt();
    this.record = { ...this.record, salt, hash: await this.hash(newPw, salt), changedAt: Date.now() };
    await Store.setDoc('auth', this.record);
  },
  token() { return this.record ? this.record.hash.slice(0, 24) : ''; },
  startSession(remember) {
    ssSet('him:session', this.token());
    if (remember) lsSet('him:remember', { t: this.token(), exp: Date.now() + 30 * 864e5 });
  },
  hasSession() {
    const t = this.token(); if (!t) return false;
    if (ssGet('him:session') === t) return true;
    const r = lsGet('him:remember'); return !!(r && r.t === t && r.exp > Date.now());
  },
  endSession() { ssSet('him:session', null); try { localStorage.removeItem('him:remember'); } catch {} },
  lockState() { return lsGet('him:lock', { fails: 0, until: 0 }); },
  registerFail() { const s = this.lockState(); s.fails++; if (s.fails >= 5) { s.until = Date.now() + 60000; s.fails = 0; } lsSet('him:lock', s); return s; },
  clearFails() { lsSet('him:lock', { fails: 0, until: 0 }); },
};
function pwStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++; if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  const lvl = pw.length < 8 ? 0 : s <= 2 ? 1 : s <= 3 ? 2 : 3;
  return { lvl, label: ['Muy débil', 'Débil', 'Buena', 'Fuerte'][lvl], color: ['#F87171', '#FBBF24', '#A3E635', '#34D399'][lvl] };
}

/* ---------- Estado global ---------- */
const DEFAULT_SETTINGS = {
  brand: 'HIM Product Media', displayName: '', handle: '@himproductmedia',
  niche: 'lifestyle premium, negocios y marca personal', defaultNet: 'all', goal: 25000,
  tone: 'cercano', autolock: 15, showDemo: true,
  notif: { publish: true, weekly: true, milestones: true, ideas: false },
  links: {},
};
const App = {
  settings: { ...DEFAULT_SETTINGS },
  userPosts: [], ideas: [], scripts: [], carousels: [], competitors: [],
  section: 'panel', network: 'all',
  get posts() { return [...(this.settings.showDemo ? DEMO_POSTS : []), ...this.userPosts]; },
};
const netOf = p => FORMATS[p.format].net;
const er = p => p.m ? (p.m.likes + p.m.comments + p.m.shares + p.m.saves) / p.m.views * 100 : 0;
const byNetwork = list => list.filter(p => App.network === 'all' || netOf(p) === App.network);
const findPost = id => App.posts.find(p => p.id === id);
async function saveSettings(patch) {
  App.settings = { ...App.settings, ...patch };
  try { await Store.setDoc('settings', App.settings); } catch (e) { console.warn(e); toast('No se pudo guardar la configuración.', { icon: 'circle-alert', error: true }); }
}
