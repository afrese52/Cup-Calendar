import { File as ExpoFile } from 'expo-file-system';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import type { SearchConsoleReportItem } from '@workspace/api-client-react';
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

export default function CsvExportTestScreen() {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#080b10' }}>
      <Stack.Screen options={{ title: 'CSV-Export-Test', headerShown: true }} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={{ color: '#f5f7fa', fontSize: 24, fontWeight: '700' }}>
          Nativer CSV-Export-Test
        </Text>
        <Text style={{ color: '#aab3c0', lineHeight: 22 }}>
          Die Testdatei enthält Canonical-Spalten, einen fehlenden Canonical-Wert,
          Umlaute und eine URL mit Sonderzeichen.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="CSV-Testdatei erstellen und teilen"
          testID="native-csv-export-button"
          onPress={() => void exportSample()}
          style={{ backgroundColor: '#d2f52b', borderRadius: 12, padding: 16 }}
        >
          <Text style={{ color: '#10140a', fontWeight: '700', textAlign: 'center' }}>
            CSV-Testdatei erstellen und teilen
          </Text>
        </Pressable>
        {result ? (
          <View testID="native-csv-export-result">
            <Text style={{ color: '#f5f7fa', lineHeight: 22 }}>{result}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
