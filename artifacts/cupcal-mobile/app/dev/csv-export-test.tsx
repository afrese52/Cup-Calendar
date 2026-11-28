import { File as ExpoFile } from 'expo-file-system';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SearchConsoleReportItem } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { shareSearchConsoleCsv } from '@/services/share-search-console-csv';

const periods = {
  startDate: '2026-10-25',
  endDate: '2026-11-21',
  comparisonStartDate: '2026-09-27',
  comparisonEndDate: '2026-10-24',
};

const reportItem = {
  url: 'https://cupcal.af-software.app/suche/?q=Größe&seite=1',
  indexing: {
    verdict: null,
    coverageState: null,
    robotsTxtState: null,
    indexingState: null,
    lastCrawlTime: null,
    pageFetchState: null,
    googleCanonical: null,
    userCanonical: 'https://cupcal.af-software.app/suche/',
    canonicalHistory: { firstDetectedAt: null, lastChangedAt: null },
  },
  performance: { clicks: 2, impressions: 19, ctr: 0.105, position: 4.2 },
  queries: [],
  queryComparisons: [{
    query: 'Mädchen & Fortnite Cup',
    currentClicks: 2,
    currentImpressions: 19,
    currentPosition: 4.2,
    comparisonClicks: null,
    comparisonImpressions: null,
    comparisonPosition: null,
    status: 'new',
  }],
  countries: [],
  devices: [],
} satisfies SearchConsoleReportItem;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  description: { lineHeight: 22 },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    padding: 16,
  },
  buttonText: { fontWeight: '700', textAlign: 'center' },
  result: { lineHeight: 22 },
});

export default function CsvExportTestScreen() {
  const colors = useColors();
  const [result, setResult] = useState<string | null>(null);

  const exportSample = async () => {
    setResult(null);
    try {
      const { uri } = await shareSearchConsoleCsv([reportItem], periods);
      const fileContent = await new ExpoFile(uri).text();
      const checks = [
        fileContent.includes('Website-Canonical'),
        fileContent.includes('Google-Canonical'),
        fileContent.includes('Nicht verfügbar'),
        fileContent.includes('Mädchen & Fortnite Cup'),
        fileContent.includes('Größe'),
      ];
      setResult(checks.every(Boolean)
        ? 'Datei geschrieben; Spalten, fehlender Wert, Umlaute und URL geprüft.'
        : 'Datei geschrieben, aber mindestens eine Inhaltsprüfung ist fehlgeschlagen.');
    } catch {
      setResult('Export fehlgeschlagen; Datei oder Teilen-Dialog konnte nicht geöffnet werden.');
    }
  };

  if (!__DEV__) return null;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Nativer CSV-Export-Test
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Die Testdatei enthält Canonical-Spalten, einen fehlenden Canonical-Wert,
          Umlaute und eine URL mit Sonderzeichen.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="CSV-Testdatei erstellen und teilen"
          testID="native-csv-export-button"
          onPress={() => void exportSample()}
          style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            CSV-Testdatei erstellen und teilen
          </Text>
        </Pressable>
        {result ? (
          <View testID="native-csv-export-result">
            <Text style={[styles.result, { color: colors.foreground }]}>{result}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
