import { Feather } from '@expo/vector-icons';
import {
  useGetSearchConsoleReport,
  useGetSearchConsoleStatus,
} from '@workspace/api-client-react';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { Stack, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { buildSearchConsoleCsv, type SearchConsoleCsvPeriods } from '@/services/search-console-csv';

const DEFAULT_URL = 'https://cupcal.af-software.app/';

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

function formatDevice(device: string) {
  switch (device) {
    case 'DESKTOP': return 'Computer';
    case 'MOBILE': return 'Mobilgerät';
    case 'TABLET': return 'Tablet';
    default: return device;
  }
}

type CanonicalComparisonState = 'match' | 'different' | 'unavailable';

function compareCanonicals(userCanonical: string | null, googleCanonical: string | null) {
  const website = userCanonical?.trim() || null;
  const google = googleCanonical?.trim() || null;
  const state: CanonicalComparisonState = !website || !google
    ? 'unavailable'
    : website === google
      ? 'match'
      : 'different';
  return { state, website, google };
}

function CanonicalComparison({
  userCanonical,
  googleCanonical,
  colors,
}: {
  userCanonical: string | null;
  googleCanonical: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  const comparison = compareCanonicals(userCanonical, googleCanonical);
  const statusColor = comparison.state === 'match'
    ? colors.success
    : comparison.state === 'different'
      ? colors.warning
      : colors.mutedForeground;
  const statusText = comparison.state === 'match'
    ? 'Canonical-Adressen stimmen überein'
    : comparison.state === 'different'
      ? 'Abweichung: Google verwendet eine andere Canonical-Adresse'
      : 'Vergleich nicht möglich: Canonical-Adresse fehlt';

  return (
    <View style={[styles.canonicalPanel, { backgroundColor: colors.input, borderColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CANONICAL-ADRESSEN</Text>
      <Text style={[styles.canonicalLabel, { color: colors.mutedForeground }]}>Website-Canonical</Text>
      <Text
        selectable
        accessibilityLabel={`Website-Canonical: ${comparison.website ?? 'Nicht verfügbar'}`}
        style={[styles.canonicalUrl, { color: colors.foreground }]}
      >
        {comparison.website ?? 'Nicht verfügbar'}
      </Text>
      <Text style={[styles.canonicalLabel, styles.googleCanonicalLabel, { color: colors.mutedForeground }]}>
        Google-Canonical
      </Text>
      <Text
        selectable
        accessibilityLabel={`Google-Canonical: ${comparison.google ?? 'Nicht verfügbar'}`}
        style={[styles.canonicalUrl, { color: colors.foreground }]}
      >
        {comparison.google ?? 'Nicht verfügbar'}
      </Text>
      <View style={[styles.canonicalStatus, { borderColor: statusColor }]}>
        <Feather
          name={comparison.state === 'match' ? 'check-circle' : comparison.state === 'different' ? 'alert-triangle' : 'info'}
          size={15}
          color={statusColor}
        />
        <Text style={[styles.canonicalStatusText, { color: statusColor }]}>{statusText}</Text>
      </View>
    </View>
  );
}

export default function SearchConsoleScreen() {
  const colors = useColors();
  const router = useRouter();
  const statusQuery = useGetSearchConsoleStatus({
    query: { retry: false },
  });
  const reportMutation = useGetSearchConsoleReport();
  const status = statusQuery.data;
  const statusLoading = statusQuery.isLoading;
  const results = reportMutation.data?.data ?? [];
  const loading = reportMutation.isPending;
  const error = reportMutation.error?.message ?? statusQuery.error?.message ?? null;
  const [urls, setUrls] = useState(DEFAULT_URL);
  const [startDate, setStartDate] = useState(() => defaultDate(28));
  const [endDate, setEndDate] = useState(() => defaultDate(1));
  const [comparisonStartDate, setComparisonStartDate] = useState(() => defaultDate(56));
  const [comparisonEndDate, setComparisonEndDate] = useState(() => defaultDate(29));
  const [loadedPeriods, setLoadedPeriods] = useState<SearchConsoleCsvPeriods | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadReport = async () => {
    if (loading) return;
    reportMutation.reset();
    setLoadedPeriods(null);
    const requestPeriods = {
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
    };
    try {
      await reportMutation.mutateAsync({
        data: {
            urls: urls.split('\n').map((url) => url.trim()).filter(Boolean),
            ...requestPeriods,
        },
      });
      setLoadedPeriods(requestPeriods);
    } catch {
      // React Query exposes the request error to the error notice below.
    }
  };

  const exportReport = async () => {
    const report = reportMutation.data;
    if (!report || !loadedPeriods || exporting) return;

    setExporting(true);
    try {
      const csv = buildSearchConsoleCsv(report.data, loadedPeriods);
      const filename = `cupcal-suchbegriffe-${loadedPeriods.startDate}-${loadedPeriods.endDate}.csv`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new ExpoFile(Paths.cache, filename);
        file.create({ overwrite: true });
        await file.write(csv);
        await Sharing.shareAsync(file.uri, {
          dialogTitle: 'CupCal-Suchbegriffe exportieren',
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text',
        });
      }
    } catch {
      Alert.alert(
        'Export fehlgeschlagen',
        'Der Suchbegriffsbericht konnte nicht als CSV exportiert werden.',
      );
    } finally {
      setExporting(false);
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
          <Text style={[styles.label, { color: colors.foreground }]}>Aktueller Zeitraum</Text>
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
          <Text style={[styles.label, { color: colors.foreground }]}>Vergleichszeitraum</Text>
          <View style={styles.dateRow}>
            <TextInput
              accessibilityLabel="Vergleich Startdatum"
              value={comparisonStartDate}
              onChangeText={setComparisonStartDate}
              placeholder="JJJJ-MM-TT"
              autoCapitalize="none"
              style={[styles.input, styles.dateInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
            />
            <Text style={[styles.dateSeparator, { color: colors.mutedForeground }]}>bis</Text>
            <TextInput
              accessibilityLabel="Vergleich Enddatum"
              value={comparisonEndDate}
              onChangeText={setComparisonEndDate}
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

        {reportMutation.data && loadedPeriods ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Suchbegriffsbericht als CSV exportieren"
            accessibilityState={{ disabled: exporting, busy: exporting }}
            disabled={exporting}
            onPress={() => void exportReport()}
            style={({ pressed }) => [
              styles.exportButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && styles.pressed,
              exporting && styles.disabled,
            ]}
          >
            {exporting
              ? <ActivityIndicator color={colors.primary} />
              : <Feather name="download" size={17} color={colors.primary} />}
            <Text style={[styles.exportButtonText, { color: colors.foreground }]}>
              {exporting ? 'CSV wird vorbereitet …' : 'Suchbegriffsbericht als CSV exportieren'}
            </Text>
          </Pressable>
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
            <CanonicalComparison
              userCanonical={result.indexing.userCanonical}
              googleCanonical={result.indexing.googleCanonical}
              colors={colors}
            />
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>SUCHLEISTUNG IM ZEITRAUM</Text>
            <Text style={[styles.resultValue, { color: colors.foreground }]}>
              {result.performance.clicks} Klicks · {result.performance.impressions} Impressionen
            </Text>
            <Text style={[styles.help, { color: colors.mutedForeground }]}>
              CTR: {(result.performance.ctr * 100).toFixed(1)} % · Ø Position: {result.performance.position?.toFixed(1) ?? '–'}
            </Text>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
              LÄNDER IM ZEITRAUM
            </Text>
            <Text style={[styles.help, { color: colors.mutedForeground }]}>
              Google meldet Länder als ISO-Ländercodes.
            </Text>
            {result.countries.length === 0 ? (
              <Text style={[styles.emptyQueries, { color: colors.mutedForeground }]}>
                Google hat für diese Seite im gewählten Zeitraum keine Länderwerte geliefert.
              </Text>
            ) : (
              <View style={styles.queryList}>
                {result.countries.map((country) => (
                  <View key={country.country} style={[styles.queryRow, { borderColor: colors.border }]}>
                    <Text style={[styles.queryText, { color: colors.foreground }]}>{country.country}</Text>
                    <Text style={[styles.queryMetrics, { color: colors.mutedForeground }]}>
                      {country.clicks} Klicks · {country.impressions} Impressionen · CTR {(country.ctr * 100).toFixed(1)} % · Pos. {country.position?.toFixed(1) ?? '–'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
              GERÄTE IM ZEITRAUM
            </Text>
            {result.devices.length === 0 ? (
              <Text style={[styles.emptyQueries, { color: colors.mutedForeground }]}>
                Google hat für diese Seite im gewählten Zeitraum keine Gerätedaten geliefert.
              </Text>
            ) : (
              <View style={styles.queryList}>
                {result.devices.map((device) => (
                  <View key={device.device} style={[styles.queryRow, { borderColor: colors.border }]}>
                    <Text style={[styles.queryText, { color: colors.foreground }]}>{formatDevice(device.device)}</Text>
                    <Text style={[styles.queryMetrics, { color: colors.mutedForeground }]}>
                      {device.clicks} Klicks · {device.impressions} Impressionen · CTR {(device.ctr * 100).toFixed(1)} % · Pos. {device.position?.toFixed(1) ?? '–'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
              SUCHBEGRIFFE IM ZEITRAUMVERGLEICH
            </Text>
            <Text style={[styles.help, { color: colors.mutedForeground }]}>
              Klicks und Impressionen je Begriff in beiden ausgewählten Zeiträumen. „Neu“ bedeutet, dass der Begriff nur im aktuellen Zeitraum sichtbar ist; „Nicht mehr sichtbar“ bedeutet, dass Google ihn nur im Vergleichszeitraum meldet. Google blendet seltene oder anonymisierte Suchanfragen möglicherweise aus. Die Liste kann daher unvollständig sein.
            </Text>
            {result.queryComparisons.length === 0 ? (
              <Text style={[styles.emptyQueries, { color: colors.mutedForeground }]}>
                Für diese Seite wurden in beiden Zeiträumen keine sichtbaren Suchbegriffe gemeldet.
              </Text>
            ) : (
              <>
                <View style={styles.queryList}>
                  {result.queryComparisons.slice(0, 20).map((comparison) => {
                    const status = comparison.status === 'new'
                      ? 'Neu'
                      : comparison.status === 'not_visible'
                        ? 'Nicht mehr sichtbar'
                        : 'In beiden Zeiträumen';
                    return (
                      <View key={comparison.query} style={[styles.queryRow, { borderColor: colors.border }]}>
                        <Text style={[styles.queryText, { color: colors.foreground }]}>{comparison.query}</Text>
                        <Text style={[styles.queryMetrics, { color: colors.mutedForeground }]}>
                          Aktuell: {comparison.currentClicks ?? '–'} Klicks · {comparison.currentImpressions ?? '–'} Impressionen
                        </Text>
                        <Text style={[styles.queryMetrics, { color: colors.mutedForeground }]}>
                          Vergleich: {comparison.comparisonClicks ?? '–'} Klicks · {comparison.comparisonImpressions ?? '–'} Impressionen
                        </Text>
                        <Text style={[styles.queryMetrics, { color: comparison.status === 'both' ? colors.mutedForeground : colors.primary }]}>
                          {status}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {result.queryComparisons.length > 20 ? (
                  <Text style={[styles.help, { color: colors.mutedForeground }]}>
                    Angezeigt werden die 20 Begriffe mit den meisten Impressionen über beide Zeiträume von insgesamt {result.queryComparisons.length}.
                  </Text>
                ) : null}
              </>
            )}
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
  exportButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 14 },
  exportButtonText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  resultUrl: { fontSize: 13, fontWeight: '700', marginBottom: 18 },
  resultValue: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  canonicalPanel: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  canonicalLabel: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  googleCanonicalLabel: { marginTop: 11 },
  canonicalUrl: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  canonicalStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 9, padding: 9, marginTop: 12 },
  canonicalStatusText: { flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  emptyQueries: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  queryList: { marginTop: 8 },
  queryRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  queryText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  queryMetrics: { fontSize: 11, lineHeight: 16, marginTop: 3 },
});
