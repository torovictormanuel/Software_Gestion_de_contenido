'use strict';
/* =========================================================
   Backend Supabase (se activa si js/config.js tiene URL y clave pública):
   login con email, redes vinculadas por OAuth y telemetría.
   Sin configuración, la app sigue funcionando en modo local.
   ========================================================= */
const SB_LIB = {
  src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js',
  integrity: 'sha384-UagCvVPT5XXA0Hx+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT+39j5VfRjdP5Tp',
};
const appUrl = () => location.origin + location.pathname;

function loadScript({ src, integrity }) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    Object.assign(s, { src, integrity, crossOrigin: 'anonymous', referrerPolicy: 'no-referrer', onload: ok, onerror: () => fail(new Error('No se pudo cargar ' + src)) });
    document.head.appendChild(s);
  });
}

/* "Recordarme": la sesión vive en localStorage; si no, solo en esta pestaña. */
const AuthStorage = {
  remember() { return lsGet('him:remember-pref', true) !== false; },
  getItem(k) { try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; } },
  setItem(k, v) {
    try {
      const [keep, drop] = this.remember() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(k, v); drop.removeItem(k);
    } catch {}
  },
  removeItem(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} },
};

const AUTH_ERRORS = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirmá tu email con el enlace que te enviamos antes de entrar.'],
  [/already registered|already been registered|user already exists/i, 'Ya existe una cuenta con ese email. Iniciá sesión.'],
  [/rate limit|too many|security purposes/i, 'Demasiados intentos. Esperá un momento y probá de nuevo.'],
  [/password should|weak password|at least/i, 'La contraseña no cumple los requisitos de seguridad.'],
  [/same.*password|different from the old/i, 'La nueva contraseña tiene que ser distinta de la actual.'],
];
const authMessage = e => (AUTH_ERRORS.find(([re]) => re.test(e?.message || '')) || [, 'No se pudo completar. Revisá tu conexión e intentá de nuevo.'])[1];

const Cloud = {
  sb: null, user: null,
  social: { loaded: false, loading: false, accounts: [], providers: {}, error: '' },
  get on() { return !!this.sb; },

  async init() {
    const c = window.HIM_CONFIG || {};
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabaseUrl || '') || !c.supabaseKey) return;
    try { if (!window.supabase) await loadScript(SB_LIB); }
    catch (e) { reportError(e, 'supabase-lib'); return; }
    this.sb = supabase.createClient(c.supabaseUrl, c.supabaseKey, {
      auth: { storage: AuthStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    const { data } = await this.sb.auth.getSession();
    this.user = data.session?.user || null;
    this.sb.auth.onAuthStateChange((ev, session) => {
      this.user = session?.user || null;
      if (ev === 'SIGNED_OUT') { this.social = { loaded: false, loading: false, accounts: [], providers: {}, error: '' }; if (!$('#app').hidden) renderAuth('login'); }
    });
    // Errores y eventos de uso → RPC con límite de uso (solo con sesión).
    Telemetry.sink = async (type, e) => {
      if (!this.user) return;
      if (type === 'error') await this.sb.rpc('report_client_error', { p_message: e.message, p_stack: e.stack || null, p_url: e.url || null, p_user_agent: navigator.userAgent.slice(0, 300), p_context: e.context || null });
      else await this.sb.rpc('track_event', { p_name: e.name, p_props: e.props || {}, p_path: e.path || null });
    };
  },

  /** Llama a una Edge Function y traduce el error a un mensaje legible. */
  async fn(name, body) {
    const { data, error } = await this.sb.functions.invoke(name, { body });
    if (error) {
      let detail = {};
      try { detail = await error.context.json(); } catch {}
      const err = new Error(detail.message || detail.error || error.message);
      err.code = detail.error; err.status = error.context?.status;
      throw err;
    }
    return data;
  },

  async loadSocial() {
    if (!this.on || !this.user || this.social.loading) return;
    this.social.loading = true;
    try {
      const [acc, prov] = await Promise.all([
        this.sb.from('my_connections').select('id, provider, label, display_name, avatar_url, is_active, last_error, token_expires_at, created_at').eq('kind', 'social').order('created_at'),
        this.fn('social-auth', { action: 'providers' }).catch(e => { reportError(e, 'social-providers'); return { providers: {} }; }),
      ]);
      if (acc.error) throw acc.error;
      Object.assign(this.social, { accounts: acc.data || [], providers: prov.providers || {}, loaded: true, error: '' });
    } catch (e) {
      reportError(e, 'social-load'); this.social.error = 'No se pudieron cargar tus redes.'; this.social.loaded = true;
    } finally { this.social.loading = false; }
  },

  accountsOf(net) { return this.social.accounts.filter(a => a.provider === net); },
};

/* Mensaje al volver de la autorización de una red (?conn=ok|error&provider=&reason=). */
const CONN_REASONS = {
  denied: 'Cancelaste la autorización.',
  expired_state: 'El enlace de autorización venció. Probá de nuevo.',
  invalid_state: 'La autorización no es válida. Probá de nuevo.',
  not_professional: 'Instagram exige una cuenta profesional (Empresa o Creador). Cambiala desde la app de Instagram y volvé a conectar.',
  no_channel: 'Esa cuenta de Google no tiene un canal de YouTube.',
  exchange_failed: 'La red no confirmó el acceso. Probá de nuevo en unos minutos.',
  save_failed: 'No pudimos guardar la conexión. Probá de nuevo.',
  provider_error: 'La red devolvió un error. Probá de nuevo.',
};
function consumeReturnParams() {
  const q = new URLSearchParams(location.search);
  const conn = q.get('conn'), provider = q.get('provider'), reason = q.get('reason'), recovery = q.get('recovery');
  if (conn || recovery || q.has('code') || q.has('error_description')) {
    ['conn', 'provider', 'reason', 'recovery', 'code', 'error', 'error_code', 'error_description'].forEach(k => q.delete(k));
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
  const name = NET[provider]?.label || 'la red';
  return { recovery: recovery === '1', conn, notice: conn === 'ok' ? { msg: `${name} conectado`, ok: true } : conn === 'error' ? { msg: CONN_REASONS[reason] || `No se pudo conectar ${name}.`, ok: false } : null };
}

/* ---------- Pantallas de acceso con Supabase Auth ---------- */
function cloudAuthForm(mode) {
  const link = (m, t) => `<button type="button" class="text-sm text-gold-light underline underline-offset-4 min-h-[44px]" data-action="authMode" data-mode="${m}">${t}</button>`;
  const email = `<div><label class="label" for="aEmail">Email</label><input id="aEmail" class="input" type="email" autocomplete="email" maxlength="254" data-autofocus></div>`;
  const T = {
    login: ['Iniciar sesión', 'Entrá con tu email y contraseña.'],
    signup: ['Creá tu cuenta', 'Con tu cuenta vas a poder vincular Instagram, TikTok y YouTube.'],
    reset: ['Recuperar contraseña', 'Te enviamos un enlace para elegir una nueva.'],
    newpw: ['Nueva contraseña', 'Elegí una contraseña nueva para tu cuenta.'],
  }[mode];
  return `<div><h2 class="font-display text-2xl md:text-3xl font-semibold">${T[0]}</h2><p class="text-sm text-muted mt-1.5">${T[1]}</p></div>
    ${mode !== 'newpw' ? email : ''}
    ${mode === 'login' ? pwField('aPass', 'Contraseña', 'current-password') + `<label class="flex items-center gap-2.5 text-sm text-muted cursor-pointer min-h-[44px]"><input id="aRemember" type="checkbox" ${AuthStorage.remember() ? 'checked' : ''}> Mantener la sesión iniciada en este dispositivo</label>` : ''}
    ${mode === 'signup' || mode === 'newpw' ? pwField('aPass', mode === 'newpw' ? 'Nueva contraseña' : 'Contraseña', 'new-password', 'data-input="authStrength"') + strengthBar('aStr') + pwField('aPass2', 'Repetir contraseña', 'new-password') : ''}
    ${mode === 'signup' ? `<label class="flex items-start gap-2.5 text-sm text-muted cursor-pointer min-h-[44px]"><input id="aTerms" type="checkbox" class="mt-1"> <span>Acepto los <a href="legal/terminos.html" target="_blank" rel="noopener" class="underline">Términos</a> y la <a href="legal/privacidad.html" target="_blank" rel="noopener" class="underline">Política de privacidad</a>.</span></label>` : ''}
    <p id="aErr" class="err hidden" role="alert"></p>
    <p id="aOk" class="text-sm text-[var(--up)] hidden" role="status"></p>
    <button class="btn-gold w-full" type="submit" id="aBtn">${ico({ login: 'log-in', signup: 'user-plus', reset: 'mail', newpw: 'shield-check' }[mode])}${{ login: 'Entrar', signup: 'Crear cuenta', reset: 'Enviar enlace', newpw: 'Guardar contraseña' }[mode]}</button>
    <div class="flex flex-wrap justify-center gap-x-5">${mode === 'login' ? link('reset', '¿Olvidaste tu contraseña?') + link('signup', 'Crear cuenta') : mode === 'newpw' ? '' : link('login', 'Ya tengo cuenta')}</div>`;
}
Actions.authMode = el => renderAuth(el.dataset.mode);

async function cloudAuthSubmit(mode) {
  const ok = m => { const e = $('#aOk'); e.textContent = m; e.classList.toggle('hidden', !m); };
  const email = ($('#aEmail')?.value || '').trim().toLowerCase(), p = $('#aPass')?.value || '', p2 = $('#aPass2')?.value;
  authErr(''); ok('');
  if (mode !== 'newpw' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return authErr('Ingresá un email válido.');
  if (mode === 'signup' || mode === 'newpw') {
    if (p.length < 8 || pwStrength(p).lvl < 1) return authErr('La contraseña debe tener al menos 8 caracteres y no ser débil.');
    if (p !== p2) return authErr('Las contraseñas no coinciden.');
  }
  if (mode === 'signup' && !$('#aTerms').checked) return authErr('Para crear la cuenta tenés que aceptar los Términos y la Política de privacidad.');
  if (mode === 'login') {
    const lock = Auth.lockState();
    if (lock.until > Date.now()) return authErr(`Demasiados intentos. Esperá ${Math.ceil((lock.until - Date.now()) / 1000)} segundos.`);
    if (!p) return authErr('Ingresá tu contraseña.');
  }
  $('#aBtn').disabled = true;
  try {
    if (mode === 'login') {
      lsSet('him:remember-pref', !!$('#aRemember')?.checked);
      const { error } = await Cloud.sb.auth.signInWithPassword({ email, password: p });
      if (error) { const s = Auth.registerFail(); throw s.until > Date.now() ? new Error('rate limit') : error; }
      Auth.clearFails(); return afterCloudLogin();
    }
    if (mode === 'signup') {
      lsSet('him:remember-pref', true);
      const { data, error } = await Cloud.sb.auth.signUp({ email, password: p, options: { emailRedirectTo: appUrl() } });
      if (error) throw error;
      if (data.session) return afterCloudLogin(true);
      ok('¡Listo! Te enviamos un email para confirmar la cuenta. Abrí el enlace y después iniciá sesión.');
    }
    if (mode === 'reset') {
      const { error } = await Cloud.sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() + '?recovery=1' });
      if (error && !/not found/i.test(error.message)) throw error;
      ok('Si existe una cuenta con ese email, te llegó un enlace para crear una contraseña nueva.');
    }
    if (mode === 'newpw') {
      const { error } = await Cloud.sb.auth.updateUser({ password: p });
      if (error) throw error;
      toast('Contraseña actualizada', { icon: 'shield-check' }); return afterCloudLogin();
    }
  } catch (e) { authErr(authMessage(e)); if (mode === 'login') { $('#aPass').value = ''; $('#aPass').focus(); } }
  $('#aBtn') && ($('#aBtn').disabled = false);
}

async function afterCloudLogin(isNew) {
  if (!App.settings.displayName && Cloud.user?.email) await saveSettings({ displayName: Cloud.user.email.split('@')[0] });
  enterApp();
  if (isNew) toast('Cuenta creada. ¡Bienvenido!', { icon: 'shield-check' });
  Cloud.loadSocial().then(() => App.section === 'conexiones' && renderSection());
}

/* ---------- Redes vinculadas (Conexiones) ---------- */
Actions.socialConnect = async el => {
  const provider = el.dataset.id;
  el.disabled = true;
  try {
    const { url } = await Cloud.fn('social-auth', { action: 'start', provider, redirect_to: appUrl() });
    track('social_connect_start', { provider });
    location.assign(url);
  } catch (e) {
    el.disabled = false;
    toast(e.code === 'not_configured' ? `${NET[provider].label} todavía no está configurado en el servidor.` : e.message || 'No se pudo iniciar la conexión.', { icon: 'circle-alert', error: true });
  }
};
Actions.socialDisconnect = async el => {
  const a = Cloud.social.accounts.find(x => x.id === el.dataset.id); if (!a) return;
  if (!await confirmBox({ title: `¿Desconectar ${esc(a.label)}?`, text: 'Se borran los permisos guardados. Las publicaciones programadas en esta cuenta pasan a borrador.', ok: 'Desconectar', danger: true, icon: 'unlink' })) return;
  try {
    await Cloud.fn('social-auth', { action: 'disconnect', account_id: a.id });
    Cloud.social.accounts = Cloud.social.accounts.filter(x => x.id !== a.id);
    renderSection(); toast('Cuenta desconectada', { icon: 'unlink' });
  } catch (e) { toast(e.code === 'busy' ? 'Hay una publicación en curso en esa cuenta. Probá en unos minutos.' : 'No se pudo desconectar. Probá de nuevo.', { icon: 'circle-alert', error: true }); }
};
