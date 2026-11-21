import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/services/supabase';

const DEFAULT_URL = 'https://cupcal.af-software.app/';

type SearchConsoleResult = {
  url: string;
  indexing: {
    verdict: string | null;
    coverageState: string | null;
    robotsTxtState: string | null;
    indexingState: string | null;
    lastCrawlTime: string | null;
    pageFetchState: string | null;
    googleCanonical: string | null;
    userCanonical: string | null;
  };
  performance: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number | null;
  };
};

type SearchConsoleStatus = {
  configured: boolean;
  property: string;
  serviceAccountEmail: string | null;
};

function formatDate(value: string | null) {
  if (!value) return 'Noch kein Crawl-Zeitpunkt verfügbar';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
      }).format(date);
}

function defaultDate(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function requestAdminApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error('Supabase ist nicht verfügbar. Bitte melde dich erneut an.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Bitte melde dich erneut an.');
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!domain) throw new Error('Die CupCal-API ist in dieser App-Umgebung nicht konfiguriert.');

  let response: Response;
  try {
    response = await fetch(`https://${domain}/api${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${data.session.access_token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('Die Search-Console-API ist nicht erreichbar. Prüfe deine Verbindung.');
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    // A response without JSON is presented as a generic request failure.
  }
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : 'Der Search-Console-Bericht konnte nicht geladen werden.',
    );
  }
  return payload as T;
}

export default function SearchConsoleScreen() {
  const colors = useColors();
  const router = useRouter();
  const [status, setStatus] = useState<SearchConsoleStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [urls, setUrls] = useState(DEFAULT_URL);
  const [startDate, setStartDate] = useState(() => defaultDate(28));
  const [endDate, setEndDate] = useState(() => defaultDate(1));
  const [results, setResults] = useState<SearchConsoleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void requestAdminApi<SearchConsoleStatus>('/v1/admin/search-console/status')
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Zugriff nicht möglich.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadReport = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await requestAdminApi<{ data: SearchConsoleResult[] }>(
        '/v1/admin/search-console/report',
        {
          method: 'POST',
          body: JSON.stringify({
            urls: urls.split('\n').map((url) => url.trim()).filter(Boolean),
            startDate,
            endDate,
          }),
        },
      );
      setResults(data.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Der Bericht konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Google-Suchdaten', headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL · ADMIN</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>Google-Suchdaten</Text>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Indexierungsstatus und Suchleistung direkt aus der Google Search Console. Die Abfrage ist nur lesend.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROPERTY</Text>
          <Text style={[styles.property, { color: colors.foreground }]}>{status?.property ?? DEFAULT_URL}</Text>
          {statusLoading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>Zugriff wird geprüft …</Text>
            </View>
          ) : status?.configured ? (
            <>
              <Text style={[styles.statusText, { color: colors.success }]}>Google-Dienstkonto ist eingerichtet.</Text>
              <Text style={[styles.help, { color: colors.mutedForeground }]}>
                Prüfe, ob {status.serviceAccountEmail} in der Search Console für diese Property freigegeben ist.
              </Text>
            </>
          ) : (
            <Text style={[styles.statusText, { color: colors.warning }]}>
              Google-Dienstkonto und Leseberechtigung für diese Property müssen noch eingerichtet werden. Die Einrichtung ist in der Projektanleitung beschrieben.
            </Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.foreground }]}>Seiten-URLs</Text>
          <Text style={[styles.help, { color: colors.mutedForeground }]}>
            Eine URL pro Zeile, höchstens zehn CupCal-Seiten.
          </Text>
          <TextInput
            accessibilityLabel="Seiten-URLs"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            value={urls}
            onChangeText={setUrls}
            style={[styles.input, styles.urlsInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
          />
          <Text style={[styles.label, { color: colors.foreground }]}>Zeitraum für Suchleistung</Text>
          <View style={styles.dateRow}>
            <TextInput
              accessibilityLabel="Startdatum"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="JJJJ-MM-TT"
              autoCapitalize="none"
              style={[styles.input, styles.dateInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
            />
            <Text style={[styles.dateSeparator, { color: colors.mutedForeground }]}>bis</Text>
            <TextInput
              accessibilityLabel="Enddatum"
              value={endDate}
              onChangeText={setEndDate}
              placeholder="JJJJ-MM-TT"
              autoCapitalize="none"
              style={[styles.input, styles.dateInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Suchdaten abrufen"
            accessibilityState={{ disabled: loading || statusLoading || !status?.configured, busy: loading }}
            disabled={loading || statusLoading || !status?.configured}
            onPress={() => void loadReport()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
              (loading || statusLoading || !status?.configured) && styles.disabled,
            ]}
          >
            {loading
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <Feather name="search" size={17} color={colors.primaryForeground} />}
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {loading ? 'Bericht wird geladen …' : 'Suchdaten abrufen'}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive, borderColor: colors.destructive }]}>
            {error}
          </Text>
        ) : null}

        {results.map((result) => (
          <View key={result.url} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultUrl, { color: colors.foreground }]}>{result.url}</Text>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>INDEXIERUNG</Text>
            <Text style={[styles.resultValue, { color: result.indexing.verdict === 'PASS' ? colors.success : colors.foreground }]}>
              {result.indexing.coverageState ?? result.indexing.verdict ?? 'Kein Indexierungsstatus verfügbar'}
            </Text>
            <Text style={[styles.help, { color: colors.mutedForeground }]}>
              Letzter Crawl: {formatDate(result.indexing.lastCrawlTime)}
            </Text>
            {result.indexing.googleCanonical ? (
              <Text style={[styles.help, { color: colors.mutedForeground }]}>Google-Kanonisch: {result.indexing.googleCanonical}</Text>
            ) : null}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>SUCHLEISTUNG IM ZEITRAUM</Text>
            <Text style={[styles.resultValue, { color: colors.foreground }]}>
              {result.performance.clicks} Klicks · {result.performance.impressions} Impressionen
            </Text>
            <Text style={[styles.help, { color: colors.mutedForeground }]}>
              CTR: {(result.performance.ctr * 100).toFixed(1)} % · Ø Position: {result.performance.position?.toFixed(1) ?? '–'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 36 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 24 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8 },
  heading: { fontSize: 30, fontWeight: '700', letterSpacing: -0.7 },
  intro: { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 22 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  property: { fontSize: 14, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  statusText: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 12 },
  help: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginTop: 8 },
  urlsInput: { minHeight: 78, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { flex: 1, minWidth: 0 },
  dateSeparator: { fontSize: 12, marginTop: 8 },
  primaryButton: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 16 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  resultUrl: { fontSize: 13, fontWeight: '700', marginBottom: 18 },
  resultValue: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
});
