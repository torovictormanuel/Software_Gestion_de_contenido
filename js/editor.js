'use strict';
/* =========================================================
   Editor de video: biblioteca de medios, línea de tiempo
   multipista (video, texto, audio), recortes, división,
   reordenamiento, filtros, fundidos, velocidad, marcadores,
   deshacer/rehacer, exportación y asistente IA por prompts.
   ========================================================= */
const ASPECTS = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [960, 960], '4:5': [864, 1080] };
const TXT_SIZES = { s: 40, m: 58, l: 80, xl: 108 };
const Editor = {
  media: [], clips: [], texts: [], audios: [], markers: [],
  aspect: '9:16', bg: '#000000', zoom: 48, time: 0, playing: false, sel: null,
  history: [], future: [], snapOn: true, busy: false, exporting: false, aiBusy: false, aiLog: [],
  actx: null, dest: null, loaded: false,
};
const E = Editor;
const vDur = c => (c.out - c.in) / (c.speed || 1);
const mediaById = id => E.media.find(m => m.id === id);
function starts() { let t = 0; return E.clips.map(c => { const s = t; t += vDur(c); return s; }); }
function total() {
  const st = starts(), v = E.clips.length ? st.at(-1) + vDur(E.clips.at(-1)) : 0;
  return Math.max(v, ...E.texts.map(t => t.start + t.dur), ...E.audios.map(a => a.start + (a.out - a.in)), 0);
}
function clipAt(t) { const st = starts(); for (let i = 0; i < E.clips.length; i++) if (t >= st[i] && t < st[i] + vDur(E.clips[i])) return { clip: E.clips[i], start: st[i], idx: i }; return null; }
function findItem(type, id) { return (type === 'video' ? E.clips : type === 'text' ? E.texts : E.audios).find(x => x.id === id); }
const project = () => ({ clips: E.clips, texts: E.texts, audios: E.audios, markers: E.markers, aspect: E.aspect, bg: E.bg });
function snap() { E.history.push(JSON.stringify(project())); if (E.history.length > 80) E.history.shift(); E.future = []; }
function restore(json) { const p = JSON.parse(json); Object.assign(E, { clips: p.clips, texts: p.texts, audios: p.audios, markers: p.markers, aspect: p.aspect, bg: p.bg }); }
const saveProject = debounce(() => {
  Store.setDoc('editor', { project: project(), media: E.media.map(({ id, name, kind, duration }) => ({ id, name, kind, duration })), savedAt: Date.now() }).catch(e => console.warn(e));
}, 1200);
function changed({ timeline = true, inspector = true } = {}) { if (timeline) edTimeline(); if (inspector) edInspector(); edDraw(); edTransport(); saveProject(); }

Editor.load = async () => {
  if (E.loaded) return; E.loaded = true;
  const d = await Store.getDoc('editor');
  if (d?.project) {
    Object.assign(E, { clips: d.project.clips || [], texts: d.project.texts || [], audios: d.project.audios || [], markers: d.project.markers || [], aspect: d.project.aspect || '9:16', bg: d.project.bg || '#000000' });
    E.media = (d.media || []).map(m => ({ ...m, missing: true }));
  }
};
Editor.pause = () => { if (E.playing && !E.exporting) edPause(); };

/* ---------- Medios ---------- */
async function edImport(files) {
  for (const f of [...files]) {
    const kind = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null;
    if (!kind) { toast(`“${f.name}” no es un video, audio o imagen.`, { icon: 'circle-alert', error: true }); continue; }
    const url = URL.createObjectURL(f);
    let m = E.media.find(x => x.missing && x.name === f.name && x.kind === kind);
    if (m) { Object.assign(m, { url, missing: false }); } else { m = { id: 'm' + uid(), name: f.name, kind, url, duration: kind === 'image' ? 5 : 0 }; E.media.push(m); }
    await edPrepare(m);
  }
  edBin(); changed();
}
function edPrepare(m) {
  return new Promise(res => {
    if (m.kind === 'image') { const img = new Image(); img.onload = () => { m.el = img; m.thumb = m.url; m.w = img.naturalWidth; m.h = img.naturalHeight; res(); }; img.onerror = () => { toast('No se pudo leer la imagen ' + m.name, { error: true, icon: 'circle-alert' }); res(); }; img.src = m.url; return; }
    const el = document.createElement(m.kind === 'video' ? 'video' : 'audio');
    el.preload = 'auto'; el.playsInline = true; el.src = m.url;
    el.onloadedmetadata = () => {
      m.el = el; m.duration = isFinite(el.duration) ? el.duration : 10; m.w = el.videoWidth; m.h = el.videoHeight;
      if (m.kind !== 'video') return res();
      el.currentTime = Math.min(.2, m.duration / 2);
      el.onseeked = () => { el.onseeked = null; try { const c = document.createElement('canvas'); c.width = 160; c.height = Math.round(160 * (m.h / m.w || .56)); c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); m.thumb = c.toDataURL('image/jpeg', .6); } catch {} res(); };
    };
    el.onerror = () => { toast(`No se pudo leer “${m.name}”. Probá con MP4, WEBM, MP3 o WAV.`, { error: true, icon: 'circle-alert' }); res(); };
  });
}
function edAddToTimeline(mediaId, track, opts = {}) {
  const m = mediaById(mediaId); if (!m) throw new Error('Medio inexistente');
  if (track === 'audio') {
    if (m.kind === 'image') throw new Error('Una imagen no puede ir en la pista de audio');
    const a = { id: 'a' + uid(), mediaId, start: opts.start ?? E.time, in: opts.in ?? 0, out: opts.out ?? m.duration, volume: .8, fadeIn: 0, fadeOut: 1 };
    E.audios.push(a); return a;
  }
  if (m.kind === 'audio') throw new Error('Un audio no puede ir en la pista de video');
  const c = { id: 'c' + uid(), mediaId, in: opts.in ?? 0, out: opts.out ?? (m.kind === 'image' ? 4 : m.duration), speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, b: 100, c: 100, s: 100, fit: 'cover' };
  const at = opts.index ?? E.clips.length; E.clips.splice(at, 0, c); return c;
}

/* ---------- Audio (WebAudio para mezclar y exportar) ---------- */
function edAudioGraph() {
  if (!E.actx) { try { E.actx = new (window.AudioContext || window.webkitAudioContext)(); E.dest = E.actx.createMediaStreamDestination(); } catch { return; } }
  if (E.actx.state === 'suspended') E.actx.resume();
  E.media.forEach(m => {
    if (!m.el || m.kind === 'image' || m.gain) return;
    try { const src = E.actx.createMediaElementSource(m.el); m.gain = E.actx.createGain(); src.connect(m.gain); m.gain.connect(E.actx.destination); m.gain.connect(E.dest); } catch {}
  });
}
const setVol = (m, v) => { v = Math.max(0, v); if (m.gain) m.gain.gain.value = v; else if (m.el) m.el.volume = clamp(v, 0, 1); };

/* ---------- Reproducción ---------- */
function edSync(playing) {
  E.media.forEach(m => { m._on = false; });
  const hit = clipAt(E.time);
  if (hit) {
    const c = hit.clip, m = mediaById(c.mediaId);
    if (m && m.kind === 'video' && m.el && !m.missing) {
      m._on = true; const local = E.time - hit.start, d = vDur(c);
      const want = c.in + local * (c.speed || 1);
      m.el.playbackRate = c.speed || 1;
      if (Math.abs(m.el.currentTime - want) > (playing ? .3 : .02)) { m.el.currentTime = want; if (!playing) m.el.addEventListener('seeked', edDraw, { once: true }); }
      let a = 1; if (c.fadeIn) a = Math.min(a, local / c.fadeIn); if (c.fadeOut) a = Math.min(a, (d - local) / c.fadeOut);
      setVol(m, (c.volume ?? 1) * clamp(a, 0, 1));
      if (playing && m.el.paused) m.el.play().catch(() => {});
    }
  }
  E.audios.forEach(a => {
    const m = mediaById(a.mediaId); if (!m || !m.el || m.missing) return;
    const local = E.time - a.start, d = a.out - a.in;
    if (local < 0 || local >= d) return;
    m._on = true; const want = a.in + local;
    if (Math.abs(m.el.currentTime - want) > (playing ? .3 : .05)) m.el.currentTime = want;
    let f = 1; if (a.fadeIn) f = Math.min(f, local / a.fadeIn); if (a.fadeOut) f = Math.min(f, (d - local) / a.fadeOut);
    setVol(m, (a.volume ?? 1) * clamp(f, 0, 1));
    if (playing && m.el.paused) m.el.play().catch(() => {});
  });
  E.media.forEach(m => { if (m.el && m.kind !== 'image' && !m._on && !m.el.paused) m.el.pause(); });
}
function edTick() {
  if (!E.playing) return;
  E.time = (performance.now() - E.t0) / 1000;
  const T = total();
  if (E.time >= T) { E.time = T; edSync(false); edDraw(); edPause(); if (E.exporting) edFinishExport(); return; }
  edSync(true); edDraw(); edHead();
  if (E.exporting) { const p = $('#exBar'); if (p) { p.style.width = (E.time / T * 100) + '%'; $('#exTxt').textContent = `${fmtTC(E.time)} / ${fmtTC(T)}`; } }
  requestAnimationFrame(edTick);
}
function edPlay() {
  if (total() <= 0) return toast('Agregá clips, textos o audio a la línea de tiempo.', { icon: 'film' });
  edAudioGraph();
  if (E.time >= total() - .05) E.time = 0;
  E.playing = true; E.t0 = performance.now() - E.time * 1000; edTransport(); requestAnimationFrame(edTick);
}
function edPause() { E.playing = false; E.media.forEach(m => m.el && m.kind !== 'image' && m.el.pause && m.el.pause()); edTransport(); edHead(); }
function edSeek(t) { E.time = clamp(t, 0, Math.max(total(), 0)); edSync(false); edDraw(); edHead(); edTransport(); }

/* ---------- Dibujo del cuadro ---------- */
function edDraw() {
  const cv = $('#edCanvas'); if (!cv) return;
  const [W, H] = ASPECTS[E.aspect]; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.fillStyle = E.bg; ctx.fillRect(0, 0, W, H);
  const hit = clipAt(E.time);
  if (hit) {
    const c = hit.clip, m = mediaById(c.mediaId), local = E.time - hit.start, d = vDur(c);
    let a = 1; if (c.fadeIn) a = Math.min(a, local / c.fadeIn); if (c.fadeOut) a = Math.min(a, (d - local) / c.fadeOut);
    if (m && !m.missing && m.el && (m.kind === 'image' || m.el.readyState >= 2)) {
      const sw = m.kind === 'image' ? m.el.naturalWidth : m.el.videoWidth, sh = m.kind === 'image' ? m.el.naturalHeight : m.el.videoHeight;
      if (sw && sh) {
        const sc = c.fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
        let zoom = 1; if (m.kind === 'image' && c.kenburns) zoom = 1 + .08 * (local / d);
        const dw = sw * sc * zoom, dh = sh * sc * zoom;
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.filter = `brightness(${c.b ?? 100}%) contrast(${c.c ?? 100}%) saturate(${c.s ?? 100}%)`;
        ctx.drawImage(m.el, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.filter = 'none'; ctx.globalAlpha = 1;
      }
    } else if (m) {
      ctx.fillStyle = '#6B7180'; ctx.font = `600 ${Math.round(W / 26)}px "Plus Jakarta Sans", sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(m.missing ? `Reimportá “${m.name.slice(0, 28)}”` : 'Cargando…', W / 2, H / 2); ctx.textAlign = 'left';
    }
  } else if (!E.clips.length && !E.texts.length) {
    ctx.fillStyle = '#3A4152'; ctx.font = `600 ${Math.round(W / 24)}px "Plus Jakarta Sans", sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Importá clips para empezar', W / 2, H / 2); ctx.textAlign = 'left';
  }
  E.texts.filter(t => E.time >= t.start && E.time < t.start + t.dur).forEach(t => edDrawText(ctx, t, E.time - t.start, W, H));
}
function edDrawText(ctx, t, local, W, H) {
  const size = (TXT_SIZES[t.size] || 58) * (W / 720) * (E.aspect === '16:9' ? .8 : 1);
  ctx.font = `800 ${size}px Outfit, "Plus Jakarta Sans", sans-serif`;
  const lines = wrapLines(ctx, t.text, W * .84).slice(0, 6), lh = size * 1.15, bh = lines.length * lh;
  const cy = t.pos === 'top' ? H * .15 + bh / 2 : t.pos === 'bottom' ? H * .8 - bh / 2 : H / 2;
  let a = 1, sc = 1;
  if (t.anim === 'fade') a = Math.min(1, local / .35, (t.dur - local) / .35);
  if (t.anim === 'pop') { const p = Math.min(1, local / .25); sc = .75 + .25 * (1 - Math.pow(1 - p, 3)); a = Math.min(1, local / .15, (t.dur - local) / .25); }
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.translate(W / 2, cy); ctx.scale(sc, sc); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (t.bg) { const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + size * .9; ctx.fillStyle = t.bgColor || 'rgba(0,0,0,.6)'; roundRect(ctx, -bw / 2, -bh / 2 - size * .3, bw, bh + size * .6, size * .35); ctx.fill(); }
  else { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = size * .25; }
  ctx.fillStyle = t.color || '#FFFFFF';
  lines.forEach((l, i) => ctx.fillText(l, 0, -bh / 2 + lh * (i + .5)));
  ctx.restore();
}

/* ---------- Operaciones de edición ---------- */
function edSplit(at = E.time) {
  const hit = clipAt(at);
  if (hit) {
    const c = hit.clip, local = at - hit.start; if (local < .1 || vDur(c) - local < .1) throw new Error('El corte queda demasiado cerca del borde del clip');
    const cut = c.in + local * (c.speed || 1), c2 = { ...JSON.parse(JSON.stringify(c)), id: 'c' + uid(), in: cut, fadeIn: 0 };
    c.out = cut; c.fadeOut = 0; E.clips.splice(hit.idx + 1, 0, c2); return c2;
  }
  const a = E.audios.find(x => at > x.start + .1 && at < x.start + (x.out - x.in) - .1);
  if (a) { const cut = a.in + (at - a.start), a2 = { ...a, id: 'a' + uid(), in: cut, start: at, fadeIn: 0 }; a.out = cut; a.fadeOut = 0; E.audios.push(a2); return a2; }
  throw new Error('No hay un clip debajo del cabezal');
}
function edDelete(type, id) {
  const arr = type === 'video' ? E.clips : type === 'text' ? E.texts : E.audios, i = arr.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Elemento inexistente'); arr.splice(i, 1); if (E.sel?.id === id) E.sel = null;
}
function edDuplicate(type, id) {
  const it = findItem(type, id); if (!it) return; const cp = { ...JSON.parse(JSON.stringify(it)), id: type[0] + uid() };
  if (type === 'video') E.clips.splice(E.clips.indexOf(it) + 1, 0, cp);
  else if (type === 'text') { cp.start = it.start + it.dur; E.texts.push(cp); } else { cp.start = it.start + (it.out - it.in); E.audios.push(cp); }
  E.sel = { type, id: cp.id };
}
function edAddText(o = {}) {
  const t = { id: 't' + uid(), text: o.text || 'Tu texto', start: o.start ?? E.time, dur: o.dur ?? 3, pos: o.pos || 'center', size: o.size || 'm', color: o.color || '#FFFFFF', bg: o.bg ?? true, anim: o.anim || 'fade' };
  E.texts.push(t); return t;
}
function edSnapT(t, exclude) {
  if (!E.snapOn) return t;
  const st = starts(), pts = [0, E.time, ...E.markers.map(m => m.time), ...st, ...E.clips.map((c, i) => st[i] + vDur(c)), ...E.texts.filter(x => x.id !== exclude).flatMap(x => [x.start, x.start + x.dur]), ...E.audios.filter(x => x.id !== exclude).flatMap(x => [x.start, x.start + x.out - x.in])];
  const tol = 8 / E.zoom; let best = t, bd = tol;
  pts.forEach(p => { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } });
  return best;
}
function edImportScript(s) {
  snap();
  const T = total() > 2 ? total() : (+s.duracion_segundos || 45), tm = scTimes({ ...s, duracion_segundos: T });
  edAddText({ text: s.gancho, start: 0, dur: Math.max(2, Math.min(4, tm.hook[1] || 3)), pos: 'center', size: 'l', anim: 'pop' });
  E.markers.push({ id: 'k' + uid(), time: 0, label: 'Gancho' });
  (s.puntos || []).forEach((p, i) => { const [a, b] = tm.points[i]; edAddText({ text: p.titulo, start: a, dur: Math.min(3, b - a), pos: 'top', size: 'm', anim: 'fade' }); E.markers.push({ id: 'k' + uid(), time: a, label: `Punto ${i + 1}` }); });
  edAddText({ text: s.cta, start: tm.close[0], dur: Math.max(2, T - tm.close[0]), pos: 'bottom', size: 'm', anim: 'pop', color: '#1A1300', bg: true });
  E.texts.at(-1).bgColor = '#E5AC00';
  E.markers.push({ id: 'k' + uid(), time: tm.close[0], label: 'Cierre' });
  changed(); toast('Guion importado como textos y marcadores', { icon: 'scroll-text' });
}

/* ---------- Render de la sección ---------- */
RENDER.editor = el => {
  el.innerHTML = `${sectionHead('Editor de <span class="gold-text">video</span>', 'Edición avanzada', `<div class="flex gap-2 flex-wrap">${aiBadge()}<button class="btn-gold" data-action="edExport">${ico('film', 'w-4 h-4')}Exportar video</button></div>`)}
    <div class="grid 2xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
      <div class="min-w-0 flex flex-col gap-4">
        <div class="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
          <div class="card p-3 md:p-4 min-w-0">
            <div class="ed-stage rounded-2xl flex items-center justify-center p-3" style="height:min(62vh,560px)">
              <canvas id="edCanvas" class="max-w-full max-h-full rounded-lg shadow-2xl" style="aspect-ratio:${ASPECTS[E.aspect].join('/')}" role="img" aria-label="Vista previa del video"></canvas>
            </div>
            <div id="edTransport" class="mt-3"></div>
          </div>
          <div class="card p-4 min-w-0 flex flex-col gap-3" id="edBinWrap">
            <div class="flex items-center justify-between"><h2 class="font-semibold flex items-center gap-2">${ico('folder-open', 'w-4 h-4 text-gold')}Medios</h2><button class="btn-ghost btn-sm" data-action="edPick">${ico('upload', 'w-3.5 h-3.5')}Importar</button></div>
            <input id="edFile" type="file" accept="video/*,audio/*,image/*" multiple class="sr-only" data-change="edFile" aria-label="Importar medios">
            <div id="edBin" class="flex flex-col gap-2 max-h-[420px] overflow-y-auto" data-drop="editor"></div>
          </div>
        </div>
        <div class="card p-3 md:p-4 min-w-0">
          <div id="edTools" class="flex flex-wrap items-center gap-1.5 mb-3"></div>
          <div class="flex gap-2">
            <div class="w-[74px] shrink-0 flex flex-col text-[11px] font-bold text-dim">
              <div class="h-[28px]"></div>
              <div class="h-[62px] flex items-center gap-1.5 px-1">${ico('film', 'w-3.5 h-3.5')}Video</div>
              <div class="h-[40px] flex items-center gap-1.5 px-1">${ico('type', 'w-3.5 h-3.5')}Texto</div>
              <div class="h-[46px] flex items-center gap-1.5 px-1">${ico('music', 'w-3.5 h-3.5')}Audio</div>
            </div>
            <div class="tl-wrap flex-1 min-w-0" id="tlWrap"><div class="tl-inner" id="tlInner"></div></div>
          </div>
          <p class="text-[11px] text-dim mt-3 hidden md:block">Atajos: Espacio reproducir · S cortar · Supr eliminar · D duplicar · M marcador · ←/→ mover cabezal · Ctrl+Z / Ctrl+Y deshacer/rehacer. Arrastrá los bordes de un clip para recortarlo y el clip para acomodarlo.</p>
        </div>
      </div>
      <div class="flex flex-col gap-4 min-w-0">
        <div class="card p-4 md:p-5" id="edInspector"></div>
        <div class="card p-4 md:p-5" id="edAI"></div>
      </div>
    </div>`;
  edTransport(); edTools(); edBin(); edTimeline(); edInspector(); edAIPanel(); edDraw();
  if (Studio.prefill?.editorScript) { const s = Studio.prefill.editorScript; Studio.prefill = null; edImportScript(s); }
  if (E.media.some(m => m.missing)) toast('Reimportá los archivos de tu proyecto para seguir editando: los videos no se guardan en la nube.', { icon: 'folder-open', ms: 6000 });
};
function edTransport() {
  const w = $('#edTransport'); if (!w) return;
  const T = total();
  w.innerHTML = `<div class="flex flex-wrap items-center gap-2">
    <button class="icon-btn" data-action="edHome" aria-label="Ir al inicio">${ico('skip-back', 'w-5 h-5')}</button>
    <button class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background:var(--gold-grad);color:var(--on-gold)" data-action="edPlay" aria-label="${E.playing ? 'Pausar' : 'Reproducir'}">${ico(E.playing ? 'pause' : 'play', 'w-5 h-5')}</button>
    <button class="icon-btn" data-action="edEnd" aria-label="Ir al final">${ico('skip-forward', 'w-5 h-5')}</button>
    <span class="font-display tnum text-sm ml-1"><span id="edTime" class="text-gold-light">${fmtTC(E.time)}</span><span class="text-dim"> / ${fmtTC(T)}</span></span>
    <div class="ml-auto seg" role="group" aria-label="Formato del video">${Object.keys(ASPECTS).map(k => `<button data-action="edAspect" data-v="${k}" aria-pressed="${E.aspect === k}">${k}</button>`).join('')}</div>
  </div>`; icons();
}
function edTools() {
  const can = !!E.sel;
  $('#edTools').innerHTML = `
    <button class="btn-ghost btn-sm" data-action="edSplit">${ico('scissors', 'w-3.5 h-3.5 text-gold')}Cortar</button>
    <button class="btn-ghost btn-sm" data-action="edDel" ${can ? '' : 'disabled'}>${ico('trash-2', 'w-3.5 h-3.5')}Eliminar</button>
    <button class="btn-ghost btn-sm" data-action="edDup" ${can ? '' : 'disabled'}>${ico('copy', 'w-3.5 h-3.5')}Duplicar</button>
    <button class="btn-ghost btn-sm" data-action="edText">${ico('type', 'w-3.5 h-3.5 text-gold')}Texto</button>
    <button class="btn-ghost btn-sm" data-action="edMarker">${ico('bookmark', 'w-3.5 h-3.5')}Marcador</button>
    <button class="btn-ghost btn-sm" data-action="edScriptPick">${ico('scroll-text', 'w-3.5 h-3.5 text-gold')}Importar guion</button>
    <span class="w-px h-6 bg-white/10 mx-1"></span>
    <button class="icon-btn sm" data-action="edUndo" aria-label="Deshacer" ${E.history.length ? '' : 'disabled'}>${ico('undo-2')}</button>
    <button class="icon-btn sm" data-action="edRedo" aria-label="Rehacer" ${E.future.length ? '' : 'disabled'}>${ico('redo-2')}</button>
    <button class="icon-btn sm" data-action="edSnap" aria-label="Imantado ${E.snapOn ? 'activado' : 'desactivado'}" aria-pressed="${E.snapOn}" style="${E.snapOn ? 'color:var(--gold)' : ''}">${ico('magnet')}</button>
    <label class="flex items-center gap-2 ml-auto text-xs text-dim min-w-[140px]">${ico('zoom-in', 'w-4 h-4')}<span class="sr-only">Zoom de la línea de tiempo</span><input type="range" min="12" max="160" value="${E.zoom}" data-input="edZoom" aria-label="Zoom"></label>`;
  icons();
}
function edBin() {
  const b = $('#edBin'); if (!b) return;
  b.innerHTML = E.media.length ? E.media.map(m => `
    <div class="well p-2 flex items-center gap-2.5 ${m.missing ? 'opacity-60' : ''}">
      <span class="w-14 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden" style="background:#0A0D14">${m.thumb ? `<img src="${esc(m.thumb)}" class="w-full h-full object-cover" alt="">` : ico(m.kind === 'audio' ? 'music' : 'film', 'w-4 h-4 text-gold')}</span>
      <div class="min-w-0 flex-1"><div class="text-xs font-semibold truncate">${esc(m.name)}</div><div class="text-[10.5px] text-dim">${m.missing ? 'Falta el archivo: reimportalo' : `${{ video: 'Video', audio: 'Audio', image: 'Imagen' }[m.kind]}${m.kind !== 'image' ? ' · ' + fmtDur(m.duration) : ''}`}</div></div>
      ${m.missing ? '' : `<button class="icon-btn sm" data-action="edAdd" data-id="${m.id}" data-track="${m.kind === 'audio' ? 'audio' : 'video'}" aria-label="Agregar a la línea de tiempo">${ico('plus')}</button>`}
      ${m.kind === 'video' && !m.missing ? `<button class="icon-btn sm" data-action="edAdd" data-id="${m.id}" data-track="audio" aria-label="Usar solo el audio">${ico('music')}</button>` : ''}
    </div>`).join('')
    : `<button class="dropzone w-full p-6 flex flex-col items-center gap-2 text-center" data-action="edPick">${ico('cloud-upload', 'w-7 h-7 text-gold')}<span class="text-sm font-semibold">Arrastrá videos, música o imágenes</span><span class="text-xs text-dim">MP4, MOV, WEBM, MP3, WAV, JPG, PNG</span></button>`;
  icons();
}
function edTimeline() {
  const inner = $('#tlInner'); if (!inner) return;
  const T = Math.max(total(), 10) + 4, z = E.zoom, W = T * z;
  const step = z >= 90 ? 1 : z >= 45 ? 2 : z >= 22 ? 5 : 10;
  let ticks = ''; for (let s = 0; s <= T; s += step) ticks += `<div class="tl-tick" style="left:${s * z}px">${fmtDur(s)}</div>`;
  const st = starts();
  const sel = id => E.sel?.id === id ? ' sel' : '';
  inner.style.width = W + 'px';
  inner.innerHTML = `
    <div class="tl-ruler" data-ruler>${ticks}${E.markers.map(m => `<div class="tl-marker" style="left:${m.time * z}px" title="${esc(m.label)}"><span class="absolute top-0 left-1 text-[9px] font-bold whitespace-nowrap" style="color:var(--sky)">${esc(m.label)}</span></div>`).join('')}</div>
    <div class="tl-track" data-track="video">${E.clips.map((c, i) => { const m = mediaById(c.mediaId) || {}; return `<div class="tl-clip${sel(c.id)}" data-type="video" data-id="${c.id}" tabindex="0" role="button" aria-label="Clip ${esc(m.name || '')}, ${fmtDur(vDur(c))}"
      style="left:${st[i] * z}px;width:${Math.max(6, vDur(c) * z)}px;background-color:#2A2140;${m.thumb ? `background-image:url('${m.thumb}')` : ''}"><span class="h l"></span><span class="lbl">${esc(m.name || 'Clip')} · ${dec(vDur(c))}s${c.speed && c.speed !== 1 ? ' · ' + c.speed + 'x' : ''}</span><span class="h r"></span></div>`; }).join('')}</div>
    <div class="tl-track t-text" data-track="text">${E.texts.map(t => `<div class="tl-clip${sel(t.id)}" data-type="text" data-id="${t.id}" tabindex="0" role="button" aria-label="Texto ${esc(t.text)}" style="left:${t.start * z}px;width:${Math.max(6, t.dur * z)}px;background:linear-gradient(180deg,rgba(229,172,0,.35),rgba(229,172,0,.18))"><span class="h l"></span><span class="lbl" style="bottom:auto;top:50%;transform:translateY(-50%)">${esc(t.text)}</span><span class="h r"></span></div>`).join('')}</div>
    <div class="tl-track t-audio" data-track="audio">${E.audios.map(a => { const m = mediaById(a.mediaId) || {}; return `<div class="tl-clip${sel(a.id)}" data-type="audio" data-id="${a.id}" tabindex="0" role="button" aria-label="Audio ${esc(m.name || '')}" style="left:${a.start * z}px;width:${Math.max(6, (a.out - a.in) * z)}px;background:repeating-linear-gradient(90deg,rgba(52,211,153,.45) 0 2px,rgba(52,211,153,.18) 2px 5px)"><span class="h l"></span><span class="lbl">${esc(m.name || 'Audio')} · ${Math.round((a.volume ?? 1) * 100)}%</span><span class="h r"></span></div>`; }).join('')}</div>
    <div class="tl-head" id="tlHead" style="left:${E.time * z}px"></div>`;
}
function edHead() {
  const h = $('#tlHead'); if (h) h.style.left = E.time * E.zoom + 'px';
  const t = $('#edTime'); if (t) t.textContent = fmtTC(E.time);
  if (E.playing) { const w = $('#tlWrap'); if (w) { const x = E.time * E.zoom; if (x > w.scrollLeft + w.clientWidth - 60) w.scrollLeft = x - 60; } }
}
const rng = (k, label, val, min, max, step, unit = '') => `<div><div class="flex justify-between text-xs mb-1"><label for="ei_${k}" class="text-muted">${label}</label><span class="tnum text-gold-light" id="eiv_${k}">${val}${unit}</span></div><input id="ei_${k}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-input="edProp" data-k="${k}" data-unit="${unit}"></div>`;
function edInspector() {
  const w = $('#edInspector'); if (!w) return;
  edTools();
  const s = E.sel, it = s && findItem(s.type, s.id);
  if (!it) {
    w.innerHTML = `<h2 class="font-semibold flex items-center gap-2">${ico('sliders-horizontal', 'w-4 h-4 text-gold')}Proyecto</h2>
      <div class="grid grid-cols-3 gap-2 mt-3 text-center">${[['Clips', E.clips.length], ['Textos', E.texts.length], ['Audios', E.audios.length]].map(([l, v]) => `<div class="well p-2"><div class="font-display text-lg font-semibold">${v}</div><div class="text-[10px] text-dim">${l}</div></div>`).join('')}</div>
      <div class="flex items-center justify-between gap-3 mt-4"><label for="edBg" class="text-sm text-muted">Color de fondo</label><input id="edBg" type="color" value="${E.bg}" data-input="edBg"></div>
      <p class="text-xs text-dim mt-4">Tocá un clip de la línea de tiempo para editar sus propiedades.</p>
      ${E.clips.length + E.texts.length + E.audios.length ? `<button class="btn-ghost btn-danger btn-sm mt-4" data-action="edClear">${ico('eraser', 'w-3.5 h-3.5')}Vaciar línea de tiempo</button>` : ''}`;
    icons(); return;
  }
  const m = it.mediaId && mediaById(it.mediaId);
  const head = (icon, title) => `<div class="flex items-center gap-2 mb-4"><span class="w-8 h-8 rounded-xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico(icon)}</span><h2 class="font-semibold truncate flex-1">${title}</h2><button class="icon-btn sm" data-action="edDeselect" aria-label="Cerrar propiedades">${ico('x')}</button></div>`;
  if (s.type === 'video') {
    const idx = E.clips.indexOf(it), st = starts()[idx];
    w.innerHTML = head(m?.kind === 'image' ? 'image' : 'film', esc(m?.name || 'Clip')) + `<div class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-2 text-center text-xs"><div class="well p-2"><div class="text-dim">Inicio</div><div class="font-semibold tnum">${fmtTC(st)}</div></div><div class="well p-2"><div class="text-dim">Duración</div><div class="font-semibold tnum">${dec(vDur(it))}s</div></div><div class="well p-2"><div class="text-dim">Posición</div><div class="font-semibold">${idx + 1}/${E.clips.length}</div></div></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="label !text-[10px]" for="ei_in">Entrada (s)</label><input id="ei_in" class="input !min-h-[40px]" type="number" step="0.1" min="0" value="${dec(it.in, 2).replace(',', '.')}" data-change="edNum" data-k="in"></div><div><label class="label !text-[10px]" for="ei_out">Salida (s)</label><input id="ei_out" class="input !min-h-[40px]" type="number" step="0.1" min="0" value="${dec(it.out, 2).replace(',', '.')}" data-change="edNum" data-k="out"></div></div>
      <div><label class="label !text-[10px]" for="ei_speed">Velocidad</label><div class="seg">${[.5, 1, 1.5, 2].map(v => `<button data-action="edSpeed" data-v="${v}" aria-pressed="${(it.speed || 1) === v}">${v}x</button>`).join('')}</div></div>
      ${m?.kind === 'video' ? rng('volume', 'Volumen', Math.round((it.volume ?? 1) * 100), 0, 200, 5, '%') : `<label class="flex items-center gap-2 text-sm min-h-[40px]"><input type="checkbox" data-change="edCheck" data-k="kenburns" ${it.kenburns ? 'checked' : ''}> Zoom lento (efecto Ken Burns)</label>`}
      ${rng('b', 'Brillo', it.b ?? 100, 40, 180, 5, '%')}${rng('c', 'Contraste', it.c ?? 100, 40, 180, 5, '%')}${rng('s', 'Saturación', it.s ?? 100, 0, 220, 5, '%')}
      ${rng('fadeIn', 'Fundido de entrada', it.fadeIn || 0, 0, 3, .1, 's')}${rng('fadeOut', 'Fundido de salida', it.fadeOut || 0, 0, 3, .1, 's')}
      <div><label class="label !text-[10px]">Encuadre</label><div class="seg"><button data-action="edFit" data-v="cover" aria-pressed="${it.fit !== 'contain'}">Llenar</button><button data-action="edFit" data-v="contain" aria-pressed="${it.fit === 'contain'}">Ajustar</button></div></div>
      <div class="flex gap-2"><button class="btn-ghost btn-sm flex-1" data-action="edMove" data-d="-1" ${idx ? '' : 'disabled'}>${ico('arrow-left', 'w-3.5 h-3.5')}Antes</button><button class="btn-ghost btn-sm flex-1" data-action="edMove" data-d="1" ${idx < E.clips.length - 1 ? '' : 'disabled'}>Después${ico('arrow-right', 'w-3.5 h-3.5')}</button></div>
      <button class="btn-ghost btn-sm" data-action="edResetFx">${ico('rotate-ccw', 'w-3.5 h-3.5')}Restablecer filtros</button></div>`;
  } else if (s.type === 'text') {
    w.innerHTML = head('type', 'Texto') + `<div class="flex flex-col gap-4">
      <div><label class="label !text-[10px]" for="ei_text">Contenido</label><textarea id="ei_text" class="input resize-y" rows="3" maxlength="200" data-input="edProp" data-k="text">${esc(it.text)}</textarea></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="label !text-[10px]" for="ei_start">Inicio (s)</label><input id="ei_start" class="input !min-h-[40px]" type="number" step="0.1" min="0" value="${it.start.toFixed(2)}" data-change="edNum" data-k="start"></div><div><label class="label !text-[10px]" for="ei_dur">Duración (s)</label><input id="ei_dur" class="input !min-h-[40px]" type="number" step="0.1" min="0.3" value="${it.dur.toFixed(2)}" data-change="edNum" data-k="dur"></div></div>
      <div><label class="label !text-[10px]">Posición</label><div class="seg">${[['top', 'Arriba'], ['center', 'Centro'], ['bottom', 'Abajo']].map(([k, l]) => `<button data-action="edTxt" data-k="pos" data-v="${k}" aria-pressed="${it.pos === k}">${l}</button>`).join('')}</div></div>
      <div><label class="label !text-[10px]">Tamaño</label><div class="seg">${[['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']].map(([k, l]) => `<button data-action="edTxt" data-k="size" data-v="${k}" aria-pressed="${it.size === k}">${l}</button>`).join('')}</div></div>
      <div><label class="label !text-[10px]">Animación</label><div class="seg">${[['none', 'Ninguna'], ['fade', 'Fundido'], ['pop', 'Pop']].map(([k, l]) => `<button data-action="edTxt" data-k="anim" data-v="${k}" aria-pressed="${it.anim === k}">${l}</button>`).join('')}</div></div>
      <div class="flex items-center gap-4 flex-wrap"><label class="flex items-center gap-2 text-sm">Color <input type="color" value="${esc(it.color || '#FFFFFF')}" data-input="edProp" data-k="color"></label>
        <label class="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" data-change="edCheck" data-k="bg" ${it.bg ? 'checked' : ''}> Caja de fondo</label>
        ${it.bg ? `<label class="flex items-center gap-2 text-sm">Fondo <input type="color" value="${/^#/.test(it.bgColor || '') ? it.bgColor : '#000000'}" data-input="edProp" data-k="bgColor"></label>` : ''}</div></div>`;
  } else {
    w.innerHTML = head('music', esc(m?.name || 'Audio')) + `<div class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-2"><div><label class="label !text-[10px]" for="ei_start">Inicio</label><input id="ei_start" class="input !min-h-[40px]" type="number" step="0.1" min="0" value="${it.start.toFixed(2)}" data-change="edNum" data-k="start"></div><div><label class="label !text-[10px]" for="ei_in">Entrada</label><input id="ei_in" class="input !min-h-[40px]" type="number" step="0.1" min="0" value="${it.in.toFixed(2)}" data-change="edNum" data-k="in"></div><div><label class="label !text-[10px]" for="ei_out">Salida</label><input id="ei_out" class="input !min-h-[40px]" type="number" step="0.1" min="0" value="${it.out.toFixed(2)}" data-change="edNum" data-k="out"></div></div>
      ${rng('volume', 'Volumen', Math.round((it.volume ?? 1) * 100), 0, 200, 5, '%')}
      ${rng('fadeIn', 'Fundido de entrada', it.fadeIn || 0, 0, 5, .1, 's')}${rng('fadeOut', 'Fundido de salida', it.fadeOut || 0, 0, 5, .1, 's')}
      <button class="btn-ghost btn-sm" data-action="edFitAudio">${ico('move-horizontal', 'w-3.5 h-3.5')}Ajustar al largo del video</button></div>`;
  }
  icons();
}
function edAIPanel() {
  const w = $('#edAI'); if (!w) return;
  const sugg = ['Poné un título grande al inicio que diga “3 errores que te frenan”', 'Recortá cada clip para que dure como máximo 3 segundos', 'Bajá la música al 30% y agregá un fundido de salida de 2 segundos', 'Agregá un llamado a la acción abajo en los últimos 3 segundos', 'Pasá el video a formato vertical 9:16 y subí el contraste de todos los clips'];
  w.innerHTML = `<h2 class="font-semibold flex items-center gap-2">${ico('wand-sparkles', 'w-4 h-4 text-gold')}Asistente de edición</h2>
    <p class="text-xs text-muted mt-1">Pedile cambios en lenguaje natural y la IA los aplica en la línea de tiempo. Podés deshacerlos con Ctrl+Z.</p>
    <form class="mt-3 flex flex-col gap-2" data-form="edAsk"><label class="sr-only" for="edPrompt">Instrucción</label>
      <textarea id="edPrompt" class="input resize-y" rows="3" maxlength="800" placeholder="Ej: cortá el primer clip en el segundo 4, sumá un texto…" ${E.aiBusy ? 'disabled' : ''}></textarea>
      <div class="flex gap-2"><button class="btn-gold flex-1" type="submit" ${E.aiBusy || !AI.ok ? 'disabled' : ''}>${ico(E.aiBusy ? 'loader-circle' : 'sparkles', 'w-4 h-4' + (E.aiBusy ? ' spin' : ''))}${E.aiBusy ? 'Editando…' : 'Aplicar'}</button>${E.aiBusy ? `<button type="button" class="btn-ghost" data-action="aiStop">Detener</button>` : ''}</div></form>
    ${AI.ok ? (AI.tools ? '' : '<p class="text-xs text-down mt-2">Esta vista no permite que la IA edite la línea de tiempo.</p>') : '<p class="text-xs text-dim mt-2">El asistente funciona al abrir la app en claude.ai.</p>'}
    <div class="flex flex-col gap-1.5 mt-3">${sugg.map(s => `<button class="text-left text-xs text-muted hover:text-[var(--gold-light)] px-3 py-2 rounded-xl well" data-action="edSugg">${esc(s)}</button>`).join('')}</div>
    ${E.aiLog.length ? `<div class="mt-3 well p-3 text-xs flex flex-col gap-1 max-h-48 overflow-y-auto" aria-live="polite">${E.aiLog.slice(-14).map(l => `<div class="flex gap-2">${ico(l.ok ? 'check' : l.info ? 'message-square' : 'x', 'w-3.5 h-3.5 shrink-0 ' + (l.ok ? 'text-up' : l.info ? 'text-gold' : 'text-down'))}<span>${esc(l.t)}</span></div>`).join('')}</div>` : ''}`;
  icons();
}

/* ---------- Interacción con la línea de tiempo (arrastrar, recortar, cabezal) ---------- */
document.addEventListener('pointerdown', e => {
  const inner = e.target.closest && e.target.closest('#tlInner'); if (!inner || e.button > 0) return;
  const xToT = ev => (ev.clientX - inner.getBoundingClientRect().left) / E.zoom;
  if (e.target.closest('[data-ruler]') || (!e.target.closest('.tl-clip') && e.target.closest('.tl-track') && e.shiftKey)) {
    if (E.playing) edPause();
    edSeek(xToT(e));
    const mv = ev => edSeek(xToT(ev)), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
  }
  const el = e.target.closest('.tl-clip');
  if (!el) { if (e.target.closest('.tl-track')) { E.sel = null; edTimeline(); edInspector(); } return; }
  e.preventDefault();
  const type = el.dataset.type, id = el.dataset.id, it = findItem(type, id); if (!it) return;
  E.sel = { type, id };
  const mode = e.target.classList.contains('h') ? (e.target.classList.contains('l') ? 'l' : 'r') : 'move';
  const o = JSON.parse(JSON.stringify(it)), x0 = e.clientX, m = mediaById(it.mediaId);
  const maxSrc = m && m.kind !== 'image' ? m.duration : 600;
  const origStart = type === 'video' ? starts()[E.clips.indexOf(it)] : it.start;
  let moved = false, raf = 0;
  const mv = ev => {
    const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 4) return;
    if (!moved) { snap(); moved = true; }
    const ds = dx / E.zoom;
    if (type === 'video') {
      const sp = o.speed || 1;
      if (mode === 'move') { el.style.transform = `translateX(${dx}px)`; el.style.zIndex = 10; el.style.opacity = .85; return; }
      if (mode === 'l') it.in = clamp(o.in + ds * sp, 0, o.out - .2);
      else it.out = clamp(o.out + ds * sp, o.in + .2, maxSrc);
    } else if (type === 'text') {
      if (mode === 'move') it.start = Math.max(0, edSnapT(o.start + ds, id));
      else if (mode === 'l') { const ns = clamp(edSnapT(o.start + ds, id), 0, o.start + o.dur - .3); it.dur = o.dur + (o.start - ns); it.start = ns; }
      else it.dur = Math.max(.3, edSnapT(o.start + o.dur + ds, id) - o.start);
    } else {
      if (mode === 'move') it.start = Math.max(0, edSnapT(o.start + ds, id));
      else if (mode === 'l') { const d = clamp(ds, -o.in, (o.out - o.in) - .2); it.in = o.in + d; it.start = Math.max(0, o.start + d); }
      else it.out = clamp(o.out + ds, o.in + .2, maxSrc);
    }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; edTimeline(); edDraw(); edTransport(); });
  };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (type === 'video' && mode === 'move' && moved) {
      const center = origStart + (ev.clientX - x0) / E.zoom + vDur(it) / 2;
      const others = E.clips.filter(c => c !== it), st = (() => { let t = 0; return others.map(c => { const s = t; t += vDur(c); return s + vDur(c) / 2; }); })();
      let idx = st.findIndex(mid => center < mid); if (idx < 0) idx = others.length;
      others.splice(idx, 0, it); E.clips = others;
    }
    changed();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
  edTimeline(); edInspector();
});
document.addEventListener('keydown', e => {
  if (App.section !== 'editor' || Modal.isOpen || $('#app').hidden) return;
  if (e.target.matches('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  const run = fn => { e.preventDefault(); fn(); };
  if (k === ' ') return run(() => Actions.edPlay());
  if (mod && k === 'z' && !e.shiftKey) return run(() => Actions.edUndo());
  if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return run(() => Actions.edRedo());
  if (mod) return;
  if (k === 's') return run(() => Actions.edSplit());
  if ((k === 'delete' || k === 'backspace') && E.sel) return run(() => Actions.edDel());
  if (k === 'd' && E.sel) return run(() => Actions.edDup());
  if (k === 'm') return run(() => Actions.edMarker());
  if (k === 'arrowleft') return run(() => edSeek(E.time - (e.shiftKey ? 1 : 1 / 30)));
  if (k === 'arrowright') return run(() => edSeek(E.time + (e.shiftKey ? 1 : 1 / 30)));
  if (k === 'home') return run(() => edSeek(0));
});

/* ---------- Acciones ---------- */
const edTry = fn => { try { fn(); } catch (err) { toast(err.message || 'No se pudo aplicar.', { icon: 'circle-alert', error: true }); } };
Actions.edPick = () => $('#edFile').click();
Changes.edFile = el => { edImport(el.files); el.value = ''; };
Actions.edAdd = el => edTry(() => { snap(); const it = edAddToTimeline(el.dataset.id, el.dataset.track); E.sel = { type: el.dataset.track === 'audio' ? 'audio' : 'video', id: it.id }; changed(); });
Actions.edPlay = () => E.playing ? edPause() : edPlay();
Actions.edHome = () => edSeek(0);
Actions.edEnd = () => edSeek(total());
Actions.edAspect = el => { snap(); E.aspect = el.dataset.v; $('#edCanvas').style.aspectRatio = ASPECTS[E.aspect].join('/'); changed(); };
Actions.edSplit = () => edTry(() => { snap(); try { const n = edSplit(); E.sel = { type: n.id[0] === 'a' ? 'audio' : 'video', id: n.id }; } catch (e) { E.history.pop(); throw e; } changed(); });
Actions.edDel = () => { if (!E.sel) return; snap(); edTry(() => edDelete(E.sel.type, E.sel.id)); changed(); };
Actions.edDup = () => { if (!E.sel) return; snap(); edDuplicate(E.sel.type, E.sel.id); changed(); };
Actions.edText = () => { snap(); const t = edAddText(); E.sel = { type: 'text', id: t.id }; changed(); setTimeout(() => $('#ei_text')?.select(), 30); };
Actions.edMarker = () => { snap(); E.markers.push({ id: 'k' + uid(), time: E.time, label: 'M' + (E.markers.length + 1) }); changed({ inspector: false }); };
Actions.edUndo = () => { if (!E.history.length) return; E.future.push(JSON.stringify(project())); restore(E.history.pop()); if (E.sel && !findItem(E.sel.type, E.sel.id)) E.sel = null; changed(); };
Actions.edRedo = () => { if (!E.future.length) return; E.history.push(JSON.stringify(project())); restore(E.future.pop()); changed(); };
Actions.edSnap = () => { E.snapOn = !E.snapOn; edTools(); };
Inputs.edZoom = el => { E.zoom = +el.value; edTimeline(); };
Inputs.edBg = el => { E.bg = el.value; edDraw(); saveProject(); };
Actions.edDeselect = () => { E.sel = null; edTimeline(); edInspector(); };
Actions.edClear = async () => { if (!await confirmBox({ title: '¿Vaciar la línea de tiempo?', text: 'Se quitan todos los clips, textos, audios y marcadores. Podés deshacerlo con Ctrl+Z.', ok: 'Vaciar', danger: true, icon: 'eraser' })) return; snap(); E.clips = []; E.texts = []; E.audios = []; E.markers = []; E.sel = null; edSeek(0); changed(); };
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('[data-input="edProp"], [data-change="edNum"]')) snap(); });
Inputs.edProp = el => {
  const it = E.sel && findItem(E.sel.type, E.sel.id); if (!it) return;
  const k = el.dataset.k; let v = el.type === 'range' ? +el.value : el.value;
  if (k === 'volume') v = v / 100;
  it[k] = v; const lab = $('#eiv_' + k); if (lab) lab.textContent = el.value + (el.dataset.unit || '');
  if (k === 'text') edTimeline(); edDraw(); if (!E.playing) edSync(false); saveProject();
};
Changes.edNum = el => {
  const it = E.sel && findItem(E.sel.type, E.sel.id); if (!it) return;
  const k = el.dataset.k, m = mediaById(it.mediaId), v = Math.max(0, parseFloat(el.value) || 0), max = m && m.kind !== 'image' ? m.duration : 600;
  if (k === 'in') it.in = Math.min(v, it.out - .2); else if (k === 'out') it.out = clamp(v, it.in + .2, max); else if (k === 'dur') it.dur = Math.max(.3, v); else it[k] = v;
  changed();
};
Changes.edCheck = el => { const it = findItem(E.sel.type, E.sel.id); snap(); it[el.dataset.k] = el.checked; changed(); };
Actions.edSpeed = el => { const it = findItem('video', E.sel.id); snap(); it.speed = +el.dataset.v; changed(); };
Actions.edFit = el => { const it = findItem('video', E.sel.id); snap(); it.fit = el.dataset.v; changed(); };
Actions.edTxt = el => { const it = findItem('text', E.sel.id); snap(); it[el.dataset.k] = el.dataset.v; changed(); };
Actions.edMove = el => { const it = findItem('video', E.sel.id), i = E.clips.indexOf(it), j = i + +el.dataset.d; snap(); [E.clips[i], E.clips[j]] = [E.clips[j], E.clips[i]]; changed(); };
Actions.edResetFx = () => { const it = findItem('video', E.sel.id); snap(); Object.assign(it, { b: 100, c: 100, s: 100, fadeIn: 0, fadeOut: 0 }); changed(); };
Actions.edFitAudio = () => { const it = findItem('audio', E.sel.id), m = mediaById(it.mediaId), T = starts().length ? total() : 0; if (!T) return; snap(); it.start = 0; it.in = 0; it.out = Math.min(m.duration, T); it.fadeOut = Math.max(it.fadeOut || 0, 1.5); changed(); };
Actions.edSugg = el => { const p = $('#edPrompt'); p.value = el.textContent; p.focus(); };
Actions.edScriptPick = () => {
  if (!App.scripts.length) return toast('Primero guardá un guion en la biblioteca de Guiones IA.', { icon: 'scroll-text', action: 'Ir', onAction: () => go('guiones') });
  Modal.open(`${modalHead('Importar guion', 'Se crean textos y marcadores por sección')}<div class="p-5 flex flex-col gap-2">${App.scripts.slice().sort((a, b) => b.createdAt - a.createdAt).map(s => `<button class="well p-3 text-left hover:border-[var(--gold-line)]" data-action="edScriptUse" data-id="${s.id}"><div class="font-semibold text-sm">${esc(s.titulo)}</div><div class="text-xs text-dim mt-0.5">${FORMAT_LABEL[s.formato] || ''} · ${s.duracion_texto || fmtDur(s.duracion_segundos)}</div></button>`).join('')}</div>`, { size: 'sm' });
};
Actions.edScriptUse = el => { const s = App.scripts.find(x => x.id === el.dataset.id); Modal.close(); edImportScript(s); };

/* ---------- Exportación (canvas + audio mezclado → MP4/WEBM) ---------- */
let edRec = null, edChunks = [], edCancel = false;
Actions.edExport = () => {
  if (!E.clips.length && !E.texts.length) return toast('No hay nada para exportar todavía.', { icon: 'film' });
  if (E.media.some(m => m.missing && (E.clips.some(c => c.mediaId === m.id) || E.audios.some(a => a.mediaId === m.id)))) return toast('Faltan archivos del proyecto: reimportalos antes de exportar.', { icon: 'folder-open', error: true });
  const cv = $('#edCanvas');
  if (!cv.captureStream || !window.MediaRecorder) return toast('Tu navegador no permite exportar video. Probá con Chrome o Edge.', { icon: 'circle-alert', error: true });
  edPause(); edAudioGraph();
  const stream = cv.captureStream(30);
  if (E.dest) E.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  try { edRec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined); } catch { return toast('No se pudo iniciar la exportación.', { icon: 'circle-alert', error: true }); }
  edChunks = []; edCancel = false;
  edRec.ondataavailable = ev => ev.data.size && edChunks.push(ev.data);
  edRec.onstop = async () => {
    E.exporting = false; E.busy = false; Modal.close();
    if (edCancel) return toast('Exportación cancelada', { icon: 'x' });
    const ext = (edRec.mimeType || mime).includes('mp4') ? 'mp4' : 'webm';
    await saveFile(`video-${dayKey(new Date())}-${E.aspect.replace(':', 'x')}.${ext}`, new Blob(edChunks, { type: edRec.mimeType || mime }));
  };
  Modal.open(`<div class="p-6 md:p-8 flex flex-col gap-4 text-center"><span class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center" style="background:var(--gold-soft);color:var(--gold)">${ico('film', 'w-6 h-6 pulse')}</span>
    <h2 class="font-display text-xl font-semibold">Exportando tu video</h2><p class="text-sm text-muted">Se graba en tiempo real: dejá esta pestaña visible hasta que termine.</p>
    <div class="h-2 rounded-full bg-[#252B38] overflow-hidden"><div id="exBar" class="h-full rounded-full" style="width:0;background:var(--gold-grad)"></div></div><p id="exTxt" class="text-xs text-dim tnum">00:00.0</p>
    <button class="btn-ghost self-center" data-action="edExportCancel">Cancelar</button></div>`, { size: 'sm', label: 'Exportando video' });
  E.exporting = true; E.busy = true; E.time = 0; edSync(false); edDraw();
  setTimeout(() => { edRec.start(250); edPlay(); }, 350);
};
function edFinishExport() { if (edRec && edRec.state !== 'inactive') setTimeout(() => edRec.stop(), 200); }
Actions.edExportCancel = () => { edCancel = true; edPause(); if (edRec && edRec.state !== 'inactive') edRec.stop(); else { E.exporting = false; E.busy = false; Modal.close(); } };

/* ---------- Asistente IA con herramientas sobre la línea de tiempo ---------- */
function edSummary() {
  const st = starts();
  return {
    duracion_total: +total().toFixed(2), formato: E.aspect, cabezal: +E.time.toFixed(2),
    medios: E.media.map(m => ({ id: m.id, nombre: m.name, tipo: m.kind, duracion: +(+m.duration || 0).toFixed(2), falta_archivo: !!m.missing })),
    clips_video: E.clips.map((c, i) => ({ id: c.id, orden: i, inicio: +st[i].toFixed(2), duracion: +vDur(c).toFixed(2), medio: mediaById(c.mediaId)?.name, entrada: +c.in.toFixed(2), salida: +c.out.toFixed(2), velocidad: c.speed || 1, volumen: c.volume ?? 1, brillo: c.b ?? 100, contraste: c.c ?? 100, saturacion: c.s ?? 100, fade_in: c.fadeIn || 0, fade_out: c.fadeOut || 0 })),
    textos: E.texts.map(t => ({ id: t.id, texto: t.text, inicio: +t.start.toFixed(2), duracion: +t.dur.toFixed(2), posicion: t.pos, tamano: t.size, animacion: t.anim })),
    audios: E.audios.map(a => ({ id: a.id, medio: mediaById(a.mediaId)?.name, inicio: +a.start.toFixed(2), duracion: +(a.out - a.in).toFixed(2), volumen: a.volume ?? 1, fade_in: a.fadeIn || 0, fade_out: a.fadeOut || 0 })),
    marcadores: E.markers.map(m => ({ tiempo: +m.time.toFixed(2), etiqueta: m.label })),
  };
}
const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v)) ? d : +v;
function edToolDefs() {
  const log = (t, ok = true) => { E.aiLog.push({ t, ok }); edAIPanel(); };
  const typeOf = id => id?.[0] === 'c' ? 'video' : id?.[0] === 't' ? 'text' : id?.[0] === 'a' ? 'audio' : null;
  const refresh = () => { changed(); };
  const S = (props, req) => ({ type: 'object', properties: props, ...(req ? { required: req } : {}) });
  return [
    { name: 'ver_proyecto', description: 'Devuelve el estado actual de la línea de tiempo (clips, textos, audios, medios importados, marcadores y duración). Usala primero.', execute: () => edSummary() },
    { name: 'agregar_texto', description: 'Agrega un texto superpuesto. Devuelve su id.', inputSchema: S({ texto: { type: 'string' }, inicio: { type: 'number' }, duracion: { type: 'number' }, posicion: { type: 'string', enum: ['top', 'center', 'bottom'] }, tamano: { type: 'string', enum: ['s', 'm', 'l', 'xl'] }, color: { type: 'string', description: 'Hex, ej #FFFFFF' }, caja_fondo: { type: 'boolean' }, animacion: { type: 'string', enum: ['none', 'fade', 'pop'] } }, ['texto']),
      execute: i => { const t = edAddText({ text: String(i.texto).slice(0, 200), start: Math.max(0, num(i.inicio, E.time)), dur: Math.max(.3, num(i.duracion, 3)), pos: i.posicion, size: i.tamano, color: /^#[0-9a-f]{6}$/i.test(i.color || '') ? i.color : undefined, bg: i.caja_fondo, anim: i.animacion }); refresh(); log(`Texto agregado: “${t.text}”`); return { id: t.id }; } },
    { name: 'editar_texto', description: 'Modifica un texto existente por id.', inputSchema: S({ id: { type: 'string' }, texto: { type: 'string' }, inicio: { type: 'number' }, duracion: { type: 'number' }, posicion: { type: 'string', enum: ['top', 'center', 'bottom'] }, tamano: { type: 'string', enum: ['s', 'm', 'l', 'xl'] }, color: { type: 'string' }, animacion: { type: 'string', enum: ['none', 'fade', 'pop'] } }, ['id']),
      execute: i => { const t = findItem('text', String(i.id)); if (!t) throw new Error('No existe ese texto'); if (i.texto != null) t.text = String(i.texto).slice(0, 200); t.start = Math.max(0, num(i.inicio, t.start)); t.dur = Math.max(.3, num(i.duracion, t.dur)); if (i.posicion) t.pos = i.posicion; if (i.tamano) t.size = i.tamano; if (/^#[0-9a-f]{6}$/i.test(i.color || '')) t.color = i.color; if (i.animacion) t.anim = i.animacion; refresh(); log('Texto editado'); return 'ok'; } },
    { name: 'agregar_medio', description: 'Coloca un medio importado en la pista de video (al final o en una posición) o en la de audio (en un tiempo de inicio).', inputSchema: S({ medio_id: { type: 'string' }, pista: { type: 'string', enum: ['video', 'audio'] }, posicion: { type: 'integer' }, inicio: { type: 'number' } }, ['medio_id', 'pista']),
      execute: i => { const it = edAddToTimeline(String(i.medio_id), i.pista, { index: i.posicion != null ? clamp(+i.posicion, 0, E.clips.length) : undefined, start: i.inicio != null ? Math.max(0, +i.inicio) : undefined }); refresh(); log(`Medio agregado a la pista de ${i.pista}`); return { id: it.id }; } },
    { name: 'recortar', description: 'Cambia la duración de un clip de video o audio por id: con "duracion" recorta desde el final; con "entrada"/"salida" fija el tramo del archivo original en segundos.', inputSchema: S({ id: { type: 'string' }, duracion: { type: 'number' }, entrada: { type: 'number' }, salida: { type: 'number' } }, ['id']),
      execute: i => { const ty = typeOf(i.id), it = findItem(ty, String(i.id)); if (!it || ty === 'text') throw new Error('Clip inexistente'); const m = mediaById(it.mediaId), max = m && m.kind !== 'image' ? m.duration : 600, sp = it.speed || 1;
        if (i.entrada != null) it.in = clamp(+i.entrada, 0, it.out - .2); if (i.salida != null) it.out = clamp(+i.salida, it.in + .2, max); if (i.duracion != null) it.out = clamp(it.in + (+i.duracion) * (ty === 'video' ? sp : 1), it.in + .2, max); refresh(); log(`Clip recortado a ${dec(ty === 'video' ? vDur(it) : it.out - it.in)} s`); return 'ok'; } },
    { name: 'cortar_en', description: 'Divide en dos el clip que esté en ese segundo de la línea de tiempo.', inputSchema: S({ tiempo: { type: 'number' } }, ['tiempo']),
      execute: i => { const n = edSplit(+i.tiempo); refresh(); log(`Corte en ${dec(+i.tiempo)} s`); return { nuevo_id: n.id }; } },
    { name: 'eliminar', description: 'Elimina un clip, texto o audio por id.', inputSchema: S({ id: { type: 'string' } }, ['id']),
      execute: i => { edDelete(typeOf(i.id), String(i.id)); refresh(); log('Elemento eliminado'); return 'ok'; } },
    { name: 'mover', description: 'Mueve un clip de video a otra posición (orden, desde 0) o cambia el inicio en segundos de un texto o audio.', inputSchema: S({ id: { type: 'string' }, orden: { type: 'integer' }, inicio: { type: 'number' } }, ['id']),
      execute: i => { const ty = typeOf(i.id), it = findItem(ty, String(i.id)); if (!it) throw new Error('No existe'); if (ty === 'video') { const to = clamp(num(i.orden, 0), 0, E.clips.length - 1); E.clips.splice(E.clips.indexOf(it), 1); E.clips.splice(to, 0, it); } else it.start = Math.max(0, num(i.inicio, it.start)); refresh(); log('Elemento movido'); return 'ok'; } },
    { name: 'ajustar_clip', description: 'Cambia propiedades de un clip de video o audio: volumen (0-2), velocidad (0.5, 1, 1.5, 2; solo video), fade_in y fade_out en segundos, brillo/contraste/saturacion en % (100 = normal; solo video).', inputSchema: S({ id: { type: 'string' }, volumen: { type: 'number' }, velocidad: { type: 'number' }, fade_in: { type: 'number' }, fade_out: { type: 'number' }, brillo: { type: 'number' }, contraste: { type: 'number' }, saturacion: { type: 'number' } }, ['id']),
      execute: i => { const ty = typeOf(i.id), it = findItem(ty, String(i.id)); if (!it || ty === 'text') throw new Error('Clip inexistente');
        if (i.volumen != null) it.volume = clamp(+i.volumen, 0, 2); if (i.fade_in != null) it.fadeIn = clamp(+i.fade_in, 0, 5); if (i.fade_out != null) it.fadeOut = clamp(+i.fade_out, 0, 5);
        if (ty === 'video') { if ([.5, 1, 1.5, 2].includes(+i.velocidad)) it.speed = +i.velocidad; if (i.brillo != null) it.b = clamp(+i.brillo, 40, 180); if (i.contraste != null) it.c = clamp(+i.contraste, 40, 180); if (i.saturacion != null) it.s = clamp(+i.saturacion, 0, 220); }
        refresh(); log('Propiedades ajustadas'); return 'ok'; } },
    { name: 'formato', description: 'Cambia la relación de aspecto del video.', inputSchema: S({ relacion: { type: 'string', enum: Object.keys(ASPECTS) } }, ['relacion']),
      execute: i => { if (!ASPECTS[i.relacion]) throw new Error('Formato inválido'); E.aspect = i.relacion; const cv = $('#edCanvas'); if (cv) cv.style.aspectRatio = ASPECTS[E.aspect].join('/'); refresh(); edTransport(); log('Formato ' + i.relacion); return 'ok'; } },
    { name: 'marcador', description: 'Agrega un marcador con etiqueta en un tiempo.', inputSchema: S({ tiempo: { type: 'number' }, etiqueta: { type: 'string' } }, ['tiempo']),
      execute: i => { E.markers.push({ id: 'k' + uid(), time: Math.max(0, +i.tiempo), label: String(i.etiqueta || 'Marca').slice(0, 30) }); refresh(); log('Marcador agregado'); return 'ok'; } },
  ];
}
Forms.edAsk = async () => {
  const p = $('#edPrompt'), q = p.value.trim(); if (!q) return p.focus();
  if (!AI.ok) return toast('El asistente funciona al abrir la app en claude.ai.', { icon: 'sparkles' });
  if (!AI.tools) return toast(AI.message({ code: 'tools_unavailable' }), { icon: 'circle-alert', error: true });
  snap(); E.aiBusy = true; E.aiLog.push({ t: q, info: true }); edAIPanel(); aiCtl = new AbortController();
  try {
    const tools = edToolDefs().slice(0, AI.limits.tools.maxCount || 11);
    const r = await AI.text(`Sos un editor de video profesional que opera la línea de tiempo de una app usando las herramientas disponibles. Pista de video: clips en secuencia (sin huecos). Pista de texto y de audio: elementos con inicio libre. Los tiempos están en segundos.
Primero llamá a ver_proyecto, después aplicá los cambios pedidos con las herramientas y al final respondé en español, en 1 o 2 frases, qué hiciste. Si algo no se puede hacer (por ejemplo faltan archivos), explicalo.
Pedido del usuario: "${q}"`, { tools, signal: aiCtl.signal });
    const last = r.text.trim().split(/\n\s*\n/).pop();
    E.aiLog.push({ t: last.slice(0, 300), info: true });
    p.value = '';
  } catch (err) { const m = AI.message(err); if (m) { E.aiLog.push({ t: m, ok: false }); toast(m, { icon: 'circle-alert', error: true }); } }
  E.aiBusy = false; aiCtl = null; if (App.section === 'editor') { edAIPanel(); changed(); }
};
