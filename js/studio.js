'use strict';
/* =========================================================
   Estudio IA: Guiones, Carruseles y Análisis de competencia.
   ========================================================= */
const Studio = { prefill: null };
const FORMAT_LABEL = { reel_corto: 'Reel corto', video_largo: 'Video largo', historia: 'Historia' };
const FORMAT_ICON = { reel_corto: 'smartphone', video_largo: 'monitor-play', historia: 'circle-dashed' };

/** Estado de carga con botón Detener para llamadas largas a la IA. */
function aiProgress(label) {
  return `<div class="card p-6 md:p-8 flex flex-col items-center text-center gap-4" id="aiProg">
    <span class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico('sparkles', 'w-6 h-6 pulse')}</span>
    <div><p class="font-display text-lg font-semibold">${label}</p><p class="text-sm text-muted mt-1" id="aiProgTxt">Pensando… puede tardar entre 10 y 60 segundos.</p></div>
    <div class="w-full max-w-sm h-1.5 rounded-full bg-[#252B38] overflow-hidden"><div class="h-full w-1/3 rounded-full" style="background:var(--gold-grad);animation:slide 1.4s ease-in-out infinite"></div></div>
    <button class="btn-ghost btn-sm" data-action="aiStop">${ico('square', 'w-3.5 h-3.5')}Detener</button></div>
    <style>@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}</style>`;
}
let aiCtl = null;
Actions.aiStop = () => aiCtl?.abort();
const onAiText = ({ text }) => { const t = $('#aiProgTxt'); if (t) t.textContent = `Escribiendo… ${fmtInt(text.length)} caracteres`; };

/* =========================================================
   GUIONES IA
   ========================================================= */
const SC = { current: null, busy: false, q: '', fmt: 'all', form: { topic: '', net: 'auto', goal: 'educar', audience: '', length: 'auto' } };
const GOALS = { educar: 'Educar', entretener: 'Entretener', inspirar: 'Inspirar', vender: 'Vender' };
const LENGTHS = { auto: 'Que la IA sugiera', s: 'Menos de 30 s', m: '30 a 60 s', l: '1 a 3 min', xl: '5 a 10 min', xxl: 'Más de 10 min' };

RENDER.guiones = el => {
  if (Studio.prefill?.script) { SC.form.topic = Studio.prefill.script; SC.current = null; Studio.prefill = null; }
  const F = SC.form;
  el.innerHTML = `${sectionHead('Creador de <span class="gold-text">guiones</span>', 'Guiones con IA', aiBadge())}
    <div class="grid xl:grid-cols-[400px_minmax(0,1fr)] gap-5 items-start">
      <form class="card p-5 md:p-6 flex flex-col gap-5 xl:sticky xl:top-24" data-form="genScript">
        <div><label class="label" for="scTopic">¿De qué trata el video?</label>
          <textarea id="scTopic" class="input resize-y" rows="4" maxlength="600" placeholder="Ej: Cómo armar un fondo de emergencia empezando con poco dinero" data-input="scForm" name="topic">${esc(F.topic)}</textarea></div>
        <div><span class="label">Objetivo</span><div class="flex flex-wrap gap-2">${Object.entries(GOALS).map(([k, l]) => `<button type="button" class="chip" data-action="scGoal" data-v="${k}" aria-pressed="${F.goal === k}">${l}</button>`).join('')}</div></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="scNet">Plataforma</label><select id="scNet" class="input" data-change="scForm" name="net"><option value="auto">Que la IA elija</option>${NETS.map(n => `<option value="${n}" ${F.net === n ? 'selected' : ''}>${NET[n].label}</option>`).join('')}</select></div>
          <div><label class="label" for="scLen">Duración</label><select id="scLen" class="input" data-change="scForm" name="length">${Object.entries(LENGTHS).map(([k, l]) => `<option value="${k}" ${F.length === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div><label class="label" for="scAud">Audiencia (opcional)</label><input id="scAud" class="input" maxlength="160" placeholder="Ej: emprendedores de 25 a 35 años" value="${esc(F.audience)}" data-input="scForm" name="audience"></div>
        <p id="scErr" class="err hidden" role="alert"></p>
        <button class="btn-gold w-full" type="submit" ${SC.busy ? 'disabled' : ''}>${ico('wand-sparkles')}${SC.current ? 'Generar otro guion' : 'Generar guion'}</button>
        <p class="text-[11px] text-dim">Tono: ${esc({ cercano: 'profesional pero cercano', inspirador: 'inspirador', divertido: 'divertido', experto: 'experto' }[App.settings.tone] || 'cercano')}. Cambialo en Configuración.</p>
      </form>
      <div class="min-w-0 flex flex-col gap-5">
        <div id="scResult">${SC.busy ? aiProgress('Escribiendo tu guion') : SC.current ? scriptView(SC.current) : emptyBlock('scroll-text', 'Tu guion aparece aquí', 'Escribí el tema y la IA arma el gancho inicial, los puntos clave y el cierre con llamada a la acción. También te sugiere duración y formato.')}</div>
        ${scriptLibrary()}
      </div>
    </div>`;
};
function scTimes(s) {
  const d = Math.max(10, +s.duracion_segundos || 45), n = (s.puntos || []).length || 1;
  const hookEnd = Math.min(d * .1, d > 120 ? 30 : 4), closeStart = d * .85, step = (closeStart - hookEnd) / n;
  return { hook: [0, hookEnd], points: (s.puntos || []).map((_, i) => [hookEnd + i * step, hookEnd + (i + 1) * step]), close: [closeStart, d] };
}
function scriptView(s) {
  const t = scTimes(s), tc = ([a, b]) => `${fmtDur(a)} – ${fmtDur(b)}`;
  const saved = App.scripts.some(x => x.id === s.id);
  return `<article class="card p-5 md:p-7 rise" id="scriptDoc">
    <div class="flex flex-wrap gap-2">
      <span class="badge badge-soft">${ico(FORMAT_ICON[s.formato] || 'smartphone')}${FORMAT_LABEL[s.formato] || 'Reel corto'}</span>
      <span class="badge badge-muted">${ico('timer')}${s.duracion_texto || fmtDur(s.duracion_segundos || 45)}</span>
      ${NETS.includes(s.plataforma) ? `<span class="badge badge-muted"><span class="w-3.5 h-3.5 inline-flex">${SVG[s.plataforma]}</span>${NET[s.plataforma].label}</span>` : ''}
      ${s.demo ? `<span class="badge badge-muted">${ico('flask-conical')}Plantilla de ejemplo</span>` : ''}
    </div>
    <h2 class="font-display text-2xl md:text-3xl font-semibold mt-4">${esc(s.titulo)}</h2>
    ${s.razon_formato ? `<p class="text-sm text-muted mt-2">${ico('lightbulb', 'w-4 h-4 inline -mt-0.5 text-gold')} ${esc(s.razon_formato)}</p>` : ''}

    <section class="mt-6 rounded-2xl p-5" style="background:linear-gradient(135deg,rgba(229,172,0,.14),rgba(229,172,0,.03));border:1px solid var(--gold-line)">
      <div class="flex items-center justify-between gap-2"><span class="text-[11px] font-extrabold tracking-[.2em] uppercase text-gold">Gancho inicial</span><span class="text-xs text-dim tnum">${tc(t.hook)}</span></div>
      <p class="font-display text-xl md:text-2xl font-semibold mt-2 leading-snug">“${esc(s.gancho)}”</p>
      ${s.gancho_visual ? `<p class="text-sm text-muted mt-2">${ico('video', 'w-4 h-4 inline -mt-0.5')} ${esc(s.gancho_visual)}</p>` : ''}
    </section>

    <section class="mt-5"><h3 class="text-[11px] font-extrabold tracking-[.2em] uppercase text-dim mb-3">Puntos clave</h3>
      <ol class="flex flex-col gap-3">${(s.puntos || []).map((p, i) => `
        <li class="well p-4 flex gap-4"><span class="font-display text-2xl font-bold gold-text w-8 shrink-0">${i + 1}</span>
          <div class="min-w-0 flex-1"><div class="flex items-baseline justify-between gap-2 flex-wrap"><h4 class="font-semibold">${esc(p.titulo)}</h4><span class="text-xs text-dim tnum">${tc(t.points[i])}</span></div>
          <p class="text-[15px] leading-relaxed mt-1.5">${esc(p.guion)}</p>
          ${p.visual ? `<p class="text-xs text-muted mt-2">${ico('camera', 'w-3.5 h-3.5 inline -mt-0.5')} ${esc(p.visual)}</p>` : ''}</div></li>`).join('')}</ol></section>

    <section class="mt-5 rounded-2xl p-5 well">
      <div class="flex items-center justify-between gap-2"><span class="text-[11px] font-extrabold tracking-[.2em] uppercase text-gold">Cierre y llamada a la acción</span><span class="text-xs text-dim tnum">${tc(t.close)}</span></div>
      <p class="text-[15px] leading-relaxed mt-2">${esc(s.cierre)}</p>
      <p class="mt-3 inline-flex items-center gap-2 font-semibold text-gold-light">${ico('megaphone', 'w-4 h-4')}${esc(s.cta)}</p>
    </section>

    ${(s.tips || []).length ? `<section class="mt-5"><h3 class="text-[11px] font-extrabold tracking-[.2em] uppercase text-dim mb-2">Tips de grabación</h3><ul class="flex flex-col gap-1.5 text-sm text-muted">${s.tips.map(x => `<li class="flex gap-2">${ico('check', 'w-4 h-4 text-gold shrink-0 mt-0.5')}${esc(x)}</li>`).join('')}</ul></section>` : ''}
    ${(s.hashtags || []).length ? `<p class="mt-4 text-sm" style="color:var(--sky)">${s.hashtags.map(h => '#' + esc(String(h).replace(/^#/, ''))).join(' ')}</p>` : ''}

    <div class="flex flex-wrap gap-2 mt-6 pt-5 border-t border-white/5">
      <button class="btn-gold" data-action="scSave" ${saved ? 'disabled' : ''}>${ico(saved ? 'check' : 'bookmark-plus', 'w-4 h-4')}${saved ? 'En la biblioteca' : 'Guardar en biblioteca'}</button>
      <button class="btn-ghost" data-action="scCopy">${ico('copy', 'w-4 h-4 text-gold')}Copiar</button>
      <button class="btn-ghost" data-action="scToEditor">${ico('clapperboard', 'w-4 h-4 text-gold')}Llevar al editor</button>
      <button class="btn-ghost" data-action="scToCarousel">${ico('gallery-horizontal-end', 'w-4 h-4 text-gold')}Hacer carrusel</button>
      <button class="btn-ghost" data-action="scToPost">${ico('calendar-plus', 'w-4 h-4 text-gold')}Programar</button>
    </div>
  </article>`;
}
function scriptLibrary() {
  const q = SC.q.toLowerCase();
  const list = App.scripts.filter(s => (SC.fmt === 'all' || s.formato === SC.fmt) && (!q || (s.titulo + ' ' + s.tema).toLowerCase().includes(q))).sort((a, b) => b.createdAt - a.createdAt);
  return `<section class="card p-5 md:p-6" id="scLib">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('library', 'w-5 h-5 text-gold')}Biblioteca de guiones <span class="text-sm text-dim font-normal">(${App.scripts.length})</span></h2>
      <label class="relative w-full sm:w-60"><span class="sr-only">Buscar guiones</span>${ico('search', 'w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-dim')}<input id="scSearch" class="input pl-10 !min-h-[42px]" type="search" placeholder="Buscar…" value="${esc(SC.q)}" data-input="scSearch"></label></div>
    <div class="flex gap-2 mt-3 overflow-x-auto no-scrollbar">${[['all', 'Todos'], ...Object.entries(FORMAT_LABEL)].map(([k, l]) => `<button class="chip !min-h-[34px] !text-xs" data-action="scFmt" data-v="${k}" aria-pressed="${SC.fmt === k}">${l}</button>`).join('')}</div>
    <div class="grid sm:grid-cols-2 gap-3 mt-4">${list.length ? list.map(s => `
      <article class="well p-4 flex flex-col gap-2 ${SC.current?.id === s.id ? 'ring-1 ring-[var(--gold)]' : ''}">
        <div class="flex items-center gap-2 text-[11px]"><span class="badge badge-soft">${ico(FORMAT_ICON[s.formato] || 'smartphone')}${FORMAT_LABEL[s.formato] || 'Reel'}</span><span class="text-dim">${s.duracion_texto || fmtDur(s.duracion_segundos)}</span><span class="text-dim ml-auto">${timeAgo(s.createdAt)}</span></div>
        <h3 class="font-semibold clamp-2">${esc(s.titulo)}</h3><p class="text-xs text-muted clamp-2">“${esc(s.gancho)}”</p>
        <div class="flex gap-1.5 mt-1"><button class="btn-ghost btn-sm flex-1" data-action="scOpen" data-id="${s.id}">${ico('book-open', 'w-3.5 h-3.5 text-gold')}Abrir</button><button class="icon-btn sm danger" data-action="scDelete" data-id="${s.id}" aria-label="Eliminar guion">${ico('trash-2')}</button></div>
      </article>`).join('') : `<p class="text-sm text-muted sm:col-span-2 py-4">${App.scripts.length ? 'No hay guiones con ese filtro.' : 'Los guiones que guardes quedan acá para usarlos después.'}</p>`}</div>
  </section>`;
}
Inputs.scForm = el => { SC.form[el.name] = el.value; };
Changes.scForm = el => { SC.form[el.name] = el.value; };
Actions.scGoal = el => { SC.form.goal = el.dataset.v; $$('[data-action="scGoal"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === SC.form.goal)); };
Inputs.scSearch = debounce(el => { SC.q = el.value; $('#scLib').outerHTML = scriptLibrary(); icons(); const s = $('#scSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 250);
Actions.scFmt = el => { SC.fmt = el.dataset.v; $('#scLib').outerHTML = scriptLibrary(); icons(); };
Actions.scOpen = el => { SC.current = App.scripts.find(s => s.id === el.dataset.id); renderSection(); $('#scResult')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); };
Actions.scDelete = async el => {
  const s = App.scripts.find(x => x.id === el.dataset.id);
  if (!await confirmBox({ title: '¿Eliminar este guion?', text: `“${esc(s.titulo)}” se borrará de tu biblioteca.`, ok: 'Eliminar', danger: true, icon: 'trash-2' })) return;
  App.scripts = App.scripts.filter(x => x.id !== s.id); unpersist('scripts', s.id); if (SC.current?.id === s.id) SC.current = null; renderSection(); toast('Guion eliminado', { icon: 'trash-2' });
};
Actions.scSave = () => { const s = SC.current; if (!s || App.scripts.some(x => x.id === s.id)) return; App.scripts.push(s); persist('scripts', s); renderSection(); toast('Guardado en la biblioteca', { icon: 'bookmark-check' }); };
const scriptText = s => [`${s.titulo}`, `Formato: ${FORMAT_LABEL[s.formato] || ''} · Duración: ${s.duracion_texto || fmtDur(s.duracion_segundos)}`, '', `GANCHO: ${s.gancho}`, '', ...(s.puntos || []).map((p, i) => `${i + 1}. ${p.titulo}\n${p.guion}${p.visual ? `\n[Visual: ${p.visual}]` : ''}`), '', `CIERRE: ${s.cierre}`, `CTA: ${s.cta}`, '', (s.hashtags || []).map(h => '#' + String(h).replace(/^#/, '')).join(' ')].join('\n');
Actions.scCopy = () => copyText(scriptText(SC.current), $('#scriptDoc'));
Actions.scToCarousel = () => { Studio.prefill = { carousel: SC.current.titulo + '. ' + (SC.current.puntos || []).map(p => p.titulo).join('; ') }; go('carruseles'); };
Actions.scToPost = () => { const s = SC.current; openPostEditor(null, null, { title: s.titulo.slice(0, 100), caption: `${s.gancho}\n\n${s.cta}`, hashtags: (s.hashtags || []).map(h => String(h).replace(/^#/, '')).slice(0, 10), format: s.formato === 'video_largo' ? 'yt_long' : s.plataforma === 'tiktok' ? 'tiktok' : s.plataforma === 'youtube' ? 'yt_short' : 'ig_reel', duration: s.duracion_segundos }); };
Actions.scToEditor = () => { Studio.prefill = { editorScript: SC.current }; go('editor'); };

Forms.genScript = async () => {
  track('script_generate');
  const F = SC.form, e = $('#scErr');
  F.topic = $('#scTopic').value.trim();
  if (F.topic.length < 4) { e.textContent = 'Contame el tema del video en al menos unas palabras.'; e.classList.remove('hidden'); return $('#scTopic').focus(); }
  e.classList.add('hidden');
  if (!AI.ok) { SC.current = demoScript(F); renderSection(); toast('Guion de ejemplo con plantilla. La IA real funciona en claude.ai.', { icon: 'flask-conical' }); return; }
  SC.busy = true; renderSection(); aiCtl = new AbortController();
  try {
    const r = await AI.json(`Sos guionista experto en videos para redes sociales. ${brandLine()}
${toneLine()}
Escribí un guion COMPLETO para un video sobre: "${F.topic}".
Objetivo: ${GOALS[F.goal]}. ${F.audience ? 'Audiencia: ' + F.audience + '.' : ''} ${F.net !== 'auto' ? 'Plataforma: ' + NET[F.net].label + '.' : 'Elegí la plataforma ideal.'} ${F.length !== 'auto' ? 'Duración deseada: ' + LENGTHS[F.length] + '.' : 'Sugerí la duración ideal.'}
Reglas: el gancho debe frenar el scroll en los primeros 3 segundos (pregunta, dato sorprendente o promesa concreta). Entre 3 y 6 puntos clave, cada uno con el texto exacto para decir y una sugerencia visual. Cierre con resumen breve y una llamada a la acción clara.
Recomendá el formato que más le conviene entre: reel_corto (hasta 90 s, vertical), video_largo (más de 3 min, horizontal) o historia (15-60 s en secuencia de historias), y explicá por qué en una frase.
Respondé SOLO con este JSON:
{"titulo":"","gancho":"","gancho_visual":"","puntos":[{"titulo":"","guion":"","visual":""}],"cierre":"","cta":"","duracion_segundos":45,"duracion_texto":"40–50 s","formato":"reel_corto","razon_formato":"","plataforma":"instagram","hashtags":[""],"tips":[""]}`,
      { signal: aiCtl.signal, onText: onAiText, cache: false });
    if (!r || !r.gancho || !Array.isArray(r.puntos)) throw { code: 'invalid_json' };
    SC.current = { ...r, id: uid(), tema: F.topic, objetivo: F.goal, createdAt: Date.now(), formato: FORMAT_LABEL[r.formato] ? r.formato : 'reel_corto' };
  } catch (err) { const m = AI.message(err); if (m) toast(m, { icon: 'circle-alert', error: true }); }
  SC.busy = false; aiCtl = null; if (App.section === 'guiones') renderSection();
};
function demoScript(F) {
  const t = F.topic.replace(/\.$/, ''), net = F.net === 'auto' ? 'instagram' : F.net;
  const long = ['xl', 'xxl'].includes(F.length), dur = { s: 25, m: 50, l: 120, xl: 420, xxl: 720, auto: 50 }[F.length];
  return { id: uid(), demo: true, tema: F.topic, createdAt: Date.now(), titulo: t.charAt(0).toUpperCase() + t.slice(1), plataforma: net,
    gancho: `¿Sabías que la mayoría arranca mal con ${t.toLowerCase()}? Te muestro cómo hacerlo bien en ${long ? 'pocos minutos' : 'menos de un minuto'}.`,
    gancho_visual: 'Plano cerrado a cámara, texto grande en pantalla con la pregunta.',
    puntos: [
      { titulo: 'El error más común', guion: `Lo primero que veo siempre es querer hacer todo de golpe. Con ${t.toLowerCase()} pasa lo mismo: empezá por lo básico y hacelo bien.`, visual: 'Cortes rápidos con ejemplos del error.' },
      { titulo: 'El paso que cambia todo', guion: 'Definí un objetivo concreto y medible. No "mejorar", sino cuánto y para cuándo.', visual: 'Pizarra o texto animado con el objetivo.' },
      { titulo: 'Cómo sostenerlo', guion: 'Armate una rutina simple de 10 minutos por día. La constancia le gana a la intensidad.', visual: 'Time-lapse de la rutina.' },
    ],
    cierre: 'Resumiendo: evitá el error común, poné un objetivo claro y sostené una rutina corta.',
    cta: 'Guardá este video y seguime para la parte 2.', duracion_segundos: dur, duracion_texto: fmtDur(dur),
    formato: long ? 'video_largo' : F.length === 's' ? 'historia' : 'reel_corto', razon_formato: long ? 'El tema necesita desarrollo y ejemplos: rinde mejor en formato largo.' : 'Es un tema rápido y accionable: funciona ideal en video vertical corto.',
    hashtags: ['tips', 'aprendeconmigo', net === 'tiktok' ? 'parati' : 'reels'], tips: ['Grabá con luz natural de frente.', 'Mirá a la lente en el gancho.', 'Subtitulá todo: el 80% lo mira sin sonido.'] };
}

/* =========================================================
   CARRUSELES IA
   ========================================================= */
const CSTYLES = {
  mostaza: { name: 'Mostaza Lujo', bg: ['#0E0F13', '#17181E'], fg: '#F4F1EA', muted: '#A9A493', accent: '#E5AC00', title: 'Outfit', tw: 800, frame: true },
  editorial: { name: 'Editorial Crema', bg: ['#F2EBDD', '#EADFCB'], fg: '#1B1A17', muted: '#6B6455', accent: '#A87300', title: 'DM Serif Display', tw: 400 },
  minimal: { name: 'Minimal Blanco', bg: ['#FFFFFF', '#F4F4F4'], fg: '#111111', muted: '#666666', accent: '#E5AC00', title: 'Outfit', tw: 800 },
  bold: { name: 'Bold Mostaza', bg: ['#F2B705', '#E5AC00'], fg: '#111111', muted: '#3A2E00', accent: '#111111', title: 'Archivo Black', tw: 400 },
  noche: { name: 'Neón Nocturno', bg: ['#0B1026', '#2A0E3D'], fg: '#FFFFFF', muted: '#B8B5D6', accent: '#25F4EE', accent2: '#FE2C55', title: 'Outfit', tw: 800 },
};
const CR = { current: null, sel: 0, busy: false, form: { topic: '', count: 7, audience: '', style: 'mostaza' } };
let fontsReady = null;
const loadFonts = () => fontsReady || (fontsReady = Promise.all(['800 60px Outfit', '400 60px "DM Serif Display"', '400 60px "Archivo Black"', '600 30px "Plus Jakarta Sans"', '700 30px "Plus Jakarta Sans"'].map(f => document.fonts?.load(f).catch(() => null))).catch(() => null));

function wrapLines(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
  if (line) lines.push(line); return lines;
}
function fitText(ctx, text, font, maxW, maxLines, start, min) {
  let size = start, lines;
  do { ctx.font = font(size); lines = wrapLines(ctx, text, maxW); if (lines.length <= maxLines) break; size -= 4; } while (size > min);
  ctx.font = font(size); lines = wrapLines(ctx, text, maxW);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return { size, lines };
}
/** Dibuja una filmina 1080x1350 en el canvas (escalada al tamaño del canvas). */
function drawSlide(cv, slide, i, total, styleKey) {
  const st = CSTYLES[styleKey] || CSTYLES.mostaza, ctx = cv.getContext('2d'), s = cv.width / 1080;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const W = 1080, H = 1350, P = 96;
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, st.bg[0]); g.addColorStop(1, st.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (styleKey === 'noche') { const r = ctx.createRadialGradient(W * .85, H * .1, 10, W * .85, H * .1, 600); r.addColorStop(0, 'rgba(37,244,238,.25)'); r.addColorStop(1, 'rgba(37,244,238,0)'); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H); }
  if (st.frame) { ctx.strokeStyle = 'rgba(229,172,0,.45)'; ctx.lineWidth = 3; ctx.strokeRect(40, 40, W - 80, H - 80); }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // Encabezado: contador + marca
  ctx.font = '700 30px "Plus Jakarta Sans", sans-serif'; ctx.fillStyle = st.accent;
  ctx.fillText(`${pad(i + 1)} / ${pad(total)}`, P, 140);
  ctx.textAlign = 'right'; ctx.fillStyle = st.muted; ctx.fillText(App.settings.handle || '@himproductmedia', W - P, 140); ctx.textAlign = 'left';
  const tFont = sz => `${st.tw} ${sz}px "${st.title}", sans-serif`, bFont = sz => `500 ${sz}px "Plus Jakarta Sans", sans-serif`;
  const maxW = W - P * 2;
  if (slide.tipo === 'gancho') {
    const { size, lines } = fitText(ctx, slide.titulo, tFont, maxW, 6, 112, 64);
    const lh = size * 1.08, blockH = lines.length * lh; let y = H * .46 - blockH / 2 + size;
    ctx.fillStyle = st.accent; ctx.fillRect(P, y - size - 50, 120, 10);
    ctx.fillStyle = st.fg; lines.forEach(l => { ctx.font = tFont(size); ctx.fillText(l, P, y); y += lh; });
    if (slide.texto) { const b = fitText(ctx, slide.texto, bFont, maxW, 3, 40, 30); ctx.fillStyle = st.muted; y += 30; b.lines.forEach(l => { ctx.font = bFont(b.size); ctx.fillText(l, P, y); y += b.size * 1.4; }); }
  } else if (slide.tipo === 'cierre') {
    const t = fitText(ctx, slide.titulo, tFont, maxW, 4, 92, 56); let y = 420;
    ctx.fillStyle = st.fg; t.lines.forEach(l => { ctx.font = tFont(t.size); ctx.fillText(l, P, y); y += t.size * 1.1; });
    const b = fitText(ctx, slide.texto, bFont, maxW, 6, 42, 30); y += 40; ctx.fillStyle = st.muted;
    b.lines.forEach(l => { ctx.font = bFont(b.size); ctx.fillText(l, P, y); y += b.size * 1.45; });
    const cta = slide.cta || 'Guardalo y compartilo';
    ctx.font = '800 38px "Plus Jakarta Sans", sans-serif'; const cw = Math.min(maxW, ctx.measureText(cta).width + 90);
    const cy = Math.max(y + 60, 1010);
    ctx.fillStyle = st.accent; roundRect(ctx, P, cy, cw, 104, 52); ctx.fill();
    ctx.fillStyle = styleKey === 'bold' ? '#F2B705' : (styleKey === 'minimal' || styleKey === 'editorial' ? '#FFFFFF' : '#111111');
    ctx.fillText(cta, P + 45, cy + 66, maxW - 90);
  } else {
    ctx.font = `${st.tw} 200px "${st.title}", sans-serif`; ctx.fillStyle = st.accent; ctx.globalAlpha = .9;
    ctx.fillText(String(i), P - 8, 400); ctx.globalAlpha = 1;
    const t = fitText(ctx, slide.titulo, tFont, maxW, 3, 76, 50); let y = 520;
    ctx.fillStyle = st.fg; t.lines.forEach(l => { ctx.font = tFont(t.size); ctx.fillText(l, P, y); y += t.size * 1.12; });
    const b = fitText(ctx, slide.texto, bFont, maxW, 9, 44, 30); y += 36; ctx.fillStyle = st.muted;
    b.lines.forEach(l => { ctx.font = bFont(b.size); ctx.fillText(l, P, y); y += b.size * 1.5; });
  }
  // Pie: progreso + "deslizá"
  const dotsW = total * 26; let dx = P;
  for (let k = 0; k < total; k++) { ctx.fillStyle = k === i ? st.accent : (st.fg + '33'); roundRect(ctx, dx, H - 130, k === i ? 40 : 14, 14, 7); ctx.fill(); dx += k === i ? 52 : 26; }
  if (i < total - 1) { ctx.textAlign = 'right'; ctx.font = '700 30px "Plus Jakarta Sans", sans-serif'; ctx.fillStyle = st.accent; ctx.fillText('Deslizá →', W - P, H - 112); ctx.textAlign = 'left'; }
  void dotsW;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

RENDER.carruseles = el => {
  if (Studio.prefill?.carousel) { CR.form.topic = Studio.prefill.carousel; CR.current = null; Studio.prefill = null; }
  const F = CR.form, C = CR.current;
  el.innerHTML = `${sectionHead('Creador de <span class="gold-text">carruseles</span>', 'Carruseles con IA', aiBadge())}
    <div class="grid xl:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
      <form class="card p-5 md:p-6 flex flex-col gap-5" data-form="genCarousel">
        <div><label class="label" for="crTopic">Tema del carrusel</label><textarea id="crTopic" class="input resize-y" rows="3" maxlength="500" placeholder="Ej: 7 errores que hacen que tu marca personal no crezca" data-input="crForm" name="topic">${esc(F.topic)}</textarea></div>
        <div><label class="label" for="crCount">Cantidad de filminas: <span class="text-gold-light" id="crCountL">${F.count}</span></label><input id="crCount" type="range" min="5" max="10" value="${F.count}" data-input="crCount"></div>
        <div><label class="label" for="crAud">Audiencia u objetivo (opcional)</label><input id="crAud" class="input" maxlength="160" placeholder="Ej: emprendedoras que recién arrancan" value="${esc(F.audience)}" data-input="crForm" name="audience"></div>
        <div><span class="label">Estilo visual</span><div class="grid grid-cols-2 gap-2">${Object.entries(CSTYLES).map(([k, s]) => `
          <button type="button" data-action="crStyle" data-v="${k}" aria-pressed="${F.style === k}" class="rounded-2xl p-2 text-left border transition" style="border-color:${F.style === k ? 'var(--gold)' : 'var(--line)'};${F.style === k ? 'box-shadow:0 0 0 2px rgba(229,172,0,.3)' : ''}">
            <span class="block rounded-xl h-14 relative overflow-hidden" style="background:linear-gradient(135deg,${s.bg[0]},${s.bg[1]})"><span class="absolute left-2.5 top-2.5 text-[15px] leading-none" style="color:${s.fg};font-family:'${s.title}';font-weight:${s.tw}">Aa</span><span class="absolute left-2.5 bottom-2.5 w-8 h-1.5 rounded" style="background:${s.accent}"></span></span>
            <span class="block text-xs font-semibold mt-1.5 px-0.5">${s.name}</span></button>`).join('')}</div></div>
        <p id="crErr" class="err hidden" role="alert"></p>
        <button class="btn-gold w-full" type="submit" ${CR.busy ? 'disabled' : ''}>${ico('wand-sparkles')}${C ? 'Generar otro carrusel' : 'Generar carrusel'}</button>
      </form>
      <div class="min-w-0 flex flex-col gap-5">
        <div id="crResult">${CR.busy ? aiProgress('Armando tus filminas') : C ? carouselEditor() : emptyBlock('gallery-horizontal-end', 'Tu carrusel aparece aquí', 'La IA propone el gancho de la primera filmina, el desarrollo en las del medio y el cierre con llamada a la acción en la última. Después editás lo que quieras y descargás todo.')}</div>
        ${carouselLibrary()}
      </div>
    </div>`;
  if (C && !CR.busy) paintCarousel();
};
function carouselEditor() {
  const C = CR.current, s = C.slides[CR.sel], saved = App.carousels.some(x => x.id === C.id);
  return `<article class="card p-4 md:p-6 rise">
    <div class="flex flex-wrap items-center gap-2 justify-between"><div class="min-w-0"><h2 class="font-display text-xl font-semibold truncate">${esc(C.titulo)}</h2><p class="text-xs text-muted mt-0.5">${C.slides.length} filminas · ${CSTYLES[C.style].name}${C.demo ? ' · plantilla de ejemplo' : ''}</p></div>
      <div class="seg" role="group" aria-label="Cambiar estilo">${Object.entries(CSTYLES).map(([k, st]) => `<button data-action="crRestyle" data-v="${k}" aria-pressed="${C.style === k}" title="${st.name}"><span class="w-4 h-4 rounded-full" style="background:linear-gradient(135deg,${st.bg[0]},${st.accent})"></span></button>`).join('')}</div></div>
    <div class="grid 2xl:grid-cols-[minmax(0,1fr)_320px] gap-5 mt-5">
      <div class="min-w-0">
        <div class="relative mx-auto max-w-[460px]">
          <canvas id="crMain" width="1080" height="1350" class="w-full h-auto rounded-2xl shadow-2xl" style="aspect-ratio:4/5;box-shadow:0 20px 60px rgba(0,0,0,.5)" role="img" aria-label="Vista previa de la filmina ${CR.sel + 1}"></canvas>
          <button class="icon-btn absolute left-2 top-1/2 -translate-y-1/2 glass" data-action="crNav" data-d="-1" aria-label="Filmina anterior" ${CR.sel ? '' : 'disabled'}>${ico('chevron-left', 'w-5 h-5')}</button>
          <button class="icon-btn absolute right-2 top-1/2 -translate-y-1/2 glass" data-action="crNav" data-d="1" aria-label="Filmina siguiente" ${CR.sel < C.slides.length - 1 ? '' : 'disabled'}>${ico('chevron-right', 'w-5 h-5')}</button>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-2 mt-4" role="listbox" aria-label="Filminas">${C.slides.map((sl, i) => `<button role="option" aria-selected="${i === CR.sel}" data-action="crSel" data-i="${i}" class="shrink-0 w-[74px] rounded-xl overflow-hidden border-2 transition" style="border-color:${i === CR.sel ? 'var(--gold)' : 'transparent'}"><canvas data-thumb="${i}" width="216" height="270" class="w-full h-auto block"></canvas></button>`).join('')}</div>
      </div>
      <form class="flex flex-col gap-4" data-form="noop" onsubmit="return false">
        <div class="flex items-center gap-2"><span class="badge ${s.tipo === 'gancho' ? 'badge-soft' : s.tipo === 'cierre' ? 'badge-up' : 'badge-muted'}">${{ gancho: 'Gancho', desarrollo: 'Desarrollo', cierre: 'Cierre + CTA' }[s.tipo]}</span><span class="text-xs text-dim">Filmina ${CR.sel + 1} de ${C.slides.length}</span></div>
        <div><label class="label" for="crT">Título</label><textarea id="crT" class="input resize-none" rows="2" maxlength="140" data-input="crEdit" name="titulo">${esc(s.titulo)}</textarea></div>
        <div><label class="label" for="crX">Texto</label><textarea id="crX" class="input resize-y" rows="5" maxlength="420" data-input="crEdit" name="texto">${esc(s.texto)}</textarea></div>
        ${s.tipo === 'cierre' ? `<div><label class="label" for="crC">Llamada a la acción</label><input id="crC" class="input" maxlength="60" data-input="crEdit" name="cta" value="${esc(s.cta || '')}"></div>` : ''}
        <div class="flex flex-wrap gap-1.5">
          <button type="button" class="icon-btn sm" data-action="crMove" data-d="-1" aria-label="Mover a la izquierda" ${CR.sel > 1 && s.tipo === 'desarrollo' ? '' : 'disabled'}>${ico('arrow-left')}</button>
          <button type="button" class="icon-btn sm" data-action="crMove" data-d="1" aria-label="Mover a la derecha" ${s.tipo === 'desarrollo' && CR.sel < C.slides.length - 2 ? '' : 'disabled'}>${ico('arrow-right')}</button>
          <button type="button" class="btn-ghost btn-sm" data-action="crAdd" ${C.slides.length >= 12 ? 'disabled' : ''}>${ico('plus', 'w-3.5 h-3.5')}Filmina</button>
          <button type="button" class="icon-btn sm danger" data-action="crDel" aria-label="Eliminar filmina" ${s.tipo === 'desarrollo' && C.slides.length > 3 ? '' : 'disabled'}>${ico('trash-2')}</button>
        </div>
        ${C.caption ? `<div class="well p-3"><div class="flex items-center justify-between"><span class="text-[11px] uppercase tracking-wider text-dim font-bold">Caption sugerido</span><button type="button" class="icon-btn sm" data-action="crCopyCap" aria-label="Copiar caption">${ico('copy')}</button></div><p id="crCap" class="text-sm text-muted mt-1 whitespace-pre-line">${esc(C.caption)}${(C.hashtags || []).length ? '\n' + C.hashtags.map(h => '#' + esc(String(h).replace(/^#/, ''))).join(' ') : ''}</p></div>` : ''}
      </form>
    </div>
    <div class="flex flex-wrap gap-2 mt-6 pt-5 border-t border-white/5">
      <button class="btn-gold" data-action="crZip">${ico('download', 'w-4 h-4')}Descargar todo (ZIP)</button>
      <button class="btn-ghost" data-action="crPng">${ico('image-down', 'w-4 h-4 text-gold')}Esta filmina (PNG)</button>
      <button class="btn-ghost" data-action="crSave">${ico(saved ? 'check' : 'bookmark-plus', 'w-4 h-4 text-gold')}${saved ? 'Guardar cambios' : 'Guardar en biblioteca'}</button>
    </div>
  </article>`;
}
async function paintCarousel() {
  await loadFonts();
  const C = CR.current; if (!C) return;
  const main = $('#crMain'); if (main) drawSlide(main, C.slides[CR.sel], CR.sel, C.slides.length, C.style);
  $$('[data-thumb]').forEach(cv => drawSlide(cv, C.slides[+cv.dataset.thumb], +cv.dataset.thumb, C.slides.length, C.style));
}
function carouselLibrary() {
  return `<section class="card p-5 md:p-6"><h2 class="font-display text-lg font-semibold flex items-center gap-2">${ico('library', 'w-5 h-5 text-gold')}Carruseles guardados <span class="text-sm text-dim font-normal">(${App.carousels.length})</span></h2>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">${App.carousels.length ? App.carousels.slice().sort((a, b) => b.createdAt - a.createdAt).map(c => `
      <article class="well p-4 flex flex-col gap-2"><div class="flex items-center gap-2"><span class="w-6 h-6 rounded-lg" style="background:linear-gradient(135deg,${CSTYLES[c.style]?.bg[0]},${CSTYLES[c.style]?.accent})"></span><span class="text-[11px] text-dim">${c.slides.length} filminas · ${timeAgo(c.createdAt)}</span></div>
        <h3 class="font-semibold clamp-2 text-sm">${esc(c.titulo)}</h3>
        <div class="flex gap-1.5 mt-auto"><button class="btn-ghost btn-sm flex-1" data-action="crOpen" data-id="${c.id}">${ico('pencil', 'w-3.5 h-3.5 text-gold')}Editar</button><button class="icon-btn sm danger" data-action="crDelete" data-id="${c.id}" aria-label="Eliminar carrusel">${ico('trash-2')}</button></div></article>`).join('')
      : '<p class="text-sm text-muted sm:col-span-3 py-3">Los carruseles que guardes quedan acá para editarlos o descargarlos después.</p>'}</div></section>`;
}
Inputs.crForm = el => { CR.form[el.name] = el.value; };
Inputs.crCount = el => { CR.form.count = +el.value; $('#crCountL').textContent = el.value; };
Actions.crStyle = el => { CR.form.style = el.dataset.v; renderSection(); };
Actions.crRestyle = el => { CR.current.style = el.dataset.v; CR.form.style = el.dataset.v; $('#crResult').innerHTML = carouselEditor(); icons(); paintCarousel(); };
Actions.crSel = el => { CR.sel = +el.dataset.i; $('#crResult').innerHTML = carouselEditor(); icons(); paintCarousel(); };
Actions.crNav = el => { CR.sel = clamp(CR.sel + +el.dataset.d, 0, CR.current.slides.length - 1); $('#crResult').innerHTML = carouselEditor(); icons(); paintCarousel(); };
Inputs.crEdit = el => { CR.current.slides[CR.sel][el.name] = el.value; paintCarousel(); };
Actions.crMove = el => { const a = CR.current.slides, i = CR.sel, j = i + +el.dataset.d; [a[i], a[j]] = [a[j], a[i]]; CR.sel = j; Actions.crSel({ dataset: { i: j } }); };
Actions.crAdd = () => { const a = CR.current.slides, at = Math.min(Math.max(CR.sel + 1, 1), a.length - 1); a.splice(at, 0, { tipo: 'desarrollo', titulo: 'Nuevo punto', texto: 'Escribí acá el desarrollo de esta filmina.' }); Actions.crSel({ dataset: { i: at } }); };
Actions.crDel = () => { CR.current.slides.splice(CR.sel, 1); Actions.crSel({ dataset: { i: Math.max(1, CR.sel - 1) } }); };
Actions.crCopyCap = () => copyText($('#crCap').textContent, $('#crCap'));
Actions.crSave = () => { const C = CR.current; C.updatedAt = Date.now(); if (!App.carousels.some(x => x.id === C.id)) App.carousels.push(C); persist('carousels', C); renderSection(); toast('Carrusel guardado', { icon: 'bookmark-check' }); };
Actions.crOpen = el => { CR.current = JSON.parse(JSON.stringify(App.carousels.find(c => c.id === el.dataset.id))); CR.sel = 0; renderSection(); $('#crResult').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); };
Actions.crDelete = async el => { const c = App.carousels.find(x => x.id === el.dataset.id); if (!await confirmBox({ title: '¿Eliminar este carrusel?', text: `“${esc(c.titulo)}” se borrará.`, ok: 'Eliminar', danger: true, icon: 'trash-2' })) return; App.carousels = App.carousels.filter(x => x.id !== c.id); unpersist('carousels', c.id); renderSection(); toast('Carrusel eliminado', { icon: 'trash-2' }); };
const slideBlob = async i => { await loadFonts(); const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; drawSlide(cv, CR.current.slides[i], i, CR.current.slides.length, CR.current.style); return new Promise(r => cv.toBlob(r, 'image/png')); };
const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'carrusel';
Actions.crPng = async () => saveFile(`${slug(CR.current.titulo)}-${pad(CR.sel + 1)}.png`, await slideBlob(CR.sel));
Actions.crZip = async () => {
  if (!window.JSZip) { toast('No se pudo cargar el compresor. Descargá las filminas de a una.', { icon: 'circle-alert', error: true }); return; }
  toast('Preparando el ZIP…', { icon: 'loader-circle' });
  const zip = new JSZip(), C = CR.current;
  for (let i = 0; i < C.slides.length; i++) zip.file(`${pad(i + 1)}-${slug(C.slides[i].titulo)}.png`, await slideBlob(i));
  zip.file('caption.txt', `${C.caption || ''}\n\n${(C.hashtags || []).map(h => '#' + String(h).replace(/^#/, '')).join(' ')}\n\n` + C.slides.map((s, i) => `${i + 1}. ${s.titulo}\n${s.texto}${s.cta ? '\nCTA: ' + s.cta : ''}`).join('\n\n'));
  saveFile(`${slug(C.titulo)}.zip`, await zip.generateAsync({ type: 'blob' }));
};
Forms.genCarousel = async () => {
  track('carousel_generate');
  const F = CR.form, e = $('#crErr'); F.topic = $('#crTopic').value.trim();
  if (F.topic.length < 4) { e.textContent = 'Escribí el tema del carrusel.'; e.classList.remove('hidden'); return $('#crTopic').focus(); }
  e.classList.add('hidden');
  if (!AI.ok) { CR.current = demoCarousel(F); CR.sel = 0; renderSection(); toast('Carrusel de ejemplo con plantilla. La IA real funciona en claude.ai.', { icon: 'flask-conical' }); return; }
  CR.busy = true; renderSection(); aiCtl = new AbortController();
  try {
    const r = await AI.json(`Sos experto en carruseles de Instagram y LinkedIn. ${brandLine()} ${toneLine()}
Creá un carrusel de exactamente ${F.count} filminas sobre: "${F.topic}". ${F.audience ? 'Audiencia/objetivo: ' + F.audience + '.' : ''}
Filmina 1 = gancho que obliga a deslizar (título de máximo 12 palabras, texto opcional de 1 frase).
Filminas 2 a ${F.count - 1} = desarrollo: un punto por filmina, título corto (máx. 8 palabras) y texto de 2 a 3 frases cortas, útil y concreto.
Filmina ${F.count} = cierre: título de resumen, texto breve y una llamada a la acción (máx. 5 palabras) en "cta".
Sin emojis. Respondé SOLO con este JSON:
{"titulo":"","slides":[{"tipo":"gancho","titulo":"","texto":""},{"tipo":"desarrollo","titulo":"","texto":""},{"tipo":"cierre","titulo":"","texto":"","cta":""}],"caption":"","hashtags":[""]}`,
      { signal: aiCtl.signal, onText: onAiText, cache: false });
    if (!r || !Array.isArray(r.slides) || r.slides.length < 3) throw { code: 'invalid_json' };
    const slides = r.slides.map((s, i, a) => ({ tipo: i === 0 ? 'gancho' : i === a.length - 1 ? 'cierre' : 'desarrollo', titulo: String(s.titulo || '').slice(0, 140), texto: String(s.texto || '').slice(0, 420), cta: s.cta ? String(s.cta).slice(0, 60) : undefined }));
    CR.current = { id: uid(), titulo: r.titulo || F.topic, tema: F.topic, style: F.style, slides, caption: r.caption || '', hashtags: r.hashtags || [], createdAt: Date.now() }; CR.sel = 0;
  } catch (err) { const m = AI.message(err); if (m) toast(m, { icon: 'circle-alert', error: true }); }
  CR.busy = false; aiCtl = null; if (App.section === 'carruseles') renderSection();
};
function demoCarousel(F) {
  const n = F.count, t = F.topic;
  const mids = ['Empezá por el porqué', 'Elegí un solo objetivo', 'Hacelo simple', 'Medí lo que importa', 'Pedí feedback real', 'Repetí lo que funciona', 'Sacá lo que no suma', 'Documentá el proceso'];
  return { id: uid(), demo: true, titulo: t, tema: t, style: F.style, createdAt: Date.now(), caption: `Guardá este carrusel para cuando lo necesites. ¿Cuál de los puntos te cuesta más?`, hashtags: ['tips', 'marcapersonal', 'contenido'],
    slides: [{ tipo: 'gancho', titulo: t, texto: 'Deslizá y aplicalo hoy mismo.' },
      ...mids.slice(0, n - 2).map(m => ({ tipo: 'desarrollo', titulo: m, texto: 'Explicá este punto en dos o tres frases cortas con un ejemplo concreto de tu experiencia.' })),
      { tipo: 'cierre', titulo: 'En resumen', texto: 'Aplicá un punto por semana y vas a notar la diferencia en un mes.', cta: 'Guardalo y compartilo' }] };
}

/* =========================================================
   ANÁLISIS DE COMPETENCIA
   ========================================================= */
const CP = { filter: 'all', q: '', busy: null };
function parseSocialUrl(raw) {
  let u; try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, ''), parts = u.pathname.split('/').filter(Boolean);
  if (/instagram\.com$/.test(h)) {
    const t = { reel: 'Reel', reels: 'Reel', p: 'Post', stories: 'Historia', tv: 'Video' }[parts[0]];
    const handle = parts[0] === 'stories' ? parts[1] : t ? null : parts[0];
    return { platform: 'instagram', type: t || 'Perfil', handle: handle ? '@' + handle : null, id: t ? parts[parts[0] === 'stories' ? 2 : 1] : null };
  }
  if (/tiktok\.com$/.test(h)) {
    const handle = parts.find(p => p.startsWith('@'));
    return { platform: 'tiktok', type: parts.includes('video') ? 'Video' : parts.includes('photo') ? 'Carrusel' : 'Perfil', handle: handle || null, id: parts[parts.indexOf('video') + 1] || null };
  }
  if (/youtube\.com$|youtu\.be$/.test(h)) {
    if (h === 'youtu.be') return { platform: 'youtube', type: 'Video', handle: null, id: parts[0] };
    const handle = parts.find(p => p.startsWith('@'));
    return { platform: 'youtube', type: parts[0] === 'shorts' ? 'Short' : u.searchParams.get('v') ? 'Video' : 'Canal', handle: handle || null, id: parts[0] === 'shorts' ? parts[1] : u.searchParams.get('v') };
  }
  return null;
}
RENDER.competencia = el => {
  const items = App.competitors.filter(c => c.kind !== 'movimientos');
  const q = CP.q.toLowerCase();
  const list = items.filter(c => (CP.filter === 'all' || c.platform === CP.filter) && (!q || (c.name + c.handle + c.who).toLowerCase().includes(q))).sort((a, b) => b.createdAt - a.createdAt);
  const handles = [...new Set(items.filter(c => c.handle).map(c => c.platform + '|' + c.handle))];
  el.innerHTML = `${sectionHead('Análisis de <span class="gold-text">competencia</span>', 'Inteligencia competitiva', aiBadge())}
    <form class="card p-5 md:p-6" data-form="addComp">
      <div class="grid md:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
        <div><label class="label" for="cpUrl">Link del reel, historia, post o perfil</label><input id="cpUrl" class="input" inputmode="url" placeholder="https://www.instagram.com/reel/…" data-input="cpUrl" autocomplete="off"><p id="cpDetect" class="help">Instagram, TikTok o YouTube.</p></div>
        <div><label class="label" for="cpName">Nombre</label><input id="cpName" class="input" maxlength="60" placeholder="Ej: Marca X"></div>
        <div><label class="label" for="cpWho">¿Quién es?</label><input id="cpWho" class="input" maxlength="120" placeholder="Ej: competidor directo en fitness"></div>
        <button class="btn-gold mb-[22px] md:mb-[26px]" type="submit">${ico('plus')}Guardar</button>
      </div>
      <p id="cpErr" class="err hidden" role="alert"></p>
    </form>
    <div class="well p-4 mt-4 text-sm text-muted flex gap-3">${ico('scale', 'w-5 h-5 text-gold shrink-0')}<p>La app no descarga contenido de otras cuentas: las plataformas lo prohíben y ese material tiene derechos de autor. Guardás el link, pegás el texto o las métricas que ves y subís capturas propias. La IA extrae la estrategia (gancho, estructura, formato, CTA, horarios) para que la adaptes a tu marca, no para copiarla literalmente.</p></div>

    ${handles.length ? `<section class="mt-6"><h2 class="text-[11px] tracking-[.22em] uppercase text-dim font-bold mb-3">Competidores seguidos</h2><div class="flex gap-3 overflow-x-auto pb-2">${handles.map(k => { const [pl, hd] = k.split('|'), n = items.filter(c => c.platform === pl && c.handle === hd).length, mv = App.competitors.find(c => c.kind === 'movimientos' && c.key === k);
      return `<div class="card p-4 shrink-0 w-64 flex flex-col gap-3"><div class="flex items-center gap-2.5">${netDot(pl, 32)}<div class="min-w-0"><div class="font-semibold truncate">${esc(hd)}</div><div class="text-[11px] text-dim">${n} contenido${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''}</div></div></div>
        <div class="flex gap-1.5"><button class="btn-ghost btn-sm flex-1" data-action="cpMoves" data-k="${esc(k)}" ${CP.busy ? 'disabled' : ''}>${ico(CP.busy === k ? 'loader-circle' : 'activity', 'w-3.5 h-3.5 text-gold' + (CP.busy === k ? ' spin' : ''))}${mv ? 'Ver movimientos' : 'Analizar movimientos'}</button></div></div>`; }).join('')}</div></section>` : ''}

    <div class="flex flex-wrap items-center justify-between gap-3 mt-6">
      <div class="flex gap-2 overflow-x-auto no-scrollbar">${[['all', 'Todas'], ...NETS.map(n => [n, NET[n].label])].map(([k, l]) => `<button class="chip" data-action="cpFilter" data-v="${k}" aria-pressed="${CP.filter === k}">${k === 'all' ? '' : `<span class="w-3.5 h-3.5 inline-flex">${SVG[k]}</span>`}${l}<span class="count">${k === 'all' ? items.length : items.filter(c => c.platform === k).length}</span></button>`).join('')}</div>
      <label class="relative w-full md:w-64"><span class="sr-only">Buscar competidores</span>${ico('search', 'w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-dim')}<input id="cpSearch" class="input pl-10" type="search" placeholder="Buscar…" value="${esc(CP.q)}" data-input="cpSearch"></label>
    </div>
    <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">${list.length ? list.map(compCard).join('') : `<div class="sm:col-span-2 xl:col-span-3">${emptyBlock('radar', 'Todavía no analizaste competidores', 'Pegá el link de un reel, historia, post o perfil para guardarlo en una tarjeta y analizarlo.')}</div>`}</div>`;
};
function compCard(c) {
  const a = c.analysis, lvl = a?.nivel_rendimiento;
  return `<article class="card card-hover overflow-hidden flex flex-col rise">
    <div class="h-2" style="background:${NET[c.platform].grad}"></div>
    <div class="p-5 flex flex-col gap-3 flex-1">
      <div class="flex items-center gap-3"><span class="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-bold text-lg shrink-0" style="background:${NET[c.platform].grad};color:#fff">${esc((c.name || c.handle || '?').replace('@', '')[0]?.toUpperCase() || '?')}</span>
        <div class="min-w-0 flex-1"><h3 class="font-semibold truncate">${esc(c.name || c.handle || 'Sin nombre')}</h3><p class="text-xs text-gold truncate">${esc(c.handle || 'Usuario no detectado')}</p></div>${netDot(c.platform, 26)}</div>
      <div class="flex flex-wrap gap-1.5"><span class="badge badge-muted">${esc(c.type)}</span><span class="badge badge-muted">${NET[c.platform].label}</span>
        ${a ? `<span class="badge ${lvl === 'alto' ? 'badge-up' : lvl === 'bajo' ? 'badge-down' : 'badge-soft'}">${ico('chart-no-axes-column')}Rendimiento ${esc(lvl || 'medio')}${a.puntaje ? ' · ' + Math.round(a.puntaje) : ''}</span>` : '<span class="badge badge-draft">Sin analizar</span>'}</div>
      ${c.who ? `<p class="text-sm text-muted">${esc(c.who)}</p>` : ''}
      ${a?.resumen ? `<p class="text-sm clamp-3">${esc(a.resumen)}</p>` : ''}
      <p class="text-[11px] text-dim mt-auto">Guardado ${timeAgo(c.createdAt)}</p>
      <div class="flex gap-1.5 pt-3 border-t border-white/5">
        <button class="btn-gold btn-sm flex-1" data-action="cpOpen" data-id="${c.id}">${ico(a ? 'file-chart-column' : 'scan-search', 'w-3.5 h-3.5')}${a ? 'Ver análisis' : 'Analizar'}</button>
        <a class="icon-btn sm" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir en ${NET[c.platform].label}">${ico('external-link')}</a>
        <button class="icon-btn sm danger" data-action="cpDelete" data-id="${c.id}" aria-label="Eliminar">${ico('trash-2')}</button>
      </div>
    </div></article>`;
}
Inputs.cpUrl = el => { const p = parseSocialUrl(el.value.trim()), d = $('#cpDetect'); d.innerHTML = !el.value.trim() ? 'Instagram, TikTok o YouTube.' : p ? `${ico('check', 'w-3.5 h-3.5 inline text-up')} ${NET[p.platform].label} · ${p.type}${p.handle ? ' · ' + esc(p.handle) : ''}` : '<span class="text-down">No reconozco ese link. Usá un link de Instagram, TikTok o YouTube.</span>'; icons(); };
Inputs.cpSearch = debounce(el => { CP.q = el.value; renderSection(); const s = $('#cpSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 250);
Actions.cpFilter = el => { CP.filter = el.dataset.v; renderSection(); };
Forms.addComp = () => {
  const url = $('#cpUrl').value.trim(), p = parseSocialUrl(url), e = $('#cpErr');
  if (!p) { e.textContent = 'Pegá un link válido de Instagram, TikTok o YouTube.'; e.classList.remove('hidden'); return $('#cpUrl').focus(); }
  const full = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  const c = { id: uid(), url: full, ...p, name: $('#cpName').value.trim() || (p.handle || '').replace('@', '') || NET[p.platform].label, who: $('#cpWho').value.trim(), data: {}, analysis: null, createdAt: Date.now() };
  App.competitors.push(c); persist('competitors', c); renderSection(); toast('Competidor guardado', { icon: 'radar', action: 'Analizar', onAction: () => openComp(c.id) });
};
Actions.cpDelete = async el => { const c = App.competitors.find(x => x.id === el.dataset.id); if (!await confirmBox({ title: '¿Eliminar esta tarjeta?', text: `Se borrará “${esc(c.name)}” y su análisis.`, ok: 'Eliminar', danger: true, icon: 'trash-2' })) return; App.competitors = App.competitors.filter(x => x.id !== c.id); unpersist('competitors', c.id); renderSection(); };
Actions.cpOpen = el => openComp(el.dataset.id);
let cpImages = [];
function openComp(id, tab) {
  const c = App.competitors.find(x => x.id === id); if (!c) return;
  const D = c.data || {}; cpImages = [];
  const t = tab || (c.analysis ? 'analisis' : 'datos');
  const num = (k, l) => `<div><label class="label" for="cd_${k}">${l}</label><input id="cd_${k}" class="input" type="number" min="0" inputmode="numeric" value="${D[k] ?? ''}" placeholder="—"></div>`;
  Modal.open(`${modalHead(esc(c.name), `${NET[c.platform].label} · ${esc(c.type)}${c.handle ? ' · ' + esc(c.handle) : ''}`, netDot(c.platform, 36))}
    <div class="px-5 md:px-7 pt-4"><div class="seg" role="tablist"><button data-action="cpTab" data-id="${c.id}" data-t="datos" aria-pressed="${t === 'datos'}">${ico('clipboard-list')}Datos del contenido</button><button data-action="cpTab" data-id="${c.id}" data-t="analisis" aria-pressed="${t === 'analisis'}">${ico('scan-search')}Análisis</button></div></div>
    ${t === 'datos' ? `<form class="p-5 md:p-7 flex flex-col gap-5" data-form="cpAnalyze" data-id="${c.id}">
      <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" class="well p-3 flex items-center gap-3 text-sm hover:border-[var(--gold-line)]">${ico('external-link', 'w-4 h-4 text-gold shrink-0')}<span class="truncate">${esc(c.url)}</span></a>
      <div><label class="label" for="cd_caption">Texto del contenido</label><textarea id="cd_caption" class="input resize-y" rows="5" maxlength="5000" placeholder="Pegá el caption, lo que dicen en el video (transcripción) o el texto de las filminas…">${esc(D.caption || '')}</textarea></div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">${num('views', 'Vistas')}${num('likes', 'Me gusta')}${num('comments', 'Comentarios')}${num('shares', 'Compartidos')}${num('followers', 'Seguidores de la cuenta')}<div><label class="label" for="cd_date">Fecha de publicación</label><input id="cd_date" class="input" type="date" value="${esc(D.date || '')}"></div></div>
      <div><label class="label" for="cd_notes">Tus observaciones</label><textarea id="cd_notes" class="input resize-y" rows="2" maxlength="800" placeholder="Música, edición, duración, horario, lo que te llamó la atención…">${esc(D.notes || '')}</textarea></div>
      ${AI.images ? `<div><span class="label">Capturas (opcional)</span><label class="dropzone p-4 flex items-center gap-3 cursor-pointer" for="cpImgs">${ico('image-plus', 'w-5 h-5 text-gold')}<span class="text-sm text-muted" id="cpImgsL">Subí hasta ${AI.limits.images.maxCount} capturas de pantalla que hayas tomado</span></label><input id="cpImgs" type="file" accept="${esc(AI.limits.images.mediaTypes.join(','))}" multiple class="sr-only" data-change="cpImgs"><p class="help">Las capturas se usan solo para este análisis y no se guardan.</p></div>` : ''}
      <div class="flex flex-col-reverse sm:flex-row gap-3 justify-end"><button type="button" class="btn-ghost" data-action="cpSaveData" data-id="${c.id}">${ico('save', 'w-4 h-4')}Guardar datos</button><button class="btn-gold" type="submit" ${CP.busy ? 'disabled' : ''}>${ico('sparkles', 'w-4 h-4')}${AI.ok ? 'Analizar con IA' : 'Análisis básico'}</button></div>
    </form>` : `<div class="p-5 md:p-7" id="cpAnalysis">${c.analysis ? analysisView(c) : emptyBlock('scan-search', 'Todavía no hay análisis', 'Completá los datos del contenido y tocá “Analizar”.', `<button class="btn-gold" data-action="cpTab" data-id="${c.id}" data-t="datos">${ico('clipboard-list')}Cargar datos</button>`)}</div>`}`,
    { size: 'lg', label: 'Análisis de ' + c.name });
}
Actions.cpTab = el => { if (el.dataset.t === 'analisis' && $('[data-form="cpAnalyze"]')) cpReadForm(App.competitors.find(x => x.id === el.dataset.id)); openComp(el.dataset.id, el.dataset.t); };
Changes.cpImgs = el => { cpImages = [...el.files].slice(0, AI.limits?.images?.maxCount || 4); $('#cpImgsL').textContent = cpImages.length ? `${cpImages.length} captura${cpImages.length > 1 ? 's' : ''} lista${cpImages.length > 1 ? 's' : ''}` : 'Subí capturas de pantalla'; };
function cpReadForm(c) {
  const g = k => $('#cd_' + k)?.value;
  c.data = { caption: (g('caption') || '').trim(), views: +g('views') || null, likes: +g('likes') || null, comments: +g('comments') || null, shares: +g('shares') || null, followers: +g('followers') || null, date: g('date') || '', notes: (g('notes') || '').trim() };
  persist('competitors', c);
}
Actions.cpSaveData = el => { cpReadForm(App.competitors.find(x => x.id === el.dataset.id)); toast('Datos guardados', { icon: 'save' }); };
Forms.cpAnalyze = async f => {
  const c = App.competitors.find(x => x.id === f.dataset.id); cpReadForm(c);
  const D = c.data;
  if (!D.caption && !D.notes && !cpImages.length && !D.views) return toast('Cargá al menos el texto, tus observaciones, métricas o una captura.', { icon: 'circle-alert', error: true });
  const erv = D.views ? ((D.likes || 0) + (D.comments || 0) + (D.shares || 0)) / D.views * 100 : null;
  if (!AI.ok) { c.analysis = basicAnalysis(c, erv); persist('competitors', c); renderSection(); openComp(c.id, 'analisis'); return; }
  CP.busy = c.id; $('#modalRoot .sheet').innerHTML = modalHead(esc(c.name), 'Analizando…') + `<div class="p-6">${aiProgress('Analizando el contenido')}</div>`; icons(); aiCtl = new AbortController();
  try {
    const r = await AI.json(`Sos analista de estrategia de contenido. ${brandLine()}
Analizá este contenido de un competidor para que yo pueda replicar su ESTRATEGIA adaptada a mi marca (nunca copiar texto, música, imágenes ni video literalmente).
Plataforma: ${NET[c.platform].label}. Tipo: ${c.type}. Cuenta: ${c.handle || c.name}. Quién es: ${c.who || 'sin dato'}.
Texto/caption/transcripción: """${(D.caption || '').slice(0, 4000)}"""
Métricas: vistas ${D.views ?? 's/d'}, me gusta ${D.likes ?? 's/d'}, comentarios ${D.comments ?? 's/d'}, compartidos ${D.shares ?? 's/d'}, seguidores ${D.followers ?? 's/d'}${erv != null ? `, engagement calculado ${erv.toFixed(2)}%` : ''}. Fecha: ${D.date || 's/d'}.
Observaciones: ${D.notes || 'ninguna'}. ${cpImages.length ? `Te adjunto ${cpImages.length} captura(s) del contenido: describí lo visual relevante.` : ''}
Respondé SOLO con este JSON en español:
{"resumen":"","nivel_rendimiento":"alto|medio|bajo","puntaje":0,"gancho":{"texto":"","tipo":"","por_que_funciona":""},"estructura":[""],"formato":"","estilo_visual":"","cta":"","datos_clave":[{"dato":"","valor":""}],"fortalezas":[""],"debilidades":[""],"como_replicar":[""],"ideas_adaptadas":[{"titulo":"","gancho":""}]}`,
      { signal: aiCtl.signal, onText: onAiText, cache: false, ...(cpImages.length ? { images: cpImages } : {}) });
    if (!r || !r.resumen) throw { code: 'invalid_json' };
    c.analysis = { ...r, at: Date.now(), erv }; persist('competitors', c);
  } catch (err) { const m = AI.message(err); if (m) toast(m, { icon: 'circle-alert', error: true }); }
  CP.busy = null; aiCtl = null; if (Modal.isOpen) openComp(c.id, c.analysis ? 'analisis' : 'datos'); if (App.section === 'competencia') renderSection();
};
function basicAnalysis(c, erv) {
  const D = c.data, first = (D.caption || '').split(/(?<=[.!?¿?])\s+/)[0] || '';
  const lvl = erv == null ? 'medio' : erv >= 8 ? 'alto' : erv >= 3 ? 'medio' : 'bajo';
  return { basic: true, at: Date.now(), erv, nivel_rendimiento: lvl, puntaje: erv == null ? 50 : clamp(Math.round(erv * 8), 5, 98),
    resumen: `Análisis básico sin IA: ${erv != null ? `engagement de ${dec(erv, 2)}%, nivel ${lvl}.` : 'sin métricas suficientes.'} Abrí la app en claude.ai para un análisis completo.`,
    gancho: first ? { texto: first, tipo: /\?/.test(first) ? 'Pregunta' : /\d/.test(first) ? 'Dato o número' : 'Afirmación', por_que_funciona: 'Es la primera frase que ve la audiencia.' } : null,
    datos_clave: [['Vistas', D.views], ['Me gusta', D.likes], ['Comentarios', D.comments], ['Compartidos', D.shares], ['Engagement', erv != null ? dec(erv, 2) + '%' : null]].filter(x => x[1] != null).map(([d, v]) => ({ dato: d, valor: typeof v === 'number' ? fmtInt(v) : v })),
    como_replicar: ['Probá un gancho del mismo tipo con tu propio ángulo.', 'Publicá en un horario similar y medí la diferencia.'], fortalezas: [], debilidades: [], ideas_adaptadas: [] };
}
function analysisView(c) {
  const a = c.analysis, L = (title, icon, items) => items && items.length ? `<section class="well p-4"><h3 class="text-[11px] font-extrabold tracking-[.18em] uppercase text-dim flex items-center gap-2 mb-2">${ico(icon, 'w-4 h-4 text-gold')}${title}</h3><ul class="flex flex-col gap-1.5 text-sm">${items.map(x => `<li class="flex gap-2">${ico('dot', 'w-4 h-4 text-gold shrink-0')}${esc(x)}</li>`).join('')}</ul></section>` : '';
  return `<div class="flex flex-col gap-4">
    <section class="rounded-3xl p-5 flex flex-col sm:flex-row gap-5 items-center" style="background:linear-gradient(135deg,rgba(229,172,0,.12),rgba(229,172,0,.02));border:1px solid var(--gold-line)">
      <div class="text-center shrink-0"><div class="font-display text-5xl font-bold gold-text">${Math.round(a.puntaje || 0)}</div><div class="text-[11px] text-dim uppercase tracking-wider mt-1">Puntaje</div></div>
      <div><span class="badge ${a.nivel_rendimiento === 'alto' ? 'badge-up' : a.nivel_rendimiento === 'bajo' ? 'badge-down' : 'badge-soft'}">Rendimiento ${esc(a.nivel_rendimiento || 'medio')}</span>${a.erv != null ? ` <span class="badge badge-muted">ER ${dec(a.erv, 2)}%</span>` : ''}
        <p class="text-[15px] leading-relaxed mt-2">${esc(a.resumen)}</p><p class="text-[11px] text-dim mt-2">${a.basic ? 'Análisis básico' : 'Analizado con IA'} ${timeAgo(a.at)}</p></div>
    </section>
    ${a.gancho?.texto ? `<section class="well p-4"><h3 class="text-[11px] font-extrabold tracking-[.18em] uppercase text-gold mb-2">Gancho · ${esc(a.gancho.tipo || '')}</h3><p class="font-display text-lg">“${esc(a.gancho.texto)}”</p>${a.gancho.por_que_funciona ? `<p class="text-sm text-muted mt-1.5">${esc(a.gancho.por_que_funciona)}</p>` : ''}</section>` : ''}
    ${(a.datos_clave || []).length ? `<section class="grid grid-cols-2 md:grid-cols-4 gap-2">${a.datos_clave.map(d => `<div class="well p-3"><div class="text-[11px] text-dim uppercase tracking-wider">${esc(d.dato)}</div><div class="font-display text-lg font-semibold mt-0.5">${esc(d.valor)}</div></div>`).join('')}</section>` : ''}
    <div class="grid md:grid-cols-2 gap-4">
      ${L('Estructura del contenido', 'list-ordered', a.estructura)}
      ${a.formato || a.estilo_visual || a.cta ? `<section class="well p-4 text-sm flex flex-col gap-2">${a.formato ? `<p><b class="text-gold-light">Formato:</b> ${esc(a.formato)}</p>` : ''}${a.estilo_visual ? `<p><b class="text-gold-light">Estilo visual:</b> ${esc(a.estilo_visual)}</p>` : ''}${a.cta ? `<p><b class="text-gold-light">CTA:</b> ${esc(a.cta)}</p>` : ''}</section>` : ''}
      ${L('Fortalezas', 'thumbs-up', a.fortalezas)}${L('Debilidades', 'thumbs-down', a.debilidades)}
    </div>
    ${L('Cómo replicar la estrategia', 'repeat-2', a.como_replicar)}
    ${(a.ideas_adaptadas || []).length ? `<section><h3 class="text-[11px] font-extrabold tracking-[.18em] uppercase text-dim mb-2">Ideas adaptadas a tu marca</h3><div class="grid md:grid-cols-2 gap-2">${a.ideas_adaptadas.map((x, i) => `<div class="well p-4 flex flex-col gap-2"><p class="font-semibold">${esc(x.titulo)}</p><p class="text-sm text-muted">“${esc(x.gancho)}”</p><button class="btn-ghost btn-sm self-start" data-action="cpIdea" data-id="${c.id}" data-i="${i}">${ico('lightbulb', 'w-3.5 h-3.5 text-gold')}Guardar en Ideas</button></div>`).join('')}</div></section>` : ''}
    <div class="flex flex-wrap gap-2 justify-end pt-2"><button class="btn-ghost" data-action="cpTab" data-id="${c.id}" data-t="datos">${ico('pencil', 'w-4 h-4')}Editar datos</button><button class="btn-gold" data-action="cpScript" data-id="${c.id}">${ico('scroll-text', 'w-4 h-4')}Crear guion inspirado</button></div>
  </div>`;
}
Actions.cpIdea = el => { const c = App.competitors.find(x => x.id === el.dataset.id), x = c.analysis.ideas_adaptadas[+el.dataset.i]; addIdea(x.titulo, { hook: x.gancho, net: c.platform, source: 'ia' }); el.disabled = true; el.innerHTML = `${ico('check', 'w-3.5 h-3.5')}Guardada`; icons(); renderSidebar(); icons(); };
Actions.cpScript = el => { const c = App.competitors.find(x => x.id === el.dataset.id), a = c.analysis; Modal.close(); Studio.prefill = { script: `Video propio inspirado en la estrategia de ${c.name}: ${a.gancho?.texto ? 'gancho tipo "' + (a.gancho.tipo || '') + '"' : ''}. ${(a.ideas_adaptadas || [])[0]?.titulo || a.resumen}` }; go('guiones'); };
Actions.cpMoves = async el => {
  const k = el.dataset.k, [pl, hd] = k.split('|');
  const entries = App.competitors.filter(c => c.kind !== 'movimientos' && c.platform === pl && c.handle === hd);
  const mv = App.competitors.find(c => c.kind === 'movimientos' && c.key === k);
  const show = m => Modal.open(`${modalHead('Movimientos de ' + esc(hd), `${NET[pl].label} · ${entries.length} contenidos analizados`, netDot(pl, 36))}<div class="p-5 md:p-7 flex flex-col gap-4">
    <p class="text-[15px] leading-relaxed">${esc(m.resumen)}</p>
    <div class="grid md:grid-cols-2 gap-3">${m.frecuencia ? `<div class="well p-4"><div class="text-[11px] uppercase tracking-wider text-dim font-bold">Frecuencia</div><p class="mt-1">${esc(m.frecuencia)}</p></div>` : ''}${m.horarios ? `<div class="well p-4"><div class="text-[11px] uppercase tracking-wider text-dim font-bold">Horarios</div><p class="mt-1">${esc(m.horarios)}</p></div>` : ''}</div>
    ${(m.mix_formatos || []).length ? `<div class="well p-4"><div class="text-[11px] uppercase tracking-wider text-dim font-bold mb-3">Mix de formatos</div>${m.mix_formatos.map(f => `<div class="mb-2"><div class="flex justify-between text-xs mb-1"><span>${esc(f.formato)}</span><b>${Math.round(f.porcentaje)}%</b></div><div class="h-2 rounded-full bg-[#1F2533]"><div class="h-full rounded-full hbar" style="width:${clamp(f.porcentaje, 0, 100)}%;background:var(--gold-grad)"></div></div></div>`).join('')}</div>` : ''}
    ${[['Temas recurrentes', m.temas_recurrentes], ['Patrones que les funcionan', m.patrones_ganadores], ['Oportunidades para vos', m.oportunidades], ['Plan de acción', m.plan_accion]].filter(x => (x[1] || []).length).map(([t, arr]) => `<div class="well p-4"><div class="text-[11px] uppercase tracking-wider text-dim font-bold mb-2">${t}</div><ul class="flex flex-col gap-1.5 text-sm">${arr.map(x => `<li class="flex gap-2">${ico('dot', 'w-4 h-4 text-gold shrink-0')}${esc(x)}</li>`).join('')}</ul></div>`).join('')}
    <p class="text-[11px] text-dim">Analizado ${timeAgo(m.at)} · <button class="underline text-gold-light" data-action="cpMovesRedo" data-k="${esc(k)}">Volver a analizar</button></p></div>`, { size: 'md' });
  if (mv && !el.dataset.redo) return show(mv);
  if (!AI.ok) return toast('El análisis de movimientos usa IA: abrí la app en claude.ai.', { icon: 'sparkles' });
  CP.busy = k; renderSection(); toast('Analizando movimientos…', { icon: 'activity' });
  try {
    const data = entries.map(c => ({ tipo: c.type, fecha: c.data?.date || new Date(c.createdAt).toISOString().slice(0, 10), texto: (c.data?.caption || '').slice(0, 600), vistas: c.data?.views, likes: c.data?.likes, comentarios: c.data?.comments, resumen_analisis: c.analysis?.resumen }));
    const r = await AI.json(`Sos analista de estrategia de redes. ${brandLine()} Analizá los movimientos de la cuenta ${hd} en ${NET[pl].label} a partir de estos contenidos guardados (JSON): ${JSON.stringify(data).slice(0, 12000)}
Detectá patrones de frecuencia, formatos, temas, horarios y qué les funciona mejor. Proponé oportunidades y un plan de acción para MI marca (adaptar la estrategia, no copiar contenido). Si hay pocos datos, decilo en el resumen.
Respondé SOLO con este JSON: {"resumen":"","frecuencia":"","horarios":"","mix_formatos":[{"formato":"","porcentaje":0}],"temas_recurrentes":[""],"patrones_ganadores":[""],"oportunidades":[""],"plan_accion":[""]}`, { cache: false });
    if (!r || !r.resumen) throw { code: 'invalid_json' };
    const doc = { id: mv?.id || 'mv-' + uid(), kind: 'movimientos', key: k, platform: pl, handle: hd, ...r, at: Date.now(), createdAt: mv?.createdAt || Date.now() };
    App.competitors = App.competitors.filter(c => c.id !== doc.id); App.competitors.push(doc); persist('competitors', doc);
    CP.busy = null; renderSection(); show(doc);
  } catch (err) { CP.busy = null; renderSection(); const m = AI.message(err); if (m) toast(m, { icon: 'circle-alert', error: true }); }
};
Actions.cpMovesRedo = el => { Modal.close(); Actions.cpMoves({ dataset: { k: el.dataset.k, redo: '1' } }); };
