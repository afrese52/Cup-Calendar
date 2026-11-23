import { ArrowRight } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  confirmAccountDeletionFromWeb,
  parseAccountDeletionWebCallback,
  requestAccountDeletionWebLink,
} from '../services/account-deletion-web';
import { getCupCalWebSupabase } from '../services/supabase-web';

export function AccountDeletionRequestForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSentTo(null);
    try {
      const client = getCupCalWebSupabase();
      const recipient = await requestAccountDeletionWebLink(client.auth, {
        email,
        password,
        origin: window.location.origin,
      });
      setSentTo(recipient);
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : 'Der Löschlink konnte nicht angefordert werden. Bitte versuche es erneut.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="deletion-form" onSubmit={(event) => void submitRequest(event)}>
      <label htmlFor="deletion-email">E-Mail-Adresse deines CupCal-Kontos</label>
      <input
        id="deletion-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <label htmlFor="deletion-password">Passwort</label>
      <input
        id="deletion-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
      />
      <button className="legal-action" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Anfrage läuft …' : 'Löschbestätigungslink anfordern'}
        {!isSubmitting && <ArrowRight aria-hidden="true" />}
      </button>
      {error && <p className="legal-form-message error-message" role="alert">{error}</p>}
      {sentTo && (
        <p className="legal-form-message success-message" role="status">
          Wenn dein Konto bestätigt werden kann, wurde ein Bestätigungslink an {sentTo} gesendet.
          Das Konto wird erst gelöscht, wenn du den Link in der E-Mail öffnest.
        </p>
      )}
    </form>
  );
}

type ConfirmationState = 'checking' | 'success' | 'error';

export function AccountDeletionConfirmation() {
  const processed = useRef(false);
  const [state, setState] = useState<ConfirmationState>('checking');
  const [message, setMessage] = useState('Deine Bestätigung wird geprüft …');

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const callback = parseAccountDeletionWebCallback(window.location.href);
    window.history.replaceState({}, document.title, window.location.pathname);
    void (async () => {
      try {
        const client = getCupCalWebSupabase();
        await confirmAccountDeletionFromWeb(client.auth, callback, {
          origin: window.location.origin,
        });
        setState('success');
        setMessage('Dein CupCal-Konto und die zugehörigen Favoriten wurden endgültig gelöscht.');
      } catch (confirmationError) {
        setState('error');
        setMessage(confirmationError instanceof Error
          ? confirmationError.message
          : 'Das Konto konnte nicht gelöscht werden. Fordere bitte einen neuen Link an.');
      }
    })();
  }, []);

  return (
    <section className={`legal-confirmation ${state}`} aria-live="polite" role={state === 'error' ? 'alert' : 'status'}>
      <p>{message}</p>
      {state === 'error' && <a href="/konto-loeschen/">Neuen Löschlink anfordern</a>}
      {state === 'success' && <a href="/">Zur CupCal-Website</a>}
    </section>
  );
}
