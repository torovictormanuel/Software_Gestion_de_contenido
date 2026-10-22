'use strict';
/* =========================================================
   Arranque y delegación global de eventos.
   ========================================================= */
function enterApp() {
  $('#auth').hidden = true; $('#auth').innerHTML = ''; $('#boot').hidden = true; $('#app').hidden = false;
  lastActivity = Date.now();
  const h = location.hash.slice(1);
  go(SECTIONS.some(s => s.id === h) ? h : 'panel');
}

(async function boot() {
  try {
    await Promise.all([Store.init(), AI.init(), Cloud.init().catch(e => reportError(e, 'cloud-init'))]);
    const s = await Store.getDoc('settings');
    if (s) App.settings = { ...DEFAULT_SETTINGS, ...s, notif: { ...DEFAULT_SETTINGS.notif, ...(s.notif || {}) }, links: { ...(s.links || {}) } };
    App.network = App.settings.defaultNet || 'all';
    await Auth.load();
    const [posts, ideas, scripts, carousels, competitors] = await Promise.all(COLS.map(c => Store.list(c)));
    App.userPosts = posts.filter(p => p && p.format && FORMATS[p.format]).map(p => ({ ...p, media: null, img: p.img || PLACEHOLDER }));
    App.ideas = ideas; App.scripts = scripts; App.carousels = carousels; App.competitors = competitors;
    await Editor.load();
  } catch (e) { reportError(e, 'boot'); }
  const ret = consumeReturnParams();
  if (Cloud.on) {
    if (ret.recovery && Cloud.user) renderAuth('newpw');
    else if (Cloud.user) { enterApp(); Cloud.loadSocial().then(() => App.section === 'conexiones' && renderSection()); }
    else renderAuth('login');
  } else if (!Auth.record) renderAuth('create');
  else if (Auth.hasSession()) enterApp();
  else renderAuth('login');
  if (ret.notice) {
    if (Cloud.user && !$('#app').hidden) go('conexiones');
    toast(ret.notice.msg, { icon: ret.notice.ok ? 'check-circle-2' : 'circle-alert', error: !ret.notice.ok });
  }
})();

/* ---------- Clicks ---------- */
document.addEventListener('click', e => {
  if (!e.target.closest('#notifPanel') && !e.target.closest('[data-action="notif"]')) toggleNotif(false);
  if (e.target.matches('[data-overlay]')) return Modal.close();
  if (e.target.matches('[data-drawer]')) return Actions.closeDrawer();
  const t = e.target.closest('[data-action]');
  if (!t || t.disabled) return;
  const fn = Actions[t.dataset.action];
  if (!fn) return;
  if (t.tagName === 'BUTTON' && t.type === 'submit' && t.form) e.preventDefault();
  try { const r = fn(t, e); if (r && r.catch) r.catch(err => console.warn(err)); } catch (err) { console.warn(err); toast('Algo salió mal. Intentá de nuevo.', { icon: 'circle-alert', error: true }); }
});
/* ---------- Formularios, inputs y cambios ---------- */
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  const fn = Forms[f.dataset.form]; if (fn) { const r = fn(f, e); if (r && r.catch) r.catch(err => console.warn(err)); }
});
document.addEventListener('input', e => { const n = e.target.dataset && e.target.dataset.input; if (n && Inputs[n]) Inputs[n](e.target, e); });
document.addEventListener('change', e => { const n = e.target.dataset && e.target.dataset.change; if (n && Changes[n]) Changes[n](e.target, e); });

/* ---------- Teclado ---------- */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (window.Editor && Editor.exporting) return;
    if (Modal.isOpen) return Modal.close();
    if ($('#drawer').innerHTML) return Actions.closeDrawer();
    toggleNotif(false);
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Enter' && e.target.matches('.tl-clip')) { Editor.sel = { type: e.target.dataset.type, id: e.target.dataset.id }; edTimeline(); edInspector(); }
  if (e.key === 'Enter' && e.target.id === 'ideaText') { /* el form envía solo */ }
  // Trampa de foco dentro de modales
  if (e.key === 'Tab' && Modal.isOpen) {
    const f = $$('#modalRoot button:not([disabled]), #modalRoot input:not([disabled]):not(.sr-only):not(.hidden), #modalRoot textarea:not([disabled]), #modalRoot select, #modalRoot a[href], #modalRoot [tabindex="0"]').filter(x => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
});

/* ---------- Arrastrar y soltar archivos ---------- */
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('drag'); } }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return;
  e.preventDefault(); z.classList.remove('drag');
  if (ev !== 'drop' || !e.dataTransfer?.files?.length) return;
  if (z.dataset.drop === 'post') pfFile(e.dataTransfer.files[0]);
  if (z.dataset.drop === 'editor') edImport(e.dataTransfer.files);
}));
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => e.preventDefault());

/* ---------- Imágenes rotas y navegación por hash ---------- */
document.addEventListener('error', e => { const el = e.target; if (el.tagName === 'IMG' && !el.dataset.fb) { el.dataset.fb = '1'; el.src = PLACEHOLDER; } }, true);
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (!$('#app').hidden && h && h !== App.section && SECTIONS.some(s => s.id === h)) go(h); });
addEventListener('load', icons);
