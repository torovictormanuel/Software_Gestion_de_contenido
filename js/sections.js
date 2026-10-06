'use strict';
/* =========================================================
   Secciones: Panel, Calendario, Ideas, Métricas,
   modales de publicaciones, Conexiones y Configuración.
   ========================================================= */

function weekRange(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const e = new Date(s); e.setDate(s.getDate() + 7);
  return [s, e];
}
const dateLabels = () => seriesDates().map(d => `${d.getDate()} ${MES[d.getMonth()]}`);

/* =========================================================
   PANEL PRINCIPAL
   ========================================================= */
RENDER.panel = el => {
  const S = App.settings, posts = byNetwork(App.posts);
  const [ws, we] = weekRange();
  const week = posts.filter(p => { const d = new Date(p.date); return d >= ws && d < we; });
  const wPub = week.filter(p => p.status === 'published').length, wSch = week.filter(p => p.status === 'scheduled').length, wDr = week.filter(p => p.status === 'draft').length;
  const st = netStats(App.network);
  const best = posts.filter(p => p.status === 'published').sort((a, b) => er(b) - er(a)).slice(0, 3);
  const upcoming = posts.filter(p => p.status === 'scheduled' && new Date(p.date) >= new Date()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const newIdeas = App.ideas.filter(i => i.status === 'nueva').length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const nets = App.network === 'all' ? NETS : [App.network];
  const totalSeries = SERIES.instagram.followers.map((_, i) => nets.reduce((a, n) => a + SERIES[n].followers[i], 0));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d; });

  el.innerHTML = `
    ${sectionHead(`${greet}, <span class="gold-text">${esc(S.displayName || Auth.record?.username || 'creador')}</span>`, `${DIAS_L[TODAY.getDay()]} ${TODAY.getDate()} de ${MES_L[TODAY.getMonth()]}`,
      `<div class="flex gap-2 flex-wrap"><button class="btn-ghost" data-action="go" data-to="guiones">${ico('scroll-text', 'w-4 h-4 text-gold')}Nuevo guion</button><button class="btn-ghost" data-action="go" data-to="carruseles">${ico('gallery-horizontal-end', 'w-4 h-4 text-gold')}Nuevo carrusel</button></div>`)}

    <section class="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5" aria-label="Resumen">
      <article class="card card-hover p-4 md:p-6 rise col-span-2 xl:col-span-1">
        <div class="flex items-center justify-between"><span class="text-[11px] font-bold tracking-[.14em] uppercase text-muted">Posts esta semana</span>${ico('calendar-range', 'w-5 h-5 text-gold')}</div>
        <div class="flex items-end gap-3 mt-3"><span class="metric-big gold-text" data-count="${week.length}" data-fmt="int">0</span><span class="text-sm text-muted mb-1.5">${fmtShort(ws)} – ${fmtShort(new Date(we - 1))}</span></div>
        <div class="grid grid-cols-7 gap-1.5 mt-4">${days.map(d => { const k = dayKey(d), n = posts.filter(p => p.date.slice(0, 10) === k).length, today = k === dayKey(TODAY);
          return `<div class="text-center"><div class="text-[10px] font-bold ${today ? 'text-gold' : 'text-dim'}">${DIAS[(d.getDay() + 6) % 7][0]}</div><div class="mt-1 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style="background:${n ? 'var(--gold-soft)' : 'rgba(255,255,255,.03)'};color:${n ? 'var(--gold-light)' : '#4B5263'};${today ? 'box-shadow:inset 0 0 0 1.5px var(--gold)' : ''}">${n || '·'}</div></div>`; }).join('')}</div>
        <div class="flex gap-3 mt-3 text-xs text-muted flex-wrap"><span><b class="text-gold-light">${wPub}</b> publicados</span><span><b class="text-up">${wSch}</b> programados</span><span><b class="text-[#D2CEC2]">${wDr}</b> borradores</span></div>
      </article>
      ${[
        ['users', 'Seguidores totales', st.followers, 'int', st.followersDelta, 'vs hace 30 días'],
        ['heart-pulse', 'Interacción promedio', st.er, 'pct', st.erDelta, 'pp vs mes anterior', true],
        ['eye', 'Visualizaciones del mes', st.views, 'short', st.viewsDelta, 'vs mes anterior'],
      ].map(([i, l, v, f, d, cmp, pp], k) => `
      <article class="card card-hover p-4 md:p-6 rise" style="animation-delay:${(k + 1) * 70}ms">
        <div class="flex items-center justify-between gap-2"><span class="text-[10px] md:text-[11px] font-bold tracking-[.14em] uppercase text-muted">${l}</span>${ico(i, 'w-5 h-5 text-gold hidden sm:block')}</div>
        <div class="metric-big mt-3 !text-[clamp(1.7rem,5vw,2.6rem)]" data-count="${v}" data-fmt="${f}">0</div>
        <div class="mt-3 flex items-center gap-2 flex-wrap">${deltaPill(d, pp ? ' pp' : '%')}<span class="text-[11px] text-dim">${cmp.replace('pp ', '')}</span></div>
      </article>`).join('')}
    </section>

    <section class="grid lg:grid-cols-3 gap-4 md:gap-5 mt-5">
      <article class="card p-5 md:p-6 lg:col-span-2 min-w-0">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('trending-up', 'w-5 h-5 text-gold')}Seguimiento de seguidores</h2>
          <p class="text-xs text-muted mt-1">Últimos 30 días · ${App.network === 'all' ? 'todas las redes' : NET[App.network].label}</p></div>
          <div class="text-right"><div class="font-display text-2xl font-semibold tnum">+${fmtInt(st.newFollowers)}</div><div class="text-[11px] text-dim">nuevos seguidores</div></div>
        </div>
        <div class="mt-4">${lineChart({ series: [{ name: 'Seguidores', values: totalSeries, color: 'url(#gGoldH)', dot: '#FFD84D', area: true }], labels: dateLabels(), height: 250 })}</div>
        <div class="grid grid-cols-3 gap-2 mt-3">${NETS.map(n => { const f = SERIES[n].followers, d = (f.at(-1) - f[0]) / f[0] * 100; return `<div class="well p-3 flex items-center gap-2.5 ${nets.includes(n) ? '' : 'opacity-40'}">${netDot(n, 26)}<div class="min-w-0"><div class="text-sm font-semibold tnum">${fmtN(f.at(-1))}</div><div class="text-[11px] font-bold ${d >= 0 ? 'text-up' : 'text-down'}">${d >= 0 ? '▲' : '▼'} ${dec(Math.abs(d))}%</div></div></div>`; }).join('')}</div>
      </article>

      <article class="card p-5 md:p-6 min-w-0">
        <div class="flex items-center justify-between"><h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('crown', 'w-5 h-5 text-gold')}Mejores posts</h2><button class="text-xs text-gold-light font-semibold min-h-[44px]" data-action="go" data-to="metricas">Ver métricas</button></div>
        <div class="flex flex-col gap-3 mt-3">${best.length ? best.map((p, i) => `
          <button class="flex items-center gap-3 p-2 rounded-2xl text-left hover:bg-white/[.04] transition border border-transparent hover:border-[var(--gold-line)]" data-action="analytics" data-id="${p.id}">
            <span class="font-display text-2xl font-bold w-6 text-center ${i ? 'text-dim' : 'gold-text'}">${i + 1}</span>
            <span class="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">${mediaEl(p, 'absolute inset-0 w-full h-full object-cover')}<span class="absolute bottom-0.5 right-0.5">${netDot(netOf(p), 16)}</span></span>
            <span class="min-w-0 flex-1"><span class="block text-sm font-semibold truncate">${esc(p.title)}</span><span class="block text-xs text-muted mt-0.5">${fmtN(p.m.views)} vistas · <b class="text-gold-light">${dec(er(p))}%</b> ER</span></span>
          </button>`).join('') : `<p class="text-sm text-muted py-6 text-center">Todavía no hay publicaciones publicadas.</p>`}</div>
      </article>
    </section>

    <section class="grid lg:grid-cols-3 gap-4 md:gap-5 mt-5">
      <article class="card p-5 md:p-6 lg:col-span-2">
        <div class="flex items-center justify-between"><h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('calendar-clock', 'w-5 h-5 text-gold')}Próximas publicaciones</h2><button class="text-xs text-gold-light font-semibold min-h-[44px]" data-action="go" data-to="calendario">Ver calendario</button></div>
        <div class="grid sm:grid-cols-2 gap-3 mt-3">${upcoming.length ? upcoming.map(p => `
          <button class="flex items-center gap-3 p-2.5 rounded-2xl well text-left hover:border-[var(--gold-line)] transition" data-action="editPost" data-id="${p.id}">
            <span class="relative w-16 h-16 rounded-xl overflow-hidden shrink-0">${mediaEl(p, 'absolute inset-0 w-full h-full object-cover')}</span>
            <span class="min-w-0"><span class="flex items-center gap-1.5 text-[11px] font-bold text-gold">${netDot(netOf(p), 16)}${fmtShort(p.date)} · ${fmtTime(p.date)} HS</span><span class="block text-sm font-semibold clamp-2 mt-1">${esc(p.title)}</span><span class="block text-[11px] text-up mt-1">${relLabel(p.date)}</span></span>
          </button>`).join('') : `<p class="text-sm text-muted py-4">No hay publicaciones programadas.</p>`}</div>
      </article>
      <article class="card p-5 md:p-6">
        <h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('lightbulb', 'w-5 h-5 text-gold')}Idea rápida</h2>
        <p class="text-xs text-muted mt-1">${App.ideas.length} ideas guardadas · ${newIdeas} sin desarrollar</p>
        <form class="mt-4 flex flex-col gap-3" data-form="quickIdea">
          <label class="sr-only" for="qIdea">Escribí tu idea</label>
          <textarea id="qIdea" class="input resize-none" rows="3" maxlength="500" placeholder="Ej: Reel mostrando mi rutina de domingo para planificar la semana"></textarea>
          <button class="btn-gold" type="submit">${ico('plus')}Guardar idea</button>
        </form>
        <div class="grid grid-cols-2 gap-2 mt-4 text-center">
          <div class="well p-3"><div class="font-display text-xl font-semibold">${App.scripts.length}</div><div class="text-[11px] text-dim">guiones</div></div>
          <div class="well p-3"><div class="font-display text-xl font-semibold">${App.carousels.length}</div><div class="text-[11px] text-dim">carruseles</div></div>
        </div>
      </article>
    </section>`;
  runCounters(el);
};
function runCounters(root) {
  $$('[data-count]', root).forEach(n => {
    const v = +n.dataset.count, f = n.dataset.fmt;
    const fmt = f === 'pct' ? x => dec(x) + '%' : f === 'short' ? fmtN : f === 'money' ? fmtMoney : fmtInt;
    countUp(n, v, fmt);
  });
}

/* =========================================================
   CALENDARIO (vista mensual completa)
   ========================================================= */
const Cal = { cursor: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), sel: dayKey(TODAY), status: 'all' };
const postsOnDay = (k, list) => list.filter(p => p.date.slice(0, 10) === k).sort((a, b) => a.date.localeCompare(b.date));
RENDER.calendario = el => {
  const list = byNetwork(App.posts).filter(p => Cal.status === 'all' || p.status === Cal.status);
  const y = Cal.cursor.getFullYear(), mo = Cal.cursor.getMonth();
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate();
  const total = Math.ceil((offset + days) / 7) * 7;
  const monthPosts = list.filter(p => { const d = new Date(p.date); return d.getMonth() === mo && d.getFullYear() === y; });
  let cells = '';
  for (let i = 0; i < total; i++) {
    const d = new Date(y, mo, 1 - offset + i), k = dayKey(d), ps = postsOnDay(k, list);
    const inMonth = d.getMonth() === mo, isToday = k === dayKey(TODAY), sel = k === Cal.sel;
    cells += `<div role="button" tabindex="0" data-action="calDay" data-day="${k}" aria-label="${d.getDate()} de ${MES_L[d.getMonth()]}, ${ps.length} publicaciones" aria-pressed="${sel}"
      class="cal-cell p-1.5 md:p-2 border-r border-b border-white/5 cursor-pointer transition flex flex-col ${inMonth ? '' : 'opacity-35'} ${sel ? 'bg-[rgba(229,172,0,.07)]' : 'hover:bg-white/[.03]'}">
      <div class="flex items-center justify-between"><span class="text-xs md:text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full" style="${isToday ? 'background:var(--gold-grad);color:var(--on-gold)' : sel ? 'color:var(--gold-light)' : 'color:#C9C6BD'}">${d.getDate()}</span>
      ${ps.length ? `<span class="hidden md:inline text-[10px] text-dim">${ps.length}</span>` : ''}</div>
      <div class="hidden md:flex flex-col gap-1 mt-1">${ps.slice(0, 3).map(p => `<button data-action="openPost" data-id="${p.id}" class="w-full text-left flex items-center gap-1.5 pr-1.5 rounded-lg text-[11px] font-medium hover:bg-white/10 transition overflow-hidden" style="background:rgba(255,255,255,.04);border-left:2px solid ${p.status === 'published' ? 'var(--gold)' : p.status === 'scheduled' ? 'var(--up)' : '#6B7180'}">
        <span class="relative w-6 h-6 shrink-0 overflow-hidden">${mediaEl(p, 'absolute inset-0 w-full h-full object-cover')}</span><span class="text-muted">${fmtTime(p.date)}</span><span class="truncate">${esc(p.title)}</span></button>`).join('')}
        ${ps.length > 3 ? `<span class="text-[10px] text-gold px-1">+${ps.length - 3} más</span>` : ''}</div>
      <div class="md:hidden flex gap-1 mt-1.5 flex-wrap justify-center">${ps.map(p => `<span class="w-1.5 h-1.5 rounded-full" style="background:${NET[netOf(p)].color}"></span>`).join('')}</div>
    </div>`;
  }
  const sd = new Date(Cal.sel + 'T12:00'), selPosts = postsOnDay(Cal.sel, list);
  const count = s => monthPosts.filter(p => s === 'all' || p.status === s).length;
  el.innerHTML = `
    ${sectionHead(`${MES_L[mo]} <span class="gold-text">${y}</span>`, 'Calendario editorial', `<button class="btn-gold" data-action="create" data-day="${Cal.sel}">${ico('plus')}Programar</button>`)}
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-1">
        <button class="icon-btn" data-action="calNav" data-dir="-1" aria-label="Mes anterior">${ico('chevron-left', 'w-5 h-5')}</button>
        <button class="btn-ghost btn-sm" data-action="calToday">Hoy</button>
        <button class="icon-btn" data-action="calNav" data-dir="1" aria-label="Mes siguiente">${ico('chevron-right', 'w-5 h-5')}</button>
      </div>
      <div class="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Filtrar por estado">${[['all', 'Todos'], ['scheduled', 'Programados'], ['published', 'Publicados'], ['draft', 'Borradores']].map(([k, l]) => `<button class="chip" data-action="calStatus" data-s="${k}" aria-pressed="${Cal.status === k}">${l}<span class="count">${count(k)}</span></button>`).join('')}</div>
    </div>
    <div class="card p-2 md:p-4">
      <div class="grid grid-cols-7 border-l border-t border-white/5 rounded-2xl overflow-hidden">
        ${DIAS.map(d => `<div class="text-center text-[10px] md:text-xs font-bold tracking-widest uppercase text-dim py-2 border-r border-b border-white/5 bg-white/[.02]">${d}</div>`).join('')}${cells}
      </div>
      <div class="flex flex-wrap gap-4 mt-3 px-1 text-[11px] text-muted">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:var(--gold)"></span>Publicado</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:var(--up)"></span>Programado</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#6B7180]"></span>Borrador</span>
      </div>
    </div>
    <div class="card p-4 md:p-6 mt-5">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div><p class="text-xs uppercase tracking-[.2em] text-dim">${DIAS_L[sd.getDay()]}</p><h3 class="font-display text-lg font-semibold">${sd.getDate()} de ${MES_L[sd.getMonth()]}</h3></div>
        <button class="btn-ghost btn-sm" data-action="create" data-day="${Cal.sel}">${ico('plus', 'w-4 h-4 text-gold')}Programar este día</button>
      </div>
      <div class="mt-4 grid md:grid-cols-2 gap-2">${selPosts.length ? selPosts.map(p => `
        <button data-action="openPost" data-id="${p.id}" class="flex items-center gap-3 p-2 rounded-2xl well hover:border-[var(--gold-line)] transition text-left">
          <span class="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">${mediaEl(p, 'absolute inset-0 w-full h-full object-cover')}</span>
          <span class="min-w-0 flex-1"><span class="flex items-center gap-2 text-xs text-gold font-semibold">${netDot(netOf(p), 16)}${fmtTime(p.date)} HS</span><span class="block font-semibold text-sm truncate mt-0.5">${esc(p.title)}</span></span>
          <span class="shrink-0 hidden sm:block">${statusBadge(p.status)}</span>
        </button>`).join('') : `<p class="text-sm text-dim py-4 text-center md:col-span-2">Sin publicaciones este día.</p>`}</div>
    </div>`;
};
Actions.calDay = el => { Cal.sel = el.dataset.day; renderSection(); };
Actions.calNav = el => { Cal.cursor = new Date(Cal.cursor.getFullYear(), Cal.cursor.getMonth() + +el.dataset.dir, 1); renderSection(); };
Actions.calToday = () => { Cal.cursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); Cal.sel = dayKey(TODAY); renderSection(); };
Actions.calStatus = el => { Cal.status = el.dataset.s; renderSection(); };
Actions.openPost = el => { const p = findPost(el.dataset.id); if (!p) return; p.status === 'published' ? openAnalytics(p.id) : openPostEditor(p.id); };

/* =========================================================
   IDEAS
   ========================================================= */
const Ideas = { filter: 'all', q: '', net: 'any', format: 'reel', aiBusy: false };
const IDEA_FORMATS = { reel: 'Reel corto', largo: 'Video largo', historia: 'Historia', carrusel: 'Carrusel', post: 'Post' };
const IDEA_STATUS = { nueva: ['Nueva', 'badge-soft'], curso: ['En desarrollo', 'badge-scheduled'], usada: ['Usada', 'badge-muted'] };
RENDER.ideas = el => {
  const q = Ideas.q.toLowerCase();
  const list = App.ideas.filter(i => Ideas.filter === 'all' || i.status === Ideas.filter)
    .filter(i => !q || i.text.toLowerCase().includes(q))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
  const count = s => s === 'all' ? App.ideas.length : App.ideas.filter(i => i.status === s).length;
  el.innerHTML = `
    ${sectionHead('Banco de <span class="gold-text">ideas</span>', 'Ideas rápidas', aiBadge())}
    <form class="card p-4 md:p-5" data-form="newIdea">
      <label class="sr-only" for="ideaText">Nueva idea</label>
      <div class="flex flex-col md:flex-row gap-3">
        <input id="ideaText" class="input flex-1" maxlength="500" placeholder="Escribí una idea y presioná Enter…" autocomplete="off">
        <button class="btn-gold" type="submit">${ico('plus')}Guardar</button>
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <span class="text-[11px] uppercase tracking-wider text-dim font-bold mr-1">Red</span>
        ${[['any', 'Cualquiera'], ...NETS.map(n => [n, NET[n].label])].map(([k, l]) => `<button type="button" class="chip !min-h-[34px] !text-xs" data-action="ideaNet" data-v="${k}" aria-pressed="${Ideas.net === k}">${k === 'any' ? '' : `<span class="w-3.5 h-3.5 inline-flex">${SVG[k]}</span>`}${l}</button>`).join('')}
        <span class="text-[11px] uppercase tracking-wider text-dim font-bold ml-2 mr-1">Formato</span>
        ${Object.entries(IDEA_FORMATS).map(([k, l]) => `<button type="button" class="chip !min-h-[34px] !text-xs" data-action="ideaFmt" data-v="${k}" aria-pressed="${Ideas.format === k}">${l}</button>`).join('')}
      </div>
    </form>
    <div class="flex flex-wrap items-center justify-between gap-3 mt-6">
      <div class="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Filtrar ideas">${[['all', 'Todas'], ['nueva', 'Nuevas'], ['curso', 'En desarrollo'], ['usada', 'Usadas']].map(([k, l]) => `<button class="chip" data-action="ideaFilter" data-v="${k}" aria-pressed="${Ideas.filter === k}">${l}<span class="count">${count(k)}</span></button>`).join('')}</div>
      <div class="flex gap-2 w-full md:w-auto">
        <label class="relative flex-1 md:w-64"><span class="sr-only">Buscar ideas</span>${ico('search', 'w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-dim')}<input class="input pl-10" type="search" placeholder="Buscar…" value="${esc(Ideas.q)}" data-input="ideaSearch" id="ideaSearch"></label>
        <button class="btn-ghost" data-action="ideasAI" ${Ideas.aiBusy ? 'disabled' : ''}>${ico(Ideas.aiBusy ? 'loader-circle' : 'wand-sparkles', 'w-4 h-4 text-gold' + (Ideas.aiBusy ? ' spin' : ''))}<span class="hidden sm:inline">${Ideas.aiBusy ? 'Generando…' : 'Generar 5 ideas'}</span></button>
      </div>
    </div>
    <div id="ideasGrid" class="mt-5">${list.length ? `<div class="columns-1 sm:columns-2 xl:columns-3 gap-4">${list.map(ideaCard).join('')}</div>`
      : emptyBlock('lightbulb', App.ideas.length ? 'No hay ideas con este filtro' : 'Tu banco de ideas está vacío', 'Anotá cualquier idea apenas se te ocurra. Después la convertís en guion, carrusel o publicación con un toque.')}</div>`;
};
function ideaCard(i) {
  const [sl, sc] = IDEA_STATUS[i.status] || IDEA_STATUS.nueva;
  return `<article class="card card-hover p-4 mb-4 break-inside-avoid rise">
    <div class="flex items-center gap-2 flex-wrap">
      ${i.net && i.net !== 'any' ? netDot(i.net, 20) : ''}<span class="badge badge-muted">${IDEA_FORMATS[i.format] || 'Idea'}</span><span class="badge ${sc}">${sl}</span>
      ${i.source === 'ia' ? `<span class="badge badge-soft">${ico('sparkles')}IA</span>` : ''}
      <button class="icon-btn sm ml-auto" data-action="ideaPin" data-id="${i.id}" aria-label="${i.pinned ? 'Desfijar' : 'Fijar'} idea" aria-pressed="${!!i.pinned}">${ico('pin', 'w-4 h-4' + (i.pinned ? ' text-gold' : ''))}</button>
    </div>
    <p class="mt-3 text-[15px] leading-relaxed whitespace-pre-line">${esc(i.text)}</p>
    ${i.hook ? `<p class="mt-2 text-sm text-gold-light">“${esc(i.hook)}”</p>` : ''}
    <p class="text-[11px] text-dim mt-3">${timeAgo(i.createdAt)}</p>
    <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
      <button class="btn-ghost btn-sm" data-action="ideaToScript" data-id="${i.id}">${ico('scroll-text', 'w-3.5 h-3.5 text-gold')}Guion</button>
      <button class="btn-ghost btn-sm" data-action="ideaToCarousel" data-id="${i.id}">${ico('gallery-horizontal-end', 'w-3.5 h-3.5 text-gold')}Carrusel</button>
      <button class="btn-ghost btn-sm" data-action="ideaToPost" data-id="${i.id}">${ico('calendar-plus', 'w-3.5 h-3.5 text-gold')}Post</button>
      <button class="icon-btn sm" data-action="ideaCycle" data-id="${i.id}" aria-label="Cambiar estado">${ico('refresh-cw')}</button>
      <button class="icon-btn sm danger" data-action="ideaDelete" data-id="${i.id}" aria-label="Eliminar idea">${ico('trash-2')}</button>
    </div>
  </article>`;
}
function addIdea(text, extra = {}) {
  const item = { id: uid(), text: text.trim().slice(0, 500), net: Ideas.net, format: Ideas.format, status: 'nueva', pinned: false, createdAt: Date.now(), source: 'manual', ...extra };
  App.ideas.push(item); persist('ideas', item); return item;
}
Actions.ideaNet = el => { Ideas.net = el.dataset.v; $$('[data-action="ideaNet"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === Ideas.net)); };
Actions.ideaFmt = el => { Ideas.format = el.dataset.v; $$('[data-action="ideaFmt"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === Ideas.format)); };
Actions.ideaFilter = el => { Ideas.filter = el.dataset.v; renderSection(); };
Inputs.ideaSearch = debounce(el => { Ideas.q = el.value; renderSection(); const s = $('#ideaSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250);
Actions.ideaPin = el => { const i = App.ideas.find(x => x.id === el.dataset.id); i.pinned = !i.pinned; persist('ideas', i); renderSection(); };
Actions.ideaCycle = el => { const i = App.ideas.find(x => x.id === el.dataset.id); const o = ['nueva', 'curso', 'usada']; i.status = o[(o.indexOf(i.status) + 1) % 3]; persist('ideas', i); renderSection(); renderSidebar(); icons(); };
Actions.ideaDelete = el => {
  const idx = App.ideas.findIndex(x => x.id === el.dataset.id); if (idx < 0) return;
  const [rm] = App.ideas.splice(idx, 1); unpersist('ideas', rm.id); renderSection(); renderSidebar(); icons();
  toast('Idea eliminada', { icon: 'trash-2', action: 'Deshacer', onAction: () => { App.ideas.splice(idx, 0, rm); persist('ideas', rm); renderSection(); renderSidebar(); icons(); } });
};
Actions.ideaToScript = el => { const i = App.ideas.find(x => x.id === el.dataset.id); markIdea(i); Studio.prefill = { script: i.text }; go('guiones'); };
Actions.ideaToCarousel = el => { const i = App.ideas.find(x => x.id === el.dataset.id); markIdea(i); Studio.prefill = { carousel: i.text }; go('carruseles'); };
Actions.ideaToPost = el => { const i = App.ideas.find(x => x.id === el.dataset.id); markIdea(i); openPostEditor(null, null, { title: i.text.slice(0, 100), format: i.net === 'tiktok' ? 'tiktok' : i.net === 'youtube' ? (i.format === 'largo' ? 'yt_long' : 'yt_short') : (i.format === 'post' || i.format === 'carrusel' ? 'ig_post' : 'ig_reel') }); };
function markIdea(i) { if (i && i.status === 'nueva') { i.status = 'curso'; persist('ideas', i); } }
Actions.ideasAI = async () => {
  if (!AI.ok) return toast('La generación con IA funciona al abrir la app en claude.ai.', { icon: 'sparkles' });
  Ideas.aiBusy = true; renderSection();
  try {
    const existing = App.ideas.slice(-15).map(i => '- ' + i.text).join('\n');
    const res = await AI.json(`Sos estratega de contenido para redes sociales. ${brandLine()} ${toneLine()}
Generá 5 ideas de contenido nuevas, concretas y distintas entre sí${Ideas.net !== 'any' ? ` para ${NET[Ideas.net].label}` : ' para Instagram, TikTok o YouTube'}.
Evitá repetir estas ideas que ya existen:\n${existing || '(ninguna)'}
Respondé SOLO con un array JSON de 5 objetos: [{"idea": "descripción en 1-2 frases", "gancho": "primera frase del video", "red": "instagram|tiktok|youtube", "formato": "reel|largo|historia|carrusel|post"}]`, { modelTier: 'quick', cache: false });
    const arr = Array.isArray(res) ? res : res?.ideas || [];
    arr.slice(0, 5).forEach(x => x && x.idea && addIdea(String(x.idea), { hook: String(x.gancho || '').slice(0, 200), net: NETS.includes(x.red) ? x.red : 'any', format: IDEA_FORMATS[x.formato] ? x.formato : 'reel', source: 'ia' }));
    toast(`${Math.min(arr.length, 5)} ideas nuevas guardadas`, { icon: 'sparkles' });
  } catch (e) { const m = AI.message(e); if (m) toast(m, { icon: 'circle-alert', error: true }); }
  Ideas.aiBusy = false; if (App.section === 'ideas') renderSection(); renderSidebar(); icons();
};

/* =========================================================
   MÉTRICAS
   ========================================================= */
const Met = { bar: 'er', line: 'total' };
RENDER.metricas = el => {
  const st = netStats(App.network), nets = App.network === 'all' ? NETS : [App.network];
  const [ws] = weekRange(); const lastWeek = new Date(ws); lastWeek.setDate(ws.getDate() - 7);
  const pub = byNetwork(App.posts).filter(p => p.status === 'published');
  const weekPub = pub.filter(p => new Date(p.date) >= new Date(Date.now() - 7 * 864e5));
  const best = (weekPub.length ? weekPub : pub).slice().sort((a, b) => er(b) - er(a))[0];
  const bestVs = best ? er(best) - BASE[netOf(best)].er : 0;
  const labels = dateLabels();
  const lineSeries = Met.line === 'total' || nets.length === 1
    ? [{ name: 'Seguidores', values: SERIES.instagram.followers.map((_, i) => nets.reduce((a, n) => a + SERIES[n].followers[i], 0)), color: 'url(#gGoldH)', dot: '#FFD84D', area: true }]
    : nets.map(n => ({ name: NET[n].label, values: SERIES[n].followers.map(v => (v / SERIES[n].followers[0] - 1) * 100), color: NET[n].color }));
  const lineFmt = Met.line === 'total' || nets.length === 1 ? fmtN : v => (v >= 0 ? '+' : '') + dec(v) + '%';
  const BAR = {
    er: ['Interacción %', n => ER_NOW[n], v => dec(v) + '%'],
    views: ['Vistas del mes', n => SERIES[n].views.reduce((a, b) => a + b, 0), fmtN],
    growth: ['Nuevos seguidores', n => SERIES[n].followers.at(-1) - SERIES[n].followers[0], v => '+' + fmtN(v)],
    followers: ['Seguidores', n => SERIES[n].followers.at(-1), fmtN],
  };
  const [, bv, bf] = BAR[Met.bar];
  const big = (i, icon, label, inner, delta, sub, extra = '') => `
    <article class="card card-hover p-5 md:p-7 rise relative overflow-hidden" style="animation-delay:${i * 80}ms">
      <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full" style="background:radial-gradient(circle,rgba(229,172,0,.12),transparent 70%)"></div>
      <div class="flex items-center gap-3 relative"><span class="w-11 h-11 rounded-2xl flex items-center justify-center" style="background:var(--gold-soft);border:1px solid var(--gold-line);color:var(--gold)">${ico(icon, 'w-5 h-5')}</span>
      <span class="text-xs font-bold tracking-[.16em] uppercase text-muted">${label}</span></div>
      <div class="mt-5 relative">${inner}</div>
      <div class="mt-4 flex items-center gap-2 flex-wrap relative">${delta}<span class="text-xs text-dim">${sub}</span></div>${extra}
    </article>`;
  el.innerHTML = `
    ${sectionHead(`Métricas <span class="gold-text">${App.network === 'all' ? 'globales' : NET[App.network].label}</span>`, 'Últimos 30 días', `<span class="badge badge-muted">${ico('info')}Datos de ejemplo hasta conectar las APIs</span>`)}
    <section class="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5" aria-label="Indicadores principales">
      ${big(0, 'users', 'Seguidores totales', `<div class="metric-big" data-count="${st.followers}" data-fmt="int">0</div>`, deltaPill(st.followersDelta), `+${fmtInt(st.newFollowers)} en 30 días`, `<div class="mt-3 -mb-2">${sparkline(SERIES.instagram.followers.map((_, i) => nets.reduce((a, n) => a + SERIES[n].followers[i], 0)))}</div>`)}
      ${big(1, 'heart-pulse', 'Interacción promedio', `<div class="metric-big" data-count="${st.er}" data-fmt="pct">0</div>`, deltaPill(st.erDelta, ' pp'), `vs ${dec(st.erPrev)}% el mes anterior`)}
      ${big(2, 'eye', 'Visualizaciones del mes', `<div class="metric-big" data-count="${st.views}" data-fmt="short">0</div>`, deltaPill(st.viewsDelta), `vs ${fmtN(st.viewsPrev)} el mes anterior`, `<div class="mt-3 -mb-2">${sparkline(SERIES.instagram.views.map((_, i) => nets.reduce((a, n) => a + SERIES[n].views[i], 0)))}</div>`)}
      ${best ? big(3, 'crown', 'Mejor post de la semana', `<button class="flex items-center gap-3 text-left w-full" data-action="analytics" data-id="${best.id}">
          <span class="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0">${mediaEl(best, 'absolute inset-0 w-full h-full object-cover')}<span class="absolute bottom-1 right-1">${netDot(netOf(best), 18)}</span></span>
          <span class="min-w-0"><span class="block font-semibold clamp-2">${esc(best.title)}</span><span class="block font-display text-3xl font-bold gold-text mt-1">${dec(er(best))}%</span></span></button>`,
          deltaPill(bestVs, ' pp'), `${fmtN(best.m.views)} vistas · vs promedio del canal`) : big(3, 'crown', 'Mejor post de la semana', '<p class="text-muted">Sin publicaciones esta semana</p>', '', '')}
    </section>

    <section class="mt-6"><h2 class="font-display text-xl font-semibold mb-4">Por red social</h2>
      <div class="grid md:grid-cols-3 gap-4 md:gap-5">${NETS.map((n, i) => { const s = netStats(n); return `
        <article class="card card-hover p-5 md:p-6 rise ${nets.includes(n) ? '' : 'opacity-45'}" style="animation-delay:${200 + i * 80}ms">
          <div class="flex items-center gap-3">${netDot(n, 40)}<div><h3 class="font-display text-lg font-semibold">${NET[n].label}</h3><p class="text-xs text-dim">${esc(App.settings.links?.[n] || 'Perfil sin vincular')}</p></div></div>
          <div class="mt-5"><div class="text-xs uppercase tracking-wider text-dim font-bold">Seguidores</div>
          <div class="flex items-end gap-3 mt-1 flex-wrap"><span class="font-display text-4xl font-bold tnum" data-count="${s.followers}" data-fmt="int">0</span>${deltaPill(s.followersDelta)}</div></div>
          <div class="grid grid-cols-2 gap-3 mt-4">
            <div class="well p-3"><div class="text-[11px] uppercase tracking-wider text-dim">Interacción</div><div class="font-display text-2xl font-semibold mt-1">${dec(s.er)}%</div><div class="text-[11px] font-bold mt-0.5 ${s.erDelta >= 0 ? 'text-up' : 'text-down'}">${s.erDelta >= 0 ? '▲' : '▼'} ${dec(Math.abs(s.erDelta))} pp</div></div>
            <div class="well p-3"><div class="text-[11px] uppercase tracking-wider text-dim">Vistas del mes</div><div class="font-display text-2xl font-semibold mt-1">${fmtN(s.views)}</div><div class="text-[11px] font-bold mt-0.5 ${s.viewsDelta >= 0 ? 'text-up' : 'text-down'}">${s.viewsDelta >= 0 ? '▲' : '▼'} ${dec(Math.abs(s.viewsDelta))}%</div></div>
          </div>
        </article>`; }).join('')}</div>
    </section>

    <section class="grid xl:grid-cols-5 gap-4 md:gap-5 mt-6">
      <article class="card p-5 md:p-6 xl:col-span-3 min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="font-display text-lg font-semibold">Crecimiento de los últimos 30 días</h2><p class="text-xs text-muted mt-1">${Met.line === 'total' || nets.length === 1 ? 'Seguidores totales por día' : 'Crecimiento % de cada red desde el día 1'}</p></div>
          ${nets.length > 1 ? `<div class="seg" role="group" aria-label="Tipo de gráfico"><button data-action="metLine" data-v="total" aria-pressed="${Met.line === 'total'}">Total</button><button data-action="metLine" data-v="net" aria-pressed="${Met.line === 'net'}">Por red</button></div>` : ''}
        </div>
        <div class="mt-4">${lineChart({ series: lineSeries, labels, height: 270, yFormat: lineFmt })}</div>
        ${lineSeries.length > 1 ? `<div class="flex gap-4 mt-2 text-xs text-muted">${lineSeries.map(s => `<span class="flex items-center gap-1.5"><span class="w-3 h-1 rounded-full" style="background:${s.color}"></span>${s.name}</span>`).join('')}</div>` : ''}
      </article>
      <article class="card p-5 md:p-6 xl:col-span-2 min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-display text-lg font-semibold">Instagram vs TikTok vs YouTube</h2></div>
        <div class="seg mt-3" role="group" aria-label="Métrica a comparar">${Object.entries(BAR).map(([k, [l]]) => `<button data-action="metBar" data-v="${k}" aria-pressed="${Met.bar === k}">${l}</button>`).join('')}</div>
        <div class="mt-5">${barChart(NETS.map(n => ({ label: NET[n].label, value: bv(n), fill: NET[n].fill })), { format: bf, height: 260 })}</div>
      </article>
    </section>`;
  runCounters(el);
};
Actions.metBar = el => { Met.bar = el.dataset.v; renderSection(); };
Actions.metLine = el => { Met.line = el.dataset.v; renderSection(); };

/* =========================================================
   PUBLICACIONES: crear / editar / analíticas / vista previa
   ========================================================= */
let PF = null; // formulario de publicación
async function savePost(p) { if (p.demo) return; track('post_saved', { net: p.net, status: p.status }); await persist('posts', { ...p, media: null }); }

function openAnalytics(id) {
  const p = findPost(id); if (!p || !p.m) return;
  const n = netOf(p), b = BASE[n], e = er(p), ratio = e / b.er * 100, diff = ratio - 100, f = FORMATS[p.format];
  const vs = (a, base) => { const d = (a / base - 1) * 100; return `<span class="text-[11px] font-bold ${d >= 0 ? 'text-up' : 'text-down'}">${d >= 0 ? '▲' : '▼'} ${dec(Math.abs(d), 0)}%</span>`; };
  const retSec = p.m.retPct != null ? Math.round(p.duration * p.m.retPct / 100) : null;
  const tile = (icon, label, value, extra = '') => `<div class="well p-3.5 md:p-4"><div class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-dim">${ico(icon, 'w-3.5 h-3.5 text-gold')}${label}</div><div class="font-display text-xl md:text-2xl font-semibold mt-2">${value}</div><div class="mt-1 min-h-[16px]">${extra}</div></div>`;
  const h = new Date(p.date).getHours(), vals = HOURS[n], max = Math.max(...vals);
  const dist = x => Math.min(Math.abs(x - h), 24 - Math.abs(x - h));
  const idx = SLOTS.reduce((best, s, i) => dist(s) < dist(SLOTS[best]) ? i : best, 0), bestIdx = vals.indexOf(max);
  const hourSvg = `<svg viewBox="0 0 350 152" class="w-full" role="img" aria-label="Engagement por franja horaria">${vals.map((v, i) => { const bh = v / max * 104, x = 14 + i * 47, y = 128 - bh;
    return `<rect class="bar-grow" style="animation-delay:${i * 60}ms" x="${x}" y="${y}" width="30" height="${bh}" rx="7" fill="${i === idx ? 'url(#gGold)' : '#2A3142'}"/><text x="${x + 15}" y="${y - 6}" text-anchor="middle" font-size="10" fill="${i === idx ? '#FFD84D' : '#6B7180'}" font-weight="600">${dec(v)}%</text><text x="${x + 15}" y="146" text-anchor="middle" font-size="10" fill="${i === idx ? '#E5AC00' : '#6B7180'}">${pad(SLOTS[i])}h</text>`; }).join('')}</svg>`;
  let retSvg = '';
  if (f.video && p.m.retPct) {
    const ret = p.m.retPct, end = Math.max(8, 100 - (100 - ret) / .625);
    const pts = Array.from({ length: 25 }, (_, i) => { const t = i / 24, v = clamp(100 - (100 - end) * Math.pow(t, .6) + Math.sin(t * 14) * 1.6 * t, 0, 100); return [24 + t * 316, 12 + (100 - v) / 100 * 116]; });
    const d = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' '), ay = 12 + (100 - ret) / 100 * 116;
    retSvg = `<svg viewBox="0 0 350 150" class="w-full" role="img" aria-label="Curva de retención">${[0, 50, 100].map(v => `<line x1="24" x2="340" y1="${12 + (100 - v) / 100 * 116}" y2="${12 + (100 - v) / 100 * 116}" stroke="#1F2533"/><text x="18" y="${15 + (100 - v) / 100 * 116}" text-anchor="end" font-size="9" fill="#5D6475">${v}%</text>`).join('')}
      <path class="area-in" d="${d} L340 128 L24 128Z" fill="url(#gArea)"/><path class="draw" pathLength="1" d="${d}" fill="none" stroke="url(#gGoldH)" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="24" x2="340" y1="${ay}" y2="${ay}" stroke="#FFD84D" stroke-dasharray="4 4" stroke-opacity=".6"/><text x="336" y="${ay - 5}" text-anchor="end" font-size="9.5" fill="#FFD84D">Prom. ${ret}%</text>
      <text x="24" y="144" font-size="9.5" fill="#6B7180">0:00</text><text x="340" y="144" text-anchor="end" font-size="9.5" fill="#6B7180">${fmtDur(p.duration)}</text></svg>`;
  }
  const cmp = [['Vistas', p.m.views, b.views, fmtN], ['Engagement', e, b.er, v => dec(v) + '%'], ['Guardados', p.m.saves, b.saves, fmtN], ['Nuevos seguidores', p.m.followers, b.followers, fmtN]];
  Modal.open(`
    ${modalHead(esc(p.title), `${NET[n].label} ${f.label} · ${fmtDate(p.date)}`, `<span class="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">${mediaEl(p, 'absolute inset-0 w-full h-full object-cover')}</span>`)}
    <div class="p-5 md:p-7 flex flex-col gap-5">
      <section class="rounded-3xl p-5 md:p-6 flex flex-col sm:flex-row items-center gap-5" style="background:linear-gradient(135deg,rgba(229,172,0,.12),rgba(229,172,0,.02));border:1px solid var(--gold-line)">
        ${ring(ratio)}
        <div class="text-center sm:text-left"><p class="text-xs uppercase tracking-[.2em] text-gold font-bold">Rendimiento vs canal</p>
          <p class="font-display text-2xl md:text-3xl font-semibold mt-1">${diff >= 0 ? `<span class="gold-text">${dec(diff, 0)}% superior</span> al promedio` : `<span class="text-down">${dec(Math.abs(diff), 0)}% inferior</span> al promedio`}</p>
          <p class="text-sm text-muted mt-2">Engagement de <b class="text-[var(--text)]">${dec(e)}%</b> frente a ${dec(b.er)}% histórico en ${NET[n].label}.</p></div>
      </section>
      <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${tile('eye', 'Vistas', fmtN(p.m.views), vs(p.m.views, b.views))}
        ${tile('heart', 'Me gusta', fmtN(p.m.likes), `<span class="text-[11px] text-dim">${dec(p.m.likes / p.m.views * 100)}% de vistas</span>`)}
        ${tile('message-circle', 'Comentarios', fmtN(p.m.comments), `<span class="text-[11px] text-dim">${dec(p.m.comments / p.m.views * 1000)} c/1K vistas</span>`)}
        ${tile('share-2', 'Compartidos', fmtN(p.m.shares), vs(p.m.shares, b.shares))}
        ${tile('mouse-pointer-click', 'CTR', dec(p.m.ctr) + '%', vs(p.m.ctr, b.ctr))}
        ${tile('timer', 'Retención prom.', retSec != null ? `${retSec}s <span class="text-base text-muted">· ${p.m.retPct}%</span>` : '<span class="text-dim">N/A</span>', retSec != null ? vs(p.m.retPct, b.ret) : '<span class="text-[11px] text-dim">Imagen</span>')}
        ${tile('bookmark', 'Guardados', fmtN(p.m.saves), vs(p.m.saves, b.saves))}
        ${tile('user-plus', 'Nuevos seguidores', '+' + fmtN(p.m.followers), vs(p.m.followers, b.followers))}
      </section>
      <section class="grid md:grid-cols-2 gap-4">
        <div class="card p-5"><h3 class="font-semibold flex items-center gap-2">${ico('clock', 'w-4 h-4 text-gold')}Rendimiento por hora de publicación</h3>
          <p class="text-xs text-dim mt-1">Mostaza = franja de esta publicación (${fmtTime(p.date)} HS).</p><div class="mt-4">${hourSvg}</div>
          <p class="text-xs mt-2 text-muted">${idx === bestIdx ? 'Publicaste en la mejor franja del canal.' : `Mejor franja del canal: <b class="text-gold-light">${pad(SLOTS[bestIdx])}:00 HS</b>.`}</p></div>
        <div class="card p-5">${retSvg ? `<h3 class="font-semibold flex items-center gap-2">${ico('activity', 'w-4 h-4 text-gold')}Retención de audiencia</h3><p class="text-xs text-dim mt-1">Promedio ${retSec}s de ${fmtDur(p.duration)}</p><div class="mt-4">${retSvg}</div>`
          : `<h3 class="font-semibold flex items-center gap-2">${ico('compass', 'w-4 h-4 text-gold')}Origen del alcance</h3><div class="mt-4 flex flex-col gap-3">${[['Feed / Para ti', 52], ['Explorar', 24], ['Perfil', 14], ['Hashtags', 10]].map(([l, v]) => `<div><div class="flex justify-between text-xs mb-1.5"><span class="text-muted">${l}</span><b>${v}%</b></div><div class="h-2 rounded-full bg-[#1F2533]"><div class="h-full rounded-full hbar" style="width:${v}%;background:var(--gold-grad)"></div></div></div>`).join('')}</div>`}</div>
      </section>
      <section class="card p-5"><h3 class="font-semibold flex items-center gap-2">${ico('scale', 'w-4 h-4 text-gold')}Esta publicación vs promedio del canal</h3>
        <div class="grid md:grid-cols-2 gap-x-8 gap-y-4 mt-4">${cmp.map(([l, a, bb, fm]) => { const mx = Math.max(a, bb) || 1; return `<div><div class="flex justify-between text-xs mb-1.5"><span class="text-muted">${l}</span><span><b class="text-gold-light">${fm(a)}</b> <span class="text-dim">/ ${fm(bb)}</span></span></div><div class="h-2 rounded-full bg-[#1F2533] overflow-hidden"><div class="h-full rounded-full hbar" style="width:${a / mx * 100}%;background:var(--gold-grad)"></div></div><div class="h-1 rounded-full bg-[#1F2533] overflow-hidden mt-1"><div class="h-full rounded-full bg-[#4B5263] hbar" style="width:${bb / mx * 100}%"></div></div></div>`; }).join('')}</div></section>
      <div class="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pb-2">
        <button class="btn-ghost" data-action="closeModal">Cerrar</button>
        <button class="btn-ghost" data-action="preview" data-id="${p.id}">${ico('smartphone', 'w-4 h-4 text-gold')}Ver publicación</button>
        <button class="btn-gold" data-action="duplicatePost" data-id="${p.id}">${ico('copy', 'w-4 h-4')}Reutilizar contenido</button>
      </div>
    </div>`, { size: 'md', label: 'Analíticas de ' + p.title });
}
Actions.analytics = el => { toggleNotif(false); openAnalytics(el.dataset.id); };

function previewHTML(p) {
  const f = FORMATS[p.format], n = f.net;
  const tags = (p.hashtags || []).map(t => `<span style="color:#8AB4F8">#${esc(t)}</span>`).join(' ');
  const title = esc(p.title || 'Título de tu publicación'), caption = esc(p.caption || 'Tu caption aparecerá aquí…');
  const status = `<div class="flex justify-between items-center px-6 pt-3 text-[11px] font-semibold relative z-10"><span>9:41</span><span class="flex gap-1 items-center">${ico('signal', 'w-3 h-3')}${ico('wifi', 'w-3 h-3')}${ico('battery-full', 'w-3.5 h-3.5')}</span></div>`;
  const media = cls => mediaEl(p, cls);
  const handle = (App.settings.handle || '@himproductmedia').replace(/^@/, '');
  const avatar = `<span class="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0" style="background:var(--gold-grad);color:var(--on-gold)">HIM</span>`;
  if (p.format === 'ig_post') return `<div class="phone-screen"><div class="phone-scroll">${status}
    <div class="flex items-center justify-between px-3 py-2.5"><span class="font-semibold text-base" style="font-family:cursive">Instagram</span><span class="flex gap-3">${ico('heart', 'w-5 h-5')}${ico('send', 'w-5 h-5')}</span></div>
    <div class="flex items-center gap-2 px-3 py-2"><span class="p-[2px] rounded-full" style="background:${NET.instagram.grad}">${avatar}</span><span class="font-semibold text-[12px]">${esc(handle)}</span><span class="ml-auto">${ico('ellipsis', 'w-4 h-4')}</span></div>
    <div class="relative w-full" style="aspect-ratio:4/5">${media('absolute inset-0 w-full h-full object-cover')}</div>
    <div class="flex items-center gap-3.5 px-3 py-2.5">${ico('heart', 'w-5 h-5')}${ico('message-circle', 'w-5 h-5')}${ico('send', 'w-5 h-5')}<span class="ml-auto">${ico('bookmark', 'w-5 h-5')}</span></div>
    <div class="px-3 pt-1 pb-6 text-[12px] leading-snug"><b>${esc(handle)}</b> <b>${title}</b> · ${caption} ${tags}</div></div></div>`;
  if (p.format === 'yt_long') return `<div class="phone-screen" style="background:#0F0F0F"><div class="phone-scroll">${status}
    <div class="flex items-center gap-1.5 px-3 py-2.5"><span class="w-6 h-4 text-[#FF0000]">${SVG.youtube}</span><b class="text-[14px]">YouTube</b></div>
    <div class="relative w-full" style="aspect-ratio:16/9">${media('absolute inset-0 w-full h-full object-cover')}<div class="absolute bottom-0 inset-x-0 h-[3px] bg-white/25"><div class="h-full w-1/3 bg-[#FF0000]"></div></div></div>
    <div class="px-3 pt-3"><div class="font-semibold text-[14px] leading-snug">${title}</div><div class="text-[10.5px] text-white/60 mt-1">Estreno programado</div></div>
    <div class="flex items-center gap-2 px-3 py-3">${avatar}<div class="font-semibold text-[12px]">${esc(App.settings.brand)}</div><span class="ml-auto bg-white text-black text-[11px] font-semibold rounded-full px-3 py-1.5">Suscribirse</span></div>
    <div class="mx-3 my-2 rounded-xl bg-white/10 p-2.5 text-[11px] leading-snug"><b>Descripción</b><div class="mt-1 text-white/85 clamp-3">${caption}</div><div class="mt-1">${tags}</div></div></div></div>`;
  const top = n === 'tiktok' ? `<div class="absolute top-11 inset-x-0 flex justify-center gap-4 text-[13px] font-semibold z-10"><span class="text-white/60">Siguiendo</span><span class="border-b-2 border-white pb-0.5">Para ti</span></div>`
    : `<div class="absolute top-11 inset-x-0 flex items-center px-4 text-[15px] font-bold z-10">${n === 'youtube' ? `<span class="w-5 h-5 text-[#FF0000] mr-1.5">${SVG.youtube}</span>Shorts` : 'Reels'}</div>`;
  const side = n === 'youtube' ? [['thumbs-up', 'Me gusta'], ['thumbs-down', ''], ['message-square', '0'], ['share', 'Compartir']] : [['heart', '0'], ['message-circle', '0'], ['bookmark', '0'], ['share', 'Compartir']];
  return `<div class="phone-screen">${media('absolute inset-0 w-full h-full object-cover')}
    <div class="absolute inset-0" style="background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 22%,transparent 55%,rgba(0,0,0,.85))"></div>${status}${top}
    <div class="absolute right-2.5 bottom-24 flex flex-col items-center gap-4 z-10">${side.map(([i, l]) => `<span class="flex flex-col items-center gap-0.5 text-[10px] font-semibold">${ico(i, 'w-6 h-6')}${l}</span>`).join('')}</div>
    <div class="absolute left-3 right-14 bottom-6 z-10 text-[11.5px] leading-snug">
      <div class="flex items-center gap-2 mb-2">${avatar}<b>@${esc(handle)}</b></div>
      <div class="font-semibold clamp-1">${title}</div><div class="clamp-2 text-white/90 mt-0.5">${caption}</div><div class="clamp-1 mt-0.5">${tags}</div></div></div>`;
}
const phone = p => `<div class="phone"><div class="phone-notch"></div>${previewHTML(p)}</div>`;
Actions.preview = el => {
  const p = findPost(el.dataset.id); if (!p) return;
  Modal.open(`${modalHead('Previsualización en vivo', `${FORMATS[p.format].full} · ${fmtDate(p.date)}`)}
    <div class="p-5 md:p-8 flex flex-col md:flex-row items-center gap-8">${phone(p)}
      <div class="flex-1 min-w-0 w-full"><div class="flex gap-2 flex-wrap">${netBadge(p)}${statusBadge(p.status)}</div>
        <h3 class="font-display text-2xl font-semibold mt-3">${esc(p.title)}</h3><p class="text-sm text-muted mt-2 leading-relaxed">${esc(p.caption)}</p>
        <p class="text-sm mt-2" style="color:var(--sky)">${p.hashtags.map(t => '#' + esc(t)).join(' ')}</p>
        <div class="flex flex-wrap gap-3 mt-6"><button class="btn-gold" data-action="editPost" data-id="${p.id}">${ico('pencil', 'w-4 h-4')}Editar</button>
        ${p.m ? `<button class="btn-ghost" data-action="analytics" data-id="${p.id}">${ico('chart-column', 'w-4 h-4 text-gold')}Ver analíticas</button>` : ''}</div></div></div>`, { label: 'Previsualización' });
};

function openPostEditor(id, day, preset = {}) {
  const p = id ? findPost(id) : null;
  let date, time = '18:30';
  if (p) { date = p.date.slice(0, 10); time = p.date.slice(11, 16); }
  else if (day) date = day;
  else { const t = new Date(TODAY); t.setDate(t.getDate() + 1); date = dayKey(t); }
  PF = p ? { id: p.id, format: p.format, title: p.title, caption: p.caption, hashtags: [...p.hashtags], date, time, status: p.status, media: p.media || null, img: p.img, duration: p.duration }
    : { id: null, format: 'ig_reel', title: '', caption: '', hashtags: [], date, time, status: 'draft', media: null, img: null, duration: 30, ...preset };
  const locked = PF.status === 'published';
  Modal.open(`${modalHead(p ? 'Editar publicación' : 'Nueva publicación', p ? esc(p.title) : 'Diseñá, programá y previsualizá tu contenido')}
    <div class="lg:hidden px-5 pt-4"><div class="seg w-full" role="tablist"><button class="flex-1 justify-center" data-action="pfTab" data-tab="edit" aria-pressed="true">${ico('pencil-line')}Editar</button><button class="flex-1 justify-center" data-action="pfTab" data-tab="preview" aria-pressed="false">${ico('smartphone')}Vista previa</button></div></div>
    <form id="postForm" novalidate class="grid lg:grid-cols-[minmax(0,1fr)_380px]">
      <div data-pane="edit" class="p-5 md:p-7 flex flex-col gap-6 min-w-0">
        <div><span class="label">Archivo multimedia</span><div id="pfDrop" class="dropzone p-4 md:p-5" data-drop="post"></div><input id="pfFile" type="file" accept="image/*,video/*" class="sr-only" data-change="pfFile" aria-label="Seleccionar archivo"></div>
        <fieldset ${locked ? 'disabled' : ''}><legend class="label">Plataforma y formato</legend><div id="pfFormats" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div></fieldset>
        <div><label class="label" for="pfTitle">Título</label><input id="pfTitle" name="title" class="input" maxlength="100" placeholder="Ej: 3 claves para un feed premium" value="${esc(PF.title)}" data-input="pf" data-autofocus><p id="pfErrT" class="err hidden" role="alert"></p></div>
        <div><div class="flex justify-between items-end"><label class="label" for="pfCaption">Copy / Caption</label><span id="pfCount" class="text-[11px] text-dim mb-2"></span></div>
          <textarea id="pfCaption" name="caption" rows="4" maxlength="2200" class="input resize-y leading-relaxed" placeholder="Contá la historia, sumá un CTA claro…" data-input="pf">${esc(PF.caption)}</textarea></div>
        <div><label class="label" for="pfTag">Hashtags</label>
          <div class="input !p-2 flex flex-wrap gap-1.5 items-center min-h-[50px]"><span id="pfTags" class="contents"></span><input id="pfTag" class="flex-1 min-w-[140px] bg-transparent outline-none text-sm px-1.5 min-h-[34px]" placeholder="Escribí y presioná Enter" autocomplete="off"></div>
          <p class="text-[11px] uppercase tracking-wider text-dim mt-3 mb-2 flex items-center gap-1.5">${ico('wand-sparkles', 'w-3.5 h-3.5 text-gold')}Recomendados</p><div id="pfSuggest" class="flex flex-wrap gap-1.5"></div></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="pfDate">Fecha</label><input id="pfDate" name="date" type="date" class="input" value="${PF.date}" data-input="pf" ${locked ? 'disabled' : ''}></div>
          <div><label class="label" for="pfTime">Hora</label><input id="pfTime" name="time" type="time" class="input" value="${PF.time}" data-input="pf" ${locked ? 'disabled' : ''}></div>
          <p id="pfErrD" class="col-span-2 err hidden" role="alert"></p>
        </div>
        ${locked ? `<div class="rounded-2xl p-4 flex items-center gap-3 text-sm" style="background:var(--gold-soft);border:1px solid var(--gold-line)">${ico('circle-check', 'w-5 h-5 text-gold shrink-0')}Ya publicada: podés actualizar título, copy y hashtags.</div>`
          : `<div class="rounded-2xl p-4 flex items-center gap-4 well"><div class="flex-1"><p class="font-semibold" id="pfStatusL"></p><p class="text-xs text-muted mt-0.5" id="pfStatusH"></p></div><button type="button" class="switch" role="switch" id="pfSwitch" data-action="pfToggle" aria-label="Listo para publicar"></button></div>`}
      </div>
      <aside data-pane="preview" class="hidden lg:flex flex-col items-center gap-4 p-6 border-l border-white/5" style="background:radial-gradient(400px 300px at 50% 30%,rgba(229,172,0,.08),transparent)">
        <p class="text-[11px] uppercase tracking-[.22em] text-gold font-bold flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full pulse" style="background:var(--up)"></span>Vista previa en vivo</p>
        <div id="pfPreview"></div><p id="pfPrevL" class="text-xs text-dim"></p>
      </aside>
    </form>
    <div class="sticky bottom-0 glass border-t border-white/5 px-5 md:px-7 py-4 flex gap-3 justify-end flex-wrap" style="padding-bottom:max(1rem,env(safe-area-inset-bottom,0px))">
      ${p ? `<button class="btn-ghost btn-danger mr-auto" data-action="deletePost" data-id="${p.id}">${ico('trash-2', 'w-4 h-4')}<span class="hidden sm:inline">Eliminar</span></button>` : ''}
      <button class="btn-ghost" data-action="closeModal">Cancelar</button>
      <button class="btn-gold min-w-[170px]" id="pfSave" data-action="pfSave">${ico('save', 'w-4 h-4')}<span>Guardar</span></button>
    </div>`, { size: 'xl', label: p ? 'Editar publicación' : 'Nueva publicación', onClose: () => { PF = null; } });
  $('#pfTag').addEventListener('keydown', e => {
    if (['Enter', ',', ' '].includes(e.key)) { e.preventDefault(); if (e.target.value.trim()) { pfAddTag(e.target.value); e.target.value = ''; pfRefresh(); $('#pfTag').focus(); } }
    else if (e.key === 'Backspace' && !e.target.value && PF.hashtags.length) { PF.hashtags.pop(); pfRefresh(); $('#pfTag').focus(); }
  });
  $('#postForm').addEventListener('submit', e => e.preventDefault());
  pfRefresh();
}
function pfAddTag(raw) { raw.split(/[\s,]+/).forEach(t => { t = t.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 40); if (t && !PF.hashtags.includes(t) && PF.hashtags.length < 30) PF.hashtags.push(t); }); }
function pfRefresh() {
  if (!PF) return;
  const f = FORMATS[PF.format], n = f.net, locked = PF.status === 'published';
  $('#pfDrop').innerHTML = (PF.media || PF.img) ? `<div class="flex items-center gap-4"><span class="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-white/10">${mediaEl(PF, 'absolute inset-0 w-full h-full object-cover')}</span>
      <div class="min-w-0 flex-1"><p class="font-semibold text-sm truncate">${esc(PF.media ? PF.media.name : 'Imagen actual')}</p><p class="text-xs text-dim mt-0.5">${PF.media ? dec(PF.media.size / 1048576) + ' MB' : 'Arrastrá un archivo para reemplazarla'}</p>
      <div class="flex gap-2 mt-2"><button type="button" class="btn-ghost btn-sm" data-action="pfPick">${ico('refresh-cw', 'w-3.5 h-3.5')}Cambiar</button><button type="button" class="btn-ghost btn-sm" data-action="pfRemove">${ico('x', 'w-3.5 h-3.5')}Quitar</button></div></div></div>`
    : `<button type="button" data-action="pfPick" class="w-full flex flex-col items-center justify-center text-center gap-2 py-6"><span class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico('cloud-upload', 'w-6 h-6')}</span>
      <span class="font-semibold">Arrastrá tu imagen o video aquí</span><span class="text-xs text-dim">o <span class="text-gold-light underline">explorá tus archivos</span> · máx. 200 MB</span></button>`;
  $('#pfFormats').innerHTML = Object.entries(FORMATS).map(([k, v]) => `<button type="button" data-action="pfFormat" data-v="${k}" aria-pressed="${PF.format === k}" class="flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition min-h-[52px] disabled:opacity-50" style="border-color:${PF.format === k ? 'rgba(229,172,0,.75)' : 'var(--line)'};background:${PF.format === k ? 'var(--gold-soft)' : 'transparent'}">
    ${netDot(v.net, 28)}<span class="leading-tight min-w-0"><span class="block text-[13px] font-semibold truncate">${NET[v.net].label}</span><span class="block text-[11px] ${PF.format === k ? 'text-gold-light' : 'text-dim'}">${v.label}</span></span></button>`).join('');
  $('#pfTags').innerHTML = PF.hashtags.map((t, i) => `<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-semibold badge-soft">#${esc(t)}<button type="button" data-action="pfRmTag" data-i="${i}" class="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-white/10" aria-label="Quitar #${esc(t)}">${ico('x', 'w-3 h-3')}</button></span>`).join('');
  $('#pfSuggest').innerHTML = SUGGEST[n].map(t => `<button type="button" class="chip !min-h-[34px] !text-xs" data-action="pfAddTag" data-v="${t}" ${PF.hashtags.includes(t) ? 'disabled' : ''}>${ico('plus', 'w-3 h-3')}#${t}</button>`).join('');
  $('#pfCount').textContent = `${PF.caption.length} / 2200`;
  if (!locked) {
    const ready = PF.status === 'scheduled';
    $('#pfSwitch').setAttribute('aria-checked', ready);
    $('#pfStatusL').innerHTML = ready ? '<span class="text-up">Listo para publicar</span>' : 'Borrador';
    $('#pfStatusH').textContent = ready ? 'Se publicará en la fecha y hora elegidas.' : 'Guardalo y terminalo después.';
    $('#pfSave span').textContent = ready ? 'Programar publicación' : 'Guardar borrador';
  } else $('#pfSave span').textContent = 'Guardar cambios';
  pfPreview(); icons();
}
function pfPreview() { if (!PF) return; $('#pfPreview').innerHTML = phone({ ...PF, date: `${PF.date}T${PF.time}` }); $('#pfPrevL').textContent = FORMATS[PF.format].full; icons(); }
Inputs.pf = el => { if (!PF) return; PF[el.name] = el.value; if (el.name === 'caption') $('#pfCount').textContent = `${el.value.length} / 2200`; pfPreview(); };
Actions.pfTab = el => { const tab = el.dataset.tab, ed = $('[data-pane="edit"]'), pv = $('[data-pane="preview"]'); ed.classList.toggle('hidden', tab === 'preview'); ed.classList.add('lg:flex'); pv.classList.toggle('hidden', tab !== 'preview'); pv.classList.toggle('flex', tab === 'preview'); $$('[data-action="pfTab"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab)); };
Actions.pfFormat = el => { PF.format = el.dataset.v; pfRefresh(); };
Actions.pfToggle = () => { PF.status = PF.status === 'scheduled' ? 'draft' : 'scheduled'; pfRefresh(); };
Actions.pfAddTag = el => { pfAddTag(el.dataset.v); pfRefresh(); };
Actions.pfRmTag = el => { PF.hashtags.splice(+el.dataset.i, 1); pfRefresh(); };
Actions.pfPick = () => $('#pfFile').click();
Actions.pfRemove = () => { PF.media = null; PF.img = null; pfRefresh(); };
Changes.pfFile = el => { pfFile(el.files[0]); el.value = ''; };
function pfFile(file) {
  if (!file || !PF) return;
  if (!/^(image|video)\//.test(file.type)) return toast('Formato no soportado. Usá una imagen o un video.', { icon: 'circle-alert', error: true });
  if (file.size > 200 * 1048576) return toast('El archivo supera los 200 MB.', { icon: 'circle-alert', error: true });
  PF.media = { url: URL.createObjectURL(file), type: file.type, name: file.name, size: file.size };
  pfRefresh();
}
Actions.pfSave = () => {
  const title = PF.title.trim(); let ok = true;
  const eT = $('#pfErrT'), eD = $('#pfErrD'); eT.classList.add('hidden'); eD.classList.add('hidden');
  if (!title) { eT.textContent = 'Escribí un título para identificar la publicación.'; eT.classList.remove('hidden'); ok = false; }
  const when = new Date(`${PF.date}T${PF.time}`);
  if (!PF.date || !PF.time || isNaN(when)) { eD.textContent = 'Elegí una fecha y hora válidas.'; eD.classList.remove('hidden'); ok = false; }
  else if (PF.status === 'scheduled' && when <= new Date()) { eD.textContent = 'Para programar, elegí una fecha futura.'; eD.classList.remove('hidden'); ok = false; }
  if (!ok) { Actions.pfTab({ dataset: { tab: 'edit' } }); return; }
  const btn = $('#pfSave'); btn.disabled = true; btn.innerHTML = `${ico('loader-circle', 'w-4 h-4 spin')}<span>Guardando…</span>`; icons();
  const data = { format: PF.format, title, caption: PF.caption.trim(), hashtags: PF.hashtags, date: `${PF.date}T${PF.time}`, status: PF.status, media: PF.media, img: PF.media ? null : (PF.img || PLACEHOLDER), duration: PF.duration };
  setTimeout(() => {
    let msg;
    if (PF.id) { const p = findPost(PF.id); Object.assign(p, data); savePost(p); msg = 'Cambios guardados'; }
    else { const p = { id: 'p' + uid(), m: null, ...data }; App.userPosts.push(p); savePost(p); msg = PF.status === 'scheduled' ? `Programado para ${fmtDate(data.date)}` : 'Borrador guardado'; }
    Modal.close(); renderSection(); toast(msg);
  }, 500);
};
Actions.create = el => openPostEditor(null, el.dataset.day);
Actions.editPost = el => { toggleNotif(false); openPostEditor(el.dataset.id); };
Actions.duplicatePost = el => {
  const p = findPost(el.dataset.id); if (!p) return;
  const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(18, 30, 0, 0);
  const copy = { ...p, id: 'p' + uid(), demo: false, title: p.title + ' (copia)', status: 'draft', m: null, hashtags: [...p.hashtags], date: new Date(p.date) < new Date() ? toISO(d) : p.date };
  App.userPosts.push(copy); savePost(copy); Modal.close(); renderSection();
  toast('Duplicado como borrador', { icon: 'copy', action: 'Editar', onAction: () => openPostEditor(copy.id) });
};
Actions.deletePost = async el => {
  const p = findPost(el.dataset.id); if (!p) return;
  if (!await confirmBox({ title: '¿Eliminar esta publicación?', text: `“${esc(p.title)}” se quitará del calendario.`, ok: 'Eliminar', danger: true, icon: 'trash-2' })) return;
  if (p.demo) { const i = DEMO_POSTS.indexOf(p); DEMO_POSTS.splice(i, 1); }
  else { App.userPosts = App.userPosts.filter(x => x.id !== p.id); unpersist('posts', p.id); }
  renderSection(); toast('Publicación eliminada', { icon: 'trash-2' });
};

/* =========================================================
   CONEXIONES
   ========================================================= */
const Conn = { gmail: { state: 'idle', items: [], error: '' } };
const CONNECTORS = [
  { group: 'Redes sociales', items: [
    { id: 'instagram', name: 'Instagram', desc: 'Publicaciones, Reels, historias y métricas', net: 'instagram', api: 'Instagram Graph API (cuenta Business o Creator vinculada a una página de Facebook)' },
    { id: 'tiktok', name: 'TikTok', desc: 'Videos, programación y analíticas', net: 'tiktok', api: 'TikTok Content Posting API + Display API (requiere app aprobada por TikTok)' },
    { id: 'youtube', name: 'YouTube', desc: 'Videos largos, Shorts y YouTube Analytics', net: 'youtube', api: 'YouTube Data API v3 + YouTube Analytics API (OAuth de Google)' },
  ] },
  { group: 'Comunicación', items: [
    { id: 'gmail', name: 'Gmail', desc: 'Bandeja de propuestas y colaboraciones', icon: 'mail', color: '#EA4335', real: 'gmail' },
    { id: 'telegram', name: 'Telegram', desc: 'Avisos de publicación y resúmenes', icon: 'send', color: '#27A7E7', api: 'Bot de Telegram (token del BotFather guardado en un servidor, nunca en el navegador)' },
    { id: 'whatsapp', name: 'WhatsApp Business', desc: 'Respuestas a clientes y marcas', icon: 'message-circle', color: '#25D366', api: 'WhatsApp Cloud API de Meta' },
  ] },
  { group: 'Inteligencia artificial', items: [
    { id: 'claude', name: 'Claude (Anthropic)', desc: 'Guiones, carruseles, ideas, análisis y editor', icon: 'sparkles', color: '#D97757', real: 'claude' },
    { id: 'openai', name: 'ChatGPT / OpenAI', desc: 'Generación alternativa de textos e imágenes', icon: 'bot', color: '#10A37F', api: 'API de OpenAI (clave guardada en un servidor propio)' },
    { id: 'gemini', name: 'Google Gemini', desc: 'Análisis de video y textos largos', icon: 'gem', color: '#4F8CFF', api: 'Gemini API de Google AI Studio' },
    { id: 'elevenlabs', name: 'ElevenLabs', desc: 'Voz en off con IA para tus videos', icon: 'audio-lines', color: '#F5F5F5', api: 'API de ElevenLabs' },
    { id: 'midjourney', name: 'Midjourney / Leonardo', desc: 'Imágenes y miniaturas con IA', icon: 'image', color: '#A78BFA', api: 'API de Leonardo.ai (Midjourney no ofrece API pública)' },
  ] },
  { group: 'Productividad', items: [
    { id: 'drive', name: 'Google Drive', desc: 'Guardar videos y recursos', icon: 'hard-drive', color: '#34A853', api: 'Google Drive API' },
    { id: 'canva', name: 'Canva', desc: 'Diseños y plantillas de marca', icon: 'palette', color: '#00C4CC', api: 'Canva Connect API' },
    { id: 'notion', name: 'Notion', desc: 'Planificación y base de contenidos', icon: 'notebook-pen', color: '#EDEDED', api: 'Notion API' },
  ] },
];
function connStatus(c) {
  if (c.real === 'claude') return AI.ok ? ['Conectado', 'badge-up'] : ['Disponible en claude.ai', 'badge-muted'];
  if (c.real === 'gmail') return Conn.gmail.state === 'ok' ? ['Conectado', 'badge-up'] : Conn.gmail.state === 'error' ? ['Revisar conexión', 'badge-down'] : ['Listo para conectar', 'badge-soft'];
  if (App.settings.links?.[c.id]) return ['Perfil vinculado', 'badge-soft'];
  return ['Sin conectar', 'badge-muted'];
}
RENDER.conexiones = el => {
  const total = CONNECTORS.flatMap(g => g.items), on = total.filter(c => ['Conectado', 'Perfil vinculado'].includes(connStatus(c)[0])).length;
  el.innerHTML = `${sectionHead('Conexiones', 'Plataformas e integraciones', `<span class="badge badge-soft">${ico('plug-zap')}${on} de ${total.length} activas</span>`)}
    ${CONNECTORS.map(g => `<section class="mb-8"><h2 class="text-[11px] tracking-[.22em] uppercase text-dim font-bold mb-3">${g.group}</h2>
      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${g.items.map(c => { const [sl, sc] = connStatus(c); return `
        <article class="card card-hover p-5 flex flex-col">
          <div class="flex items-center gap-3">${c.net ? netDot(c.net, 44) : `<span class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${ico(c.icon, 'w-5 h-5')}</span>`}
            <div class="min-w-0 flex-1"><h3 class="font-semibold">${c.name}</h3><p class="text-xs text-muted mt-0.5">${c.desc}</p></div></div>
          <div class="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-white/5 mt-auto">
            <span class="badge ${sc}">${sl}</span>
            <button class="btn-ghost btn-sm" data-action="connOpen" data-id="${c.id}">${c.real === 'claude' ? 'Detalles' : sl === 'Sin conectar' || sl === 'Listo para conectar' ? 'Conectar' : 'Gestionar'}</button>
          </div>
          ${c.id === 'gmail' && Conn.gmail.state === 'ok' ? gmailList() : ''}
        </article>`; }).join('')}</div></section>`).join('')}
    <div class="card p-5 flex gap-3 text-sm text-muted">${ico('shield-check', 'w-5 h-5 text-gold shrink-0')}<p>Por seguridad, la app nunca te pide contraseñas ni claves API de otras plataformas. Las integraciones oficiales se autorizan con OAuth desde un servidor; lo que corre en tu navegador solo guarda el enlace a tu perfil.</p></div>`;
};
function gmailList() {
  const g = Conn.gmail;
  return `<div class="mt-4 flex flex-col gap-2">${g.items.length ? g.items.slice(0, 5).map(m => `<div class="well p-3"><div class="text-sm font-semibold truncate">${esc(m.subject || '(sin asunto)')}</div><div class="text-[11px] text-dim truncate mt-0.5">${esc(m.from || '')}${m.date ? ' · ' + esc(m.date) : ''}</div>${m.snippet ? `<div class="text-xs text-muted clamp-2 mt-1">${esc(m.snippet)}</div>` : ''}</div>`).join('') : '<p class="text-xs text-muted">No encontré correos de colaboraciones en los últimos 30 días.</p>'}
    <button class="btn-ghost btn-sm self-start" data-action="gmailLoad">${ico('refresh-cw', 'w-3.5 h-3.5')}Actualizar</button></div>`;
}
Actions.connOpen = el => {
  const c = CONNECTORS.flatMap(g => g.items).find(x => x.id === el.dataset.id);
  if (c.real === 'gmail') return Actions.gmailLoad();
  if (c.real === 'claude') return Modal.open(`${modalHead('Claude (Anthropic)', 'Motor de IA de la app')}<div class="p-6 flex flex-col gap-4 text-sm text-muted">
    <p>${AI.ok ? 'La IA está activa: la app usa Claude a través de tu cuenta de claude.ai. Cada generación consume tu uso de Claude y la primera vez te pide permiso.' : 'La IA real funciona cuando abrís la app publicada en claude.ai. Fuera de ahí, guiones y carruseles se generan con plantillas de ejemplo.'}</p>
    <ul class="flex flex-col gap-2">${['Guiones con gancho, desarrollo, cierre y CTA', 'Carruseles completos por filmina', 'Ideas y análisis de competencia', 'Asistente del editor de video con prompts'].map(t => `<li class="flex gap-2">${ico('check', 'w-4 h-4 text-gold shrink-0 mt-0.5')}${t}</li>`).join('')}</ul></div>`, { size: 'sm' });
  const cur = App.settings.links?.[c.id] || '';
  Modal.open(`${modalHead('Conectar ' + c.name, c.desc, c.net ? netDot(c.net, 36) : '')}
    <form class="p-6 flex flex-col gap-5" data-form="connSave" data-id="${c.id}">
      <div class="well p-4 text-sm text-muted flex gap-3">${ico('info', 'w-5 h-5 text-gold shrink-0')}<div><p class="text-[var(--text)] font-semibold">Integración oficial: ${c.api}</p><p class="mt-1">Requiere registrar una app en la plataforma y un servidor que guarde los permisos OAuth. Mientras tanto, vinculá tu perfil para usarlo en métricas, vista previa y análisis.</p></div></div>
      <div><label class="label" for="connLink">${c.net ? 'Usuario o enlace de tu perfil' : 'Usuario, enlace o identificador'}</label><input id="connLink" class="input" maxlength="200" placeholder="${c.net ? '@tuusuario' : 'Opcional'}" value="${esc(cur)}" data-autofocus autocomplete="off"><p class="help">Nunca escribas aquí contraseñas ni claves API.</p></div>
      <div class="flex flex-col-reverse sm:flex-row gap-3 justify-end">${cur ? `<button type="button" class="btn-ghost btn-danger sm:mr-auto" data-action="connUnlink" data-id="${c.id}">Desvincular</button>` : ''}<button type="button" class="btn-ghost" data-action="closeModal">Cancelar</button><button class="btn-gold" type="submit">${ico('link')}Vincular perfil</button></div>
    </form>`, { size: 'sm', label: 'Conectar ' + c.name });
};
Actions.connUnlink = async el => { const links = { ...App.settings.links }; delete links[el.dataset.id]; await saveSettings({ links }); Modal.close(); renderSection(); toast('Perfil desvinculado', { icon: 'unlink' }); };
let mcpCap;
Actions.gmailLoad = async () => {
  if (mcpCap === undefined) mcpCap = (window.claude && typeof claude.use === 'function') ? await claude.use('mcp').catch(() => null) : null;
  if (!mcpCap) return toast('Gmail se conecta al abrir la app en claude.ai con el conector de Gmail activo.', { icon: 'mail' });
  Conn.gmail.state = 'loading'; toast('Buscando correos de colaboraciones…', { icon: 'mail' });
  try {
    const r = await mcpCap.callTool('Gmail', 'search_threads', { query: '(colaboración OR colaboracion OR collab OR sponsorship OR patrocinio OR propuesta OR campaña) newer_than:30d', pageSize: 10, view: 'THREAD_VIEW_MINIMAL' });
    const payload = r.payload || {};
    const threads = Array.isArray(payload.threads) ? payload.threads : Array.isArray(payload) ? payload : [];
    Conn.gmail.items = threads.map(t => {
      const msg = (Array.isArray(t.messages) && t.messages[0]) || (Array.isArray(t.relatedMessages) && t.relatedMessages[0]) || t;
      const s = msg.sender; const from = typeof s === 'string' ? s : s?.name || s?.email || s?.emailAddress || '';
      return { subject: msg.subject || t.subject || '', from, date: msg.date ? String(msg.date).slice(0, 16) : '', snippet: msg.snippet || t.snippet || '' };
    });
    Conn.gmail.state = 'ok';
  } catch (e) {
    Conn.gmail.state = 'error';
    const m = { needs_reauth: 'Reconectá Gmail en claude.ai → Configuración → Conectores.', server_not_connected: 'Agregá el conector de Gmail en claude.ai → Configuración → Conectores.', not_in_manifest: 'No diste permiso a esta página para usar Gmail.', blocked_by_policy: 'Tu organización bloquea Gmail para esta página.' }[e?.code] || 'No se pudo leer Gmail ahora. Intentá de nuevo en un momento.';
    toast(m, { icon: 'circle-alert', error: true });
  }
  if (App.section === 'conexiones') renderSection();
};

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */
RENDER.configuracion = el => {
  const S = App.settings, A = Auth.record;
  const field = (id, label, value, attrs = '') => `<div><label class="label" for="${id}">${label}</label><input id="${id}" class="input" value="${esc(value)}" ${attrs}></div>`;
  el.innerHTML = `${sectionHead('Configuración', 'Tu cuenta y preferencias')}
    <div class="grid xl:grid-cols-2 gap-5">
      <form class="card p-5 md:p-7 flex flex-col gap-5" data-form="settingsProfile">
        <h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('user-round', 'w-5 h-5 text-gold')}Perfil y marca</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          ${field('sName', 'Tu nombre', S.displayName || A?.username || '', 'maxlength="60"')}
          ${field('sBrand', 'Nombre de la marca', S.brand, 'maxlength="60"')}
          ${field('sHandle', 'Usuario principal', S.handle, 'maxlength="40" placeholder="@usuario"')}
          <div><label class="label" for="sNet">Red por defecto</label><select id="sNet" class="input">${[['all', 'Todas'], ...NETS.map(n => [n, NET[n].label])].map(([k, l]) => `<option value="${k}" ${S.defaultNet === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div><label class="label" for="sNiche">Nicho / temas de tu contenido</label><input id="sNiche" class="input" maxlength="160" value="${esc(S.niche)}"><p class="help">La IA lo usa como contexto para ideas, guiones y carruseles.</p></div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div><label class="label" for="sTone">Tono de la IA</label><select id="sTone" class="input">${[['cercano', 'Profesional y cercano'], ['inspirador', 'Inspirador'], ['divertido', 'Divertido'], ['experto', 'Experto']].map(([k, l]) => `<option value="${k}" ${S.tone === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${field('sGoal', 'Meta mensual (US$)', S.goal, 'type="number" min="0" step="100"')}
        </div>
        <div class="flex justify-end"><button class="btn-gold" type="submit">${ico('save', 'w-4 h-4')}Guardar perfil</button></div>
      </form>

      <form class="card p-5 md:p-7 flex flex-col gap-5" data-form="changePw" autocomplete="off">
        <h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('key-round', 'w-5 h-5 text-gold')}Seguridad y contraseña</h2>
        <div class="well p-4 flex items-center gap-3 text-sm"><span class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico('user-check', 'w-5 h-5')}</span>
          <div class="min-w-0"><div class="font-semibold">Usuario: ${esc(A?.username || '—')}</div><div class="text-xs text-dim">Contraseña actualizada ${A ? timeAgo(A.changedAt) : '—'}</div></div></div>
        <input type="text" class="hidden" autocomplete="username" value="${esc(A?.username || '')}" aria-hidden="true" tabindex="-1">
        ${pwField('pwCur', 'Contraseña actual')}
        ${pwField('pwNew', 'Nueva contraseña', 'new-password', 'data-input="newPwStrength"')}${strengthBar('pwStr')}
        ${pwField('pwNew2', 'Repetir nueva contraseña', 'new-password')}
        <p id="pwErr" class="err hidden" role="alert"></p>
        <p class="text-xs text-dim">Usá el ícono ${ico('eye', 'w-3.5 h-3.5 inline')} para ver lo que escribís. Por seguridad la contraseña guardada no se puede mostrar: solo cambiar.</p>
        <div><label class="label" for="sLock">Bloqueo automático por inactividad</label><select id="sLock" class="input" data-change="autolock">${[[0, 'Nunca'], [5, '5 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora']].map(([v, l]) => `<option value="${v}" ${+S.autolock === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="flex flex-col-reverse sm:flex-row gap-3 justify-end"><button type="button" class="btn-ghost" data-action="logout">${ico('log-out', 'w-4 h-4')}Cerrar sesión</button><button class="btn-gold" type="submit">${ico('shield-check', 'w-4 h-4')}Cambiar contraseña</button></div>
      </form>

      <section class="card p-5 md:p-7 flex flex-col gap-4">
        <h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('bell', 'w-5 h-5 text-gold')}Notificaciones</h2>
        ${[['publish', 'Recordatorio antes de cada publicación'], ['weekly', 'Resumen semanal de métricas'], ['milestones', 'Hitos de seguidores y posts virales'], ['ideas', 'Recordarme ideas sin desarrollar']].map(([k, l]) => `
          <div class="flex items-center justify-between gap-4 min-h-[44px]"><span class="text-sm">${l}</span><button class="switch" role="switch" aria-checked="${!!S.notif[k]}" aria-label="${l}" data-action="notifToggle" data-k="${k}"></button></div>`).join('')}
      </section>

      <section class="card p-5 md:p-7 flex flex-col gap-4">
        <h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('database', 'w-5 h-5 text-gold')}Datos</h2>
        <div class="flex items-center justify-between gap-4 min-h-[44px]"><div><div class="text-sm">Mostrar publicaciones de ejemplo</div><div class="text-xs text-dim">Ocultalas cuando cargues tu propio contenido</div></div><button class="switch" role="switch" aria-checked="${S.showDemo}" aria-label="Mostrar publicaciones de ejemplo" data-action="demoToggle"></button></div>
        <div class="well p-4 text-sm text-muted flex gap-3">${ico(Store.mode === 'cloud' ? 'cloud' : 'hard-drive', 'w-5 h-5 text-gold shrink-0')}${Store.mode === 'cloud' ? 'Tus datos se guardan en tu cuenta de claude.ai, de forma privada: nadie más puede verlos.' : 'Tus datos se guardan solo en este navegador. Abrí la app en claude.ai para sincronizarlos en tu cuenta.'}</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">${[['Ideas', App.ideas.length], ['Guiones', App.scripts.length], ['Carruseles', App.carousels.length], ['Competidores', App.competitors.length]].map(([l, v]) => `<div class="well p-3"><div class="font-display text-xl font-semibold">${v}</div><div class="text-[11px] text-dim">${l}</div></div>`).join('')}</div>
        <div class="flex flex-wrap gap-3"><button class="btn-ghost" data-action="exportData">${ico('download', 'w-4 h-4 text-gold')}Exportar mis datos (JSON)</button><button class="btn-ghost btn-danger" data-action="deleteAccount">${ico('user-x', 'w-4 h-4')}Eliminar cuenta y datos</button></div>
        <p class="text-xs text-dim flex flex-wrap gap-x-4 gap-y-1">${legalLinks()}</p>
      </section>
    </div>`;
};
Inputs.newPwStrength = el => paintStrength('pwStr', el.value);
Changes.autolock = async el => { await saveSettings({ autolock: +el.value }); toast('Bloqueo automático actualizado', { icon: 'lock' }); };
Actions.notifToggle = async el => { const notif = { ...App.settings.notif, [el.dataset.k]: !App.settings.notif[el.dataset.k] }; el.setAttribute('aria-checked', notif[el.dataset.k]); await saveSettings({ notif }); };
Actions.demoToggle = async el => { await saveSettings({ showDemo: !App.settings.showDemo }); el.setAttribute('aria-checked', App.settings.showDemo); toast(App.settings.showDemo ? 'Ejemplos visibles' : 'Ejemplos ocultos'); };
Actions.deleteAccount = async () => {
  if (!await confirmBox({ title: '¿Eliminar tu cuenta y todos tus datos?', text: 'Se borran publicaciones, ideas, guiones, carruseles, competidores, configuración y tu acceso. No se puede deshacer. Si querés, exportá tus datos antes.', ok: 'Eliminar todo', danger: true, icon: 'user-x' })) return;
  try {
    await Store.wipe();
    Object.assign(App, { userPosts: [], ideas: [], scripts: [], carousels: [], competitors: [], settings: { ...DEFAULT_SETTINGS } });
    Auth.record = null; Auth.endSession(); if (window.Editor) Editor.pause(); Modal.close(true);
    renderAuth('create'); toast('Cuenta y datos eliminados', { icon: 'trash-2' });
  } catch (e) { reportError(e, 'deleteAccount'); toast('No se pudo eliminar todo. Intentá de nuevo.', { icon: 'circle-alert', error: true }); }
};
Actions.exportData = () => saveFile(`him-datos-${dayKey(new Date())}.json`, JSON.stringify({ exportado: new Date().toISOString(), settings: App.settings, publicaciones: App.userPosts.map(p => ({ ...p, media: null })), ideas: App.ideas, guiones: App.scripts, carruseles: App.carousels, competencia: App.competitors }, null, 2));

/* ---------- Formularios ---------- */
const Forms = {
  quickIdea: f => { const t = $('#qIdea'); if (!t.value.trim()) return t.focus(); addIdea(t.value); t.value = ''; toast('Idea guardada', { icon: 'lightbulb', action: 'Ver ideas', onAction: () => go('ideas') }); renderSidebar(); icons(); },
  newIdea: f => { const t = $('#ideaText'); if (!t.value.trim()) return t.focus(); addIdea(t.value); renderSection(); renderSidebar(); icons(); $('#ideaText').focus(); toast('Idea guardada', { icon: 'lightbulb' }); },
  connSave: async f => { const v = $('#connLink').value.trim(); if (/pass|contraseñ|sk-|api[_-]?key/i.test(v)) return toast('Ese campo es solo para el usuario o enlace del perfil.', { icon: 'circle-alert', error: true }); await saveSettings({ links: { ...App.settings.links, [f.dataset.id]: v } }); Modal.close(); renderSection(); toast(v ? 'Perfil vinculado' : 'Guardado', { icon: 'link' }); },
  settingsProfile: async () => {
    const brand = $('#sBrand').value.trim() || DEFAULT_SETTINGS.brand;
    let handle = $('#sHandle').value.trim(); if (handle && !handle.startsWith('@')) handle = '@' + handle;
    await saveSettings({ displayName: $('#sName').value.trim(), brand, handle, defaultNet: $('#sNet').value, niche: $('#sNiche').value.trim() || DEFAULT_SETTINGS.niche, tone: $('#sTone').value, goal: Math.max(0, +$('#sGoal').value || 0) });
    renderShell(); icons(); toast('Perfil guardado');
  },
  changePw: async () => {
    const e = $('#pwErr'), err = m => { e.textContent = m; e.classList.toggle('hidden', !m); };
    const cur = $('#pwCur').value, n1 = $('#pwNew').value, n2 = $('#pwNew2').value;
    if (!cur || !n1) return err('Completá la contraseña actual y la nueva.');
    if (n1.length < 8 || pwStrength(n1).lvl < 1) return err('La nueva contraseña debe tener al menos 8 caracteres y no ser débil.');
    if (n1 !== n2) return err('Las contraseñas nuevas no coinciden.');
    if (n1 === cur) return err('La nueva contraseña tiene que ser distinta de la actual.');
    if (!await Auth.verify(Auth.record.username, cur)) return err('La contraseña actual no es correcta.');
    try { await Auth.change(n1); Auth.startSession(false); err(''); ['pwCur', 'pwNew', 'pwNew2'].forEach(id => $('#' + id).value = ''); paintStrength('pwStr', ''); toast('Contraseña actualizada', { icon: 'shield-check' }); }
    catch { err('No se pudo guardar la nueva contraseña. Intentá de nuevo.'); }
  },
};
