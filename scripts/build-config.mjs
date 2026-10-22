// Genera js/config.js con la configuración PÚBLICA del frontend.
// Lee SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY de las variables de entorno
// (Vercel → Settings → Environment Variables) o de un .env local (ignorado por git).
// Sin valores, genera una configuración vacía y la app funciona en modo local.
// Uso: node scripts/build-config.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();

if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) fail('SUPABASE_URL no tiene el formato https://<ref>.supabase.co');
if (key) {
  // Nunca permitir una clave secreta en código que llega al navegador.
  if (/^sb_secret_/.test(key)) fail('Esa es una clave SECRETA (sb_secret_…). Usá la publishable (sb_publishable_…).');
  if (key.split('.').length === 3) {
    let role = '';
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
    if (role !== 'anon') fail(`Esa clave JWT tiene rol "${role || 'desconocido'}"; solo se admite la anon/publishable.`);
  } else if (!/^sb_publishable_/.test(key)) fail('Formato de clave pública desconocido.');
}

const cfg = url && key ? { supabaseUrl: url, supabaseKey: key } : {};
writeFileSync('js/config.js',
  `// Generado por scripts/build-config.mjs — no editar ni commitear.\n` +
  `// Solo contiene valores públicos (URL del proyecto y clave publishable).\n` +
  `window.HIM_CONFIG = ${JSON.stringify(cfg)};\n`);
console.log(cfg.supabaseUrl ? `js/config.js → ${cfg.supabaseUrl}` : 'js/config.js → modo local (sin Supabase)');

function fail(msg) { console.error('build-config: ' + msg); process.exit(1); }
