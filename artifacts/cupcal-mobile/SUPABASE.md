# Supabase-Konfiguration

CupCal initialisiert den gemeinsamen Supabase-Client nur, wenn beide Expo-Variablen gesetzt sind:

- `EXPO_PUBLIC_SUPABASE_URL` — Projekt-URL des Supabase-Projekts
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — öffentlicher Publishable Key

Die Variablen müssen beim Starten des Expo-Entwicklungsservers beziehungsweise beim Erstellen des Web-Bundles verfügbar sein. Falls keine `EXPO_PUBLIC_*`-Variablen gesetzt sind, übernimmt CupCal dafür `SUPABASE_URL` und `SUPABASE_ANON_KEY` aus der Replit-Umgebung. Nach einer Änderung muss der Entwicklungsserver neu gestartet oder das Bundle neu erstellt werden.

Beide Werte werden in den nativen und Web-Client eingebettet und sind öffentlich sichtbar. Verwende hier ausschließlich den Publishable Key, niemals einen Service-Role-Key. Ohne vollständige Konfiguration bleibt die App nutzbar; CupCal gibt eine verständliche Warnung in der Entwicklerkonsole aus. Der Status und die Meldung sind außerdem über `isSupabaseConfigured` und `supabaseConfigurationMessage` aus `services/supabase` verfügbar.

Der Client speichert Auth-Sitzungen über AsyncStorage, erneuert sie im Web automatisch und startet beziehungsweise pausiert die Erneuerung auf nativen Geräten passend zum App-Status.
