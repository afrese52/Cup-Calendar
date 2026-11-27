import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const URL_VARIABLE = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_VARIABLE = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

function isProjectUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname === '/'
      && url.hostname.includes('.')
      && url.hostname !== 'localhost'
      && !/[\s\\]/.test(value);
  } catch {
    return false;
  }
}

function isPublicKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;

  // Legacy anon JWTs are public client keys too. This is only a structural
  // check, not signature verification or proof of a working Supabase project.
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return false;
  }
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return header !== null && typeof header === 'object'
      && typeof header.alg === 'string' && header.alg.toLowerCase() !== 'none'
      && payload !== null && typeof payload === 'object'
      && payload.role === 'anon';
  } catch {
    return false;
  }
}

export function getBuildConfigurationErrors(env) {
  const errors = [];
  const url = env[URL_VARIABLE]?.trim() ?? '';
  const key = env[KEY_VARIABLE]?.trim() ?? '';

  if (!url) {
    errors.push(`${URL_VARIABLE} fehlt.`);
  } else if (!isProjectUrl(url)) {
    errors.push(`${URL_VARIABLE} muss eine HTTPS-Projektbasis ohne API-Pfad, Zugangsdaten oder Query-Parameter sein.`);
  }
  if (!key) {
    errors.push(`${KEY_VARIABLE} fehlt.`);
  } else if (!isPublicKey(key)) {
    errors.push(`${KEY_VARIABLE} muss ein öffentlicher Publishable-Key oder ein Legacy-JWT mit Rolle anon sein. Service-Role- und Secret-Keys sind nicht erlaubt.`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = getBuildConfigurationErrors(process.env);
  if (errors.length) {
    console.error('[CupCal] Build abgebrochen: öffentliche Supabase-Konfiguration fehlt oder ist ungültig.');
    for (const error of errors) console.error(`- ${error}`);
    console.error('Öffne im Expo-Dashboard Project → Environment variables und ergänze die fehlenden Variablen in der EAS-Umgebung des Profils (preview → preview, production → production). Replit-Servervariablen ersetzen diese Buildwerte nicht. Verwende nur die Supabase-Projektbasis und den öffentlichen Publishable-Key, niemals einen Service-Role- oder Secret-Key. Prüfe die Namen mit eas env:list <preview|production>.');
    process.exitCode = 1;
  } else {
    console.log('[CupCal] Öffentliche Supabase-Buildkonfiguration formal geprüft. Keine Verbindung oder Schlüsselgültigkeit bestätigt.');
  }
}
