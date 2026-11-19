import { Feather } from '@expo/vector-icons';
import {
  getGetAdminImportHistoryQueryKey,
  getGetEventsQueryKey,
  useGetAdminImportAccess,
  useGetAdminImportHistory,
  useImportMhtSchedule,
  usePreviewMhtImport,
} from '@workspace/api-client-react';
import type { MhtImportPreview, MhtImportResult, PreviewMhtImportParams } from '@workspace/api-client-react';
import { File as ExpoFile } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { watchAuthSession } from '@/services/accountAuth';
import { supabase } from '@/services/supabase';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const IMPORT_REGIONS = ['EU', 'NAE', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME', 'GLOBAL'] as const;
type ImportRegion = NonNullable<PreviewMhtImportParams['region']>;

type PickedImportSource = {
  name: string;
  uri: string;
  size: number | null | undefined;
  readText: () => Promise<string | undefined>;
};

type ImportHistoryCounts = {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedWarningCount?: number | null;
  skippedPastCount?: number | null;
  skippedInvalidCount?: number | null;
};

function importHistoryAccessibilityLabel(entry: ImportHistoryCounts) {
  const totals = `Neu: ${entry.insertedCount}. Aktualisiert: ${entry.updatedCount}. Übersprungen insgesamt: ${entry.skippedCount}.`;
  if (
    entry.skippedWarningCount == null
    || entry.skippedPastCount == null
    || entry.skippedInvalidCount == null
  ) {
    return `${totals} Für diesen älteren Eintrag ist keine Aufschlüsselung gespeichert.`;
  }

  return `${totals} Unklare Zuordnung: ${entry.skippedWarningCount}. Vergangene Termine: ${entry.skippedPastCount}. Fehlerhafte Karten: ${entry.skippedInvalidCount}.`;
}

function getUtf8ByteLength(value: string) {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    byteLength += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (byteLength > MAX_FILE_BYTES) return byteLength;
  }
  return byteLength;
}

function formatImportTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

function formatSnapshotAge(ageMs: number | null) {
  if (ageMs === null) return 'Alter nicht bestimmbar';
  if (ageMs < 0) return 'Zeitstempel liegt in der Zukunft';

  const totalMinutes = Math.floor(ageMs / (60 * 1000));
  if (totalMinutes < 1) return 'weniger als 1 Minute';
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}${hours > 0 ? ` und ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}` : ''}`;
  }
  if (totalHours > 0) return `vor ${totalHours} ${totalHours === 1 ? 'Stunde' : 'Stunden'}`;
  return `vor ${totalMinutes} ${totalMinutes === 1 ? 'Minute' : 'Minuten'}`;
}

function parseDateInput(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

function formatDateInput(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function dateRangeFromInputs(startText: string, endText: string) {
  const startDate = parseDateInput(startText);
  const endDate = parseDateInput(endText);
  if (!startText.trim() && !endText.trim()) return { range: null, error: null };
  if (!startDate || !endDate) {
    return { range: null, error: 'Bitte gib beide Daten gültig im Format TT.MM.JJJJ ein.' };
  }
  if (startDate > endDate) {
    return { range: null, error: 'Das Startdatum darf nicht nach dem Enddatum liegen.' };
  }
  return { range: { startDate, endDate }, error: null };
}

function hasPreviewChanges(event: MhtImportPreview['events'][number]) {
  return Boolean(
    event.previousStartTime
    || event.previousEndTime
    || event.previousTitle
    || event.previousGameMode
    || event.previousTeamFormat
    || event.previousTournamentType
    || event.previousCategory,
  );
}

function resultCopy(result: MhtImportResult) {
  return `${result.importedCount} Termine gespeichert: ${result.insertedCount} neu, ${result.updatedCount} aktualisiert. ${result.skippedWarningCount} mit unklarer Zuordnung, ${result.skippedPastCount} vergangene Termine und ${result.skippedInvalidCount} fehlerhafte Karten wurden übersprungen.`;
}

export default function AdminImportScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(supabase));
  const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;

    return watchAuthSession(supabase.auth, {
      onSession: (session) => {
        setAccessToken(session?.access_token ?? null);
        setSessionCheckError(null);
      },
      onError: () => {
        setSessionCheckError('Die Sitzung konnte nicht geladen werden. Bitte melde dich erneut an.');
      },
      onReady: () => setIsCheckingSession(false),
    });
  }, []);

  const authRequest = accessToken
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : undefined;
  const accessQuery = useGetAdminImportAccess({
    query: { enabled: Boolean(supabase && accessToken && !isCheckingSession), retry: false },
    request: authRequest,
  });
  const historyQuery = useGetAdminImportHistory({
    query: {
      enabled: Boolean(supabase && accessToken && !isCheckingSession && accessQuery.data?.authorized),
      retry: false,
    },
    request: authRequest,
  });
  const previewMutation = usePreviewMhtImport({ request: authRequest });
  const importMutation = useImportMhtSchedule({ request: authRequest });
  const [pickedFile, setPickedFile] = useState<{ name: string; content: string; format: 'ics' | 'mht' } | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<ImportRegion>('EU');
  const [preview, setPreview] = useState<MhtImportPreview | null>(null);
  const [importResult, setImportResult] = useState<MhtImportResult | null>(null);
  const [startDateText, setStartDateText] = useState('');
  const [endDateText, setEndDateText] = useState('');
  const [showOnlyChangedEvents, setShowOnlyChangedEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = async () => {
    setError(null);
    try {
      let selection: PickedImportSource | null = null;
      let canceled = false;

      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: Platform.OS !== 'android',
        multiple: false,
      });
      canceled = picked.canceled;
      const asset = picked.canceled ? null : picked.assets[0];
      if (asset) {
        selection = {
          name: asset.name,
          uri: asset.uri,
          size: asset.size
            ?? (Platform.OS === 'web'
              ? asset.file?.size
              : Platform.OS === 'ios'
                ? new ExpoFile(asset.uri).size
                : undefined),
          readText: () => {
            if (Platform.OS === 'web') return asset.file?.text() ?? Promise.resolve(undefined);
            return new ExpoFile(asset.uri).text();
          },
        };
      }

      if (canceled) {
        setError(pickedFile
          ? 'Dateiauswahl abgebrochen. Die zuvor ausgewählte Datei bleibt erhalten.'
          : 'Dateiauswahl abgebrochen. Du kannst jederzeit erneut eine Datei auswählen.');
        return;
      }

      if (!selection) {
        setPickedFile(null);
        setPreview(null);
        setError('Es wurde keine Datei bereitgestellt. Bitte wähle sie erneut aus.');
        return;
      }
      const format = /\.ics$/i.test(selection.name)
        ? 'ics'
        : /\.(mht|mhtml)$/i.test(selection.name)
          ? 'mht'
          : null;
      if (!format) {
        setPickedFile(null);
        setPreview(null);
        setError('Bitte wähle eine MHT-, MHTML- oder ICS-Datei aus.');
        return;
      }
      if (!selection.uri) {
        setPickedFile(null);
        setPreview(null);
        setError('Die Datei ist nicht mehr verfügbar. Bitte wähle sie erneut aus.');
        return;
      }
      const fileSize = selection.size;
      if (fileSize != null && fileSize > MAX_FILE_BYTES) {
        setPickedFile(null);
        setPreview(null);
        setError('Die Datei ist größer als 25 MB. Bitte wähle eine kleinere Datei aus.');
        return;
      }

      const content = await selection.readText();
      if (content === undefined) {
        throw new Error('Die Datei konnte nicht gelesen werden.');
      }
      if (fileSize == null && getUtf8ByteLength(content) > MAX_FILE_BYTES) {
        setPickedFile(null);
        setPreview(null);
        setError('Die Datei ist größer als 25 MB. Bitte wähle eine kleinere Datei aus.');
        return;
      }
      if (!content.trim()) {
        setPickedFile(null);
        setPreview(null);
        setError('Die ausgewählte Datei ist leer.');
        return;
      }
      setPickedFile({ name: selection.name, content, format });
      setPreview(null);
      setImportResult(null);
      setStartDateText('');
      setEndDateText('');
    } catch (pickError) {
      setError('Die Datei konnte nicht gelesen werden. Bitte prüfe, ob sie noch verfügbar ist, und wähle sie erneut aus.');
    }
  };

  function getImportParams(range?: { startDate: string; endDate: string }): PreviewMhtImportParams | undefined {
    const params = {
      ...(range ?? {}),
      ...(pickedFile?.format === 'ics' ? { region: selectedRegion } : {}),
    };
    return Object.keys(params).length ? params : undefined;
  }

  const checkFile = async () => {
    if (!pickedFile) return;
    setError(null);
    const { range, error: rangeError } = dateRangeFromInputs(startDateText, endDateText);
    if (rangeError) {
      setError(rangeError);
      return;
    }
    if (preview && !range) {
      setError('Bitte wähle einen Start- und Endtag für den Importzeitraum aus.');
      return;
    }
    setPreview(null);
    try {
      const result = await previewMutation.mutateAsync({
        data: pickedFile.content,
        params: getImportParams(range ?? undefined),
      });
      setPreview(result);
      setStartDateText(formatDateInput(result.startDate));
      setEndDateText(formatDateInput(result.endDate));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Die Datei konnte nicht geprüft werden.');
    }
  };

  function showImportConfirmation(currentPreview: MhtImportPreview) {
    const periodCopy = currentPreview.startDate && currentPreview.endDate
      ? ` Zeitraum: ${formatDateInput(currentPreview.startDate)} bis ${formatDateInput(currentPreview.endDate)}.`
      : '';
    const standardValueCount = currentPreview.events.filter((event) => (event.reviewNotes?.length ?? 0) > 0).length;
    const standardValueCopy = standardValueCount === 1
      ? '1 Termin enthält automatisch gesetzte Standardwerte und wird mit Hinweis importiert. '
      : standardValueCount > 1
        ? `${standardValueCount} Termine enthalten automatisch gesetzte Standardwerte und werden mit Hinweis importiert. `
        : '';
    const message =
      `${currentPreview.importableCount} geprüfte Termine importieren.${periodCopy} ` +
      `${currentPreview.warningCount} Termine mit Zuordnungswarnungen bleiben ausgelassen. ` +
      standardValueCopy +
      `${currentPreview.outOfRangeCount} Termine außerhalb der Spanne bleiben unverändert. ` +
      `${currentPreview.updateCount} vorhandene Einträge werden aktualisiert; persönliche Admin-Notizen bleiben erhalten.` +
      (currentPreview.isSnapshotStale
        ? ' Achtung: Der Snapshot ist inzwischen älter als 24 Stunden. Prüfe eine aktuelle Datei oder bestätige ausdrücklich den Import dieser veralteten Vorschau.'
        : '');
    const confirmedStaleSnapshot = currentPreview.isSnapshotStale;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void saveImport(confirmedStaleSnapshot, currentPreview);
      return;
    }
    Alert.alert(confirmedStaleSnapshot ? 'Veralteten Spielplan importieren?' : 'Termine importieren?', message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Importieren', onPress: () => void saveImport(confirmedStaleSnapshot, currentPreview) },
    ]);
  }

  async function saveImport(staleSnapshotWasConfirmed: boolean, reviewedPreview: MhtImportPreview) {
    if (!pickedFile || reviewedPreview.importableCount === 0) return;
    setError(null);
    const range = reviewedPreview.startDate && reviewedPreview.endDate
      ? { startDate: reviewedPreview.startDate, endDate: reviewedPreview.endDate }
      : undefined;
    try {
      const currentPreview = await previewMutation.mutateAsync({
        data: pickedFile.content,
        params: getImportParams(range),
      });
      setPreview(currentPreview);
      if (currentPreview.importableCount === 0) {
        setError('Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren.');
        return;
      }
      if (currentPreview.isSnapshotStale && !staleSnapshotWasConfirmed) {
        showImportConfirmation(currentPreview);
        return;
      }

      const result = await importMutation.mutateAsync({
        data: pickedFile.content,
        params: {
          ...getImportParams(range),
          confirmStaleSnapshot: currentPreview.isSnapshotStale,
        },
      });
      setImportResult(result);
      setPreview(null);
      setPickedFile(null);
      await queryClient.invalidateQueries({ queryKey: getGetEventsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetAdminImportHistoryQueryKey() });
    } catch (importError) {
      if (
        importError &&
        typeof importError === 'object' &&
        'status' in importError &&
        importError.status === 409 &&
        pickedFile
      ) {
        try {
          const currentPreview = await previewMutation.mutateAsync({
            data: pickedFile.content,
            params: getImportParams(range),
          });
          setPreview(currentPreview);
          if (currentPreview.isSnapshotStale) {
            showImportConfirmation(currentPreview);
            return;
          }
        } catch {
          // Fall through to the import error when the preview cannot be refreshed.
        }
      }
      setError(importError instanceof Error ? importError.message : 'Der Import ist fehlgeschlagen.');
    }
  }

  async function confirmImport() {
    if (!pickedFile || !preview) return;
    setError(null);
    const { range, error: rangeError } = dateRangeFromInputs(startDateText, endDateText);
    if (rangeError || !range) {
      setError(rangeError ?? 'Bitte wähle einen Start- und Endtag für den Importzeitraum aus.');
      return;
    }
    try {
      const currentPreview = await previewMutation.mutateAsync({
        data: pickedFile.content,
        params: getImportParams(range),
      });
      setPreview(currentPreview);
      if (currentPreview.importableCount === 0) {
        setError('Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren.');
        return;
      }
      setStartDateText(formatDateInput(currentPreview.startDate));
      setEndDateText(formatDateInput(currentPreview.endDate));
      showImportConfirmation(currentPreview);
    } catch {
      setError('Die Vorschau konnte vor der Bestätigung nicht aktualisiert werden. Bitte prüfe deine Verbindung und versuche es erneut.');
    }
  }

  const isAuthorized = accessQuery.data?.authorized === true;
  const busy = previewMutation.isPending || importMutation.isPending;
  const isCheckingAccess = isCheckingSession || (Boolean(accessToken) && accessQuery.isLoading);
  const { range: selectedDateRange, error: dateRangeError } = dateRangeFromInputs(startDateText, endDateText);
  const previewIsCurrent = Boolean(
    preview
    && selectedDateRange
    && preview.startDate === selectedDateRange.startDate
    && preview.endDate === selectedDateRange.endDate,
  );
  const changedPreviewEvents = preview?.events.filter(hasPreviewChanges) ?? [];
  const visiblePreviewEvents = preview
    ? showOnlyChangedEvents
      ? changedPreviewEvents
      : preview.events
    : [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 12, paddingBottom: Platform.OS === 'web' ? 100 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          testID="import-back-button"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/settings');
          }}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Zurück</Text>
        </Pressable>

        <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL · ADMIN</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>Termine importieren</Text>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Lade einen gespeicherten Spielplan als MHT-, MHTML- oder ICS-Datei hoch. Vor dem Speichern siehst du neue, aktualisierte und nicht eindeutig zuordenbare Einträge.
        </Text>

        {isCheckingAccess ? (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Importfreigabe wird geprüft …</Text>
          </View>
        ) : !supabase ? (
          <View style={[styles.notice, styles.errorNotice, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Feather name="lock" size={18} color={colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>Supabase ist nicht konfiguriert. Eine Anmeldung ist für den Import erforderlich.</Text>
          </View>
        ) : !accessToken ? (
          <View style={[styles.notice, styles.errorNotice, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Feather name="lock" size={18} color={colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>
              {sessionCheckError ?? 'Bitte melde dich zuerst in CupCal an und öffne den Import anschließend erneut.'}
            </Text>
          </View>
        ) : accessQuery.isError ? (
          <View style={[styles.notice, styles.errorNotice, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Feather name="lock" size={18} color={colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>
              Die Sitzung konnte nicht für den Import geprüft werden. Bitte melde dich erneut an und versuche es noch einmal.
            </Text>
          </View>
        ) : !isAuthorized ? (
          <View style={[styles.notice, styles.errorNotice, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Feather name="shield" size={18} color={colors.destructive} />
            <View style={styles.noticeCopy}>
              <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Kein Importzugriff</Text>
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                {accessQuery.data?.reason === 'not_configured'
                  ? 'Auf dem API-Server ist noch keine Admin-Freigabeliste gesetzt. Trage dort CUPCAL_IMPORT_ADMIN_EMAILS mit den freigegebenen Konto-E-Mail-Adressen ein.'
                  : 'Dieses Konto ist nicht für den Import freigegeben. Wende dich an die CupCal-Administration.'}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.uploadIcon, { backgroundColor: colors.accent }]}>
                <Feather name="file-plus" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Spielplan-Datei</Text>
              <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>
                MHT, MHTML oder ICS · maximal 25 MB · ICS-Zeitzonen werden beachtet
              </Text>
              {pickedFile?.format === 'ics' ? (
                <View style={styles.regionPicker}>
                  <Text style={[styles.regionLabel, { color: colors.mutedForeground }]}>Region dieser ICS-Datei</Text>
                  <View style={styles.regionOptions}>
                    {IMPORT_REGIONS.map((region) => (
                      <Pressable
                        key={region}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selectedRegion === region }}
                        testID={`import-region-${region}`}
                        onPress={() => {
                          setSelectedRegion(region);
                          setPreview(null);
                        }}
                        style={[
                          styles.regionOption,
                          {
                            borderColor: selectedRegion === region ? colors.primary : colors.border,
                            backgroundColor: selectedRegion === region ? colors.accent : colors.card,
                          },
                        ]}
                      >
                        <Text style={[styles.regionOptionText, { color: colors.foreground }]}>{region}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                testID="choose-import-file-button"
                onPress={() => void chooseFile()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border },
                  pressed && !busy ? styles.pressed : null,
                  busy ? styles.disabled : null,
                ]}
              >
                <Feather name="folder" size={16} color={colors.foreground} />
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                  {pickedFile ? 'Andere Datei auswählen' : 'Datei auswählen'}
                </Text>
              </Pressable>
              {pickedFile ? (
                <View style={[styles.fileBadge, { backgroundColor: colors.secondary }]}>
                  <Feather name="file-text" size={15} color={colors.primary} />
                  <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{pickedFile.name}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                testID="preview-import-file-button"
                onPress={() => void checkFile()}
                disabled={!pickedFile || busy}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                  pressed && pickedFile && !busy ? styles.pressed : null,
                  !pickedFile || busy ? styles.disabled : null,
                ]}
              >
                {previewMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="search" size={16} color={colors.primaryForeground} />
                )}
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                  {previewMutation.isPending
                    ? 'Vorschau wird geprüft …'
                    : preview
                      ? 'Vorschau aktualisieren'
                      : 'Datei prüfen'}
                </Text>
              </Pressable>
            </View>

            {error ? (
              <View style={[styles.messageBox, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive }]}>
                <Feather name="alert-circle" size={17} color={colors.destructive} />
                <Text accessibilityRole="alert" style={[styles.messageText, { color: colors.foreground }]}>{error}</Text>
              </View>
            ) : null}

            {preview ? (
              <>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Importzeitraum auswählen</Text>
                  <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>
                    Es zählen die Starttage in der Zeitzone {preview.timeZone}. Beide Tage sind eingeschlossen.
                  </Text>
                  <View style={styles.dateFields}>
                    <View style={styles.dateField}>
                      <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>Von</Text>
                      <TextInput
                        accessibilityLabel="Import ab Datum"
                        testID="import-start-date"
                        value={startDateText}
                        onChangeText={setStartDateText}
                        placeholder="TT.MM.JJJJ"
                        keyboardType="numbers-and-punctuation"
                        maxLength={10}
                        editable={!busy}
                        style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]}
                      />
                    </View>
                    <View style={styles.dateField}>
                      <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>Bis</Text>
                      <TextInput
                        accessibilityLabel="Import bis Datum"
                        testID="import-end-date"
                        value={endDateText}
                        onChangeText={setEndDateText}
                        placeholder="TT.MM.JJJJ"
                        keyboardType="numbers-and-punctuation"
                        maxLength={10}
                        editable={!busy}
                        style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]}
                      />
                    </View>
                  </View>
                  {dateRangeError ? (
                    <Text accessibilityRole="alert" style={[styles.detailCopy, { color: colors.destructive }]}>
                      {dateRangeError}
                    </Text>
                  ) : !previewIsCurrent ? (
                    <Text accessibilityRole="alert" style={[styles.detailCopy, { color: colors.warning }]}>
                      Die angezeigten Zahlen gehören noch zur vorherigen Spanne. Aktualisiere die Vorschau vor der Bestätigung.
                    </Text>
                  ) : null}
                </View>

                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Prüfergebnis</Text>
                  <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>
                    {preview.region} · Snapshot {preview.snapshotAt
                      ? formatImportTime(preview.snapshotAt, preview.timeZone)
                      : 'ohne Zeitstempel'}
                    {' · '}{formatSnapshotAge(preview.snapshotAgeMs)}
                  </Text>
                  {preview.snapshotAt === null || preview.snapshotAgeMs === null || preview.snapshotAgeMs < 0 || preview.isSnapshotStale ? (
                    <View
                      accessibilityRole="alert"
                      testID="snapshot-age-warning"
                      style={[styles.messageBox, styles.snapshotWarning, { backgroundColor: colors.warning + '18', borderColor: colors.warning }]}
                    >
                      <Feather name="alert-triangle" size={17} color={colors.warning} />
                      <Text style={[styles.messageText, { color: colors.foreground }]}>
                        {preview.isSnapshotStale
                          ? 'Dieser Spielplan ist älter als 24 Stunden. Prüfe auf Fortnite eine aktuelle Version und lade sie erneut, bevor du speicherst.'
                          : preview.snapshotAt === null || preview.snapshotAgeMs === null
                            ? 'Das Alter des Spielplans ist nicht bestimmbar. Prüfe die Datei vor dem Import.'
                            : 'Der Snapshot-Zeitpunkt liegt in der Zukunft. Prüfe die Datei vor dem Import.'}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.periodCopy, { color: colors.foreground }]}>
                    Importzeitraum:{' '}
                    {startDateText && endDateText
                      ? `${startDateText} bis ${endDateText}`
                      : 'bitte Start- und Enddatum eingeben'}
                  </Text>
                  <View style={styles.stats}>
                    <Stat value={preview.importableCount} label="importierbar" color={colors.primary} />
                    <Stat value={preview.newCount} label="neu" color={colors.success} />
                    <Stat value={preview.updateCount} label="aktualisiert" color={colors.categoryLeague} />
                    <Stat value={preview.warningCount} label="Warnungen" color={colors.warning} />
                  </View>
                  <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                    Vergangene Termine und Termine mit nicht auflösbaren Zuordnungen werden nicht gespeichert. Automatisch gesetzte Standardwerte sind in der Terminliste markiert und werden mit importiert.
                  </Text>
                  {preview.sourceUrl ? (
                    <Text numberOfLines={2} style={[styles.sourceCopy, { color: colors.mutedForeground }]}>{preview.sourceUrl}</Text>
                  ) : null}
                </View>

                  {previewIsCurrent ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vorschautermine</Text>
                    <Text
                      testID="import-event-count-summary"
                      style={[styles.cardCopy, { color: colors.mutedForeground }]}
                    >
                      {preview.events.length} {preview.events.length === 1 ? 'Termin' : 'Termine'}
                      {' · '}{changedPreviewEvents.length} geändert
                    </Text>
                    <View style={[styles.eventFilter, { backgroundColor: colors.secondary }]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Alle Vorschautermine, ${preview.events.length}`}
                        accessibilityState={{ selected: !showOnlyChangedEvents }}
                        testID="import-event-filter-all"
                        onPress={() => setShowOnlyChangedEvents(false)}
                        style={[
                          styles.eventFilterButton,
                          !showOnlyChangedEvents ? { backgroundColor: colors.card } : null,
                        ]}
                      >
                        <Text style={[
                          styles.eventFilterText,
                          { color: !showOnlyChangedEvents ? colors.foreground : colors.mutedForeground },
                        ]}>
                          Alle ({preview.events.length})
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Nur geänderte Termine, ${changedPreviewEvents.length}`}
                        accessibilityState={{ selected: showOnlyChangedEvents }}
                        testID="import-event-filter-changed"
                        onPress={() => setShowOnlyChangedEvents(true)}
                        style={[
                          styles.eventFilterButton,
                          showOnlyChangedEvents ? { backgroundColor: colors.card } : null,
                        ]}
                      >
                        <Text style={[
                          styles.eventFilterText,
                          { color: showOnlyChangedEvents ? colors.foreground : colors.mutedForeground },
                        ]}>
                          Geändert ({changedPreviewEvents.length})
                        </Text>
                      </Pressable>
                    </View>
                    {visiblePreviewEvents.map((event) => {
                      const reviewNotes = event.reviewNotes ?? [];
                      const hasWarnings = event.warnings.length > 0 || reviewNotes.length > 0;
                      return (
                        <View key={event.id} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
                          <View style={styles.eventCopy}>
                            <Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text>
                            <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>
                              {event.region ?? preview.region} · {formatImportTime(event.startTime, preview.timeZone)} · {event.teamFormat} · {event.gameRuleset ?? event.gameMode}
                              {event.tournamentSeries ? ` · ${event.tournamentSeries}` : ''}
                            </Text>
                            {event.previousTitle
                              || event.previousGameMode
                              || event.previousGameRuleset
                              || event.previousTournamentSeries
                              || event.previousTeamFormat
                              || event.previousTournamentType
                              || event.previousCategory ? (
                                <Text
                                  testID={`event-detail-changes-${event.id}`}
                                  style={[styles.timeChangeText, { color: colors.categoryLeague }]}
                                >
                                  Details geändert:
                                  {event.previousTitle ? ` Titel „${event.previousTitle}“ → „${event.title}“` : ''}
                                  {event.previousTeamFormat ? ` Spielformat ${event.previousTeamFormat} → ${event.teamFormat}` : ''}
                                  {event.previousGameMode ? ` Spielmodus ${event.previousGameMode} → ${event.gameMode}` : ''}
                                  {event.previousGameRuleset
                                    ? ` Regelwerk ${event.previousGameRuleset} → ${event.gameRuleset ?? 'unbekannt'}`
                                    : ''}
                                  {event.previousTournamentSeries
                                    ? ` Turnierserie ${event.previousTournamentSeries} → ${event.tournamentSeries ?? 'keine'}`
                                    : ''}
                                  {event.previousTournamentType
                                    ? ` Turniertyp ${event.previousTournamentType} → ${event.tournamentType}`
                                    : ''}
                                  {event.previousCategory ? ` Kategorie ${event.previousCategory} → ${event.category}` : ''}
                                </Text>
                              ) : null}
                            {event.previousStartTime || event.previousEndTime ? (
                              <Text
                                testID={`event-time-changes-${event.id}`}
                                style={[styles.timeChangeText, { color: colors.categoryLeague }]}
                              >
                                Zeiten geändert:
                                {event.previousStartTime
                                  ? ` Start ${formatImportTime(event.previousStartTime, preview.timeZone)} → ${formatImportTime(event.startTime, preview.timeZone)}`
                                  : ''}
                                {event.previousEndTime
                                  ? ` Ende ${formatImportTime(event.previousEndTime, preview.timeZone)} → ${formatImportTime(event.endTime, preview.timeZone)}`
                                  : ''}
                              </Text>
                            ) : null}
                            {hasWarnings ? (
                              <Text style={[styles.warningText, { color: colors.warning }]}>
                                {[...event.warnings, ...reviewNotes].join(' ')}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={[styles.eventState, { color: hasWarnings ? colors.warning : event.willUpdate ? colors.categoryLeague : colors.success }]}>
                            {event.warnings.length > 0
                              ? 'Prüfen'
                              : reviewNotes.length > 0
                                ? 'Standardwert'
                                : event.willUpdate
                                  ? 'Update'
                                  : 'Neu'}
                          </Text>
                        </View>
                      );
                    })}
                    {visiblePreviewEvents.length === 0 ? (
                      <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                        {showOnlyChangedEvents
                          ? 'Keine geänderten Termine in dieser Vorschau.'
                          : 'Keine Termine in dieser Vorschau.'}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {previewIsCurrent && preview.issues.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.warning }]}>
                    <Text style={[styles.sectionTitle, { color: colors.warning }]}>Nicht importierte Karten</Text>
                    <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>
                      Diese Karten werden wegen fehlender oder widersprüchlicher Angaben nicht importiert. Gültige Termine bleiben davon unberührt.
                    </Text>
                    {preview.issues.map((issue, index) => (
                      <View
                        key={`${issue.id ?? issue.title ?? 'karte'}-${index}`}
                        style={[styles.issueRow, { borderBottomColor: colors.border }]}
                      >
                        <Text style={[styles.eventTitle, { color: colors.foreground }]}>
                          {issue.title ?? 'Turnierkarte'}
                        </Text>
                        <Text
                          testID={`import-issue-id-${index}`}
                          style={[styles.eventMeta, { color: colors.mutedForeground }]}
                        >
                          Eventkennung: {issue.id ?? 'nicht verfügbar'}
                        </Text>
                        <Text style={[styles.detailCopy, { color: colors.warning }]}>
                          Prüfgrund: {issue.errors.join(' ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  testID="confirm-import-button"
                  onPress={confirmImport}
                  disabled={!previewIsCurrent || Boolean(dateRangeError) || preview.importableCount === 0 || busy}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.importButton,
                    { backgroundColor: colors.primary },
                    pressed && previewIsCurrent && preview.importableCount > 0 && !busy ? styles.pressed : null,
                    !previewIsCurrent || Boolean(dateRangeError) || preview.importableCount === 0 || busy ? styles.disabled : null,
                  ]}
                >
                  {importMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Feather name="database" size={16} color={colors.primaryForeground} />
                  )}
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {importMutation.isPending
                      ? 'Speichere in Supabase …'
                      : previewMutation.isPending
                        ? 'Vorschau wird aktualisiert …'
                        : `${preview.importableCount} Termine importieren`}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {importResult ? (
              <View style={[styles.messageBox, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
                <Feather name="check-circle" size={17} color={colors.primary} />
                <Text accessibilityRole="alert" style={[styles.messageText, { color: colors.foreground }]}>{resultCopy(importResult)}</Text>
              </View>
            ) : null}

            <View
              testID="admin-import-history"
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.historyHeader}>
                <View style={styles.historyHeading}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Letzte Importe</Text>
                  <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>
                    Nach Zeitpunkt sortiert · höchstens 20 Einträge
                  </Text>
                </View>
                <Feather name="clock" size={18} color={colors.mutedForeground} />
              </View>
              {historyQuery.isLoading ? (
                <View style={styles.historyState}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>Historie wird geladen …</Text>
                </View>
              ) : historyQuery.isError ? (
                <Text accessibilityRole="alert" style={[styles.detailCopy, { color: colors.destructive }]}>
                  Die Importhistorie konnte nicht geladen werden. Bitte versuche es später erneut.
                </Text>
              ) : historyQuery.data?.entries.length ? (
                historyQuery.data.entries.map((entry) => (
                  <View key={entry.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.historyRowHeader}>
                      <Text style={[styles.historyDate, { color: colors.foreground }]}>
                        {formatImportTime(entry.importedAt, 'Europe/Berlin')}
                      </Text>
                      <Text numberOfLines={1} style={[styles.historySource, { color: colors.mutedForeground }]}>
                        {entry.sourceHint ?? 'Quelle nicht angegeben'}
                      </Text>
                    </View>
                    <Text style={[styles.historyAdmin, { color: colors.mutedForeground }]}>
                      Admin: {entry.adminEmail}
                    </Text>
                    {entry.startDate && entry.endDate ? (
                      <Text
                        allowFontScaling
                        style={[styles.historyReason, { color: colors.mutedForeground }]}
                        testID={`import-history-period-${entry.id}`}
                      >
                        Zeitraum: {formatDateInput(entry.startDate)} – {formatDateInput(entry.endDate)}
                      </Text>
                    ) : null}
                    <View
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={importHistoryAccessibilityLabel(entry)}
                      testID={`import-history-counts-${entry.id}`}
                    >
                      <Text allowFontScaling style={[styles.historyCounts, { color: colors.foreground }]}>
                        {entry.insertedCount} neu · {entry.updatedCount} aktualisiert · {entry.skippedCount} übersprungen
                      </Text>
                      {entry.skippedWarningCount == null
                        || entry.skippedPastCount == null
                        || entry.skippedInvalidCount == null ? (
                        <Text allowFontScaling style={[styles.historyReason, { color: colors.mutedForeground }]}>
                          Für diesen älteren Eintrag ist keine Aufschlüsselung gespeichert.
                        </Text>
                      ) : (
                        <View style={styles.historyReasons}>
                          <Text allowFontScaling style={[styles.historyReason, { color: colors.mutedForeground }]}>
                            Unklare Zuordnung: {entry.skippedWarningCount}
                          </Text>
                          <Text allowFontScaling style={[styles.historyReason, { color: colors.mutedForeground }]}>
                            Vergangene Termine: {entry.skippedPastCount}
                          </Text>
                          <Text allowFontScaling style={[styles.historyReason, { color: colors.mutedForeground }]}>
                            Fehlerhafte Karten: {entry.skippedInvalidCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    {(entry.skippedCards ?? []).length > 0 ? (
                      <View
                        accessibilityLabel={`${entry.skippedCards?.length ?? 0} übersprungene Karten mit Titel, Kennung und Prüfgrund`}
                        testID={`import-history-skipped-cards-${entry.id}`}
                        style={styles.skippedCards}
                      >
                        <Text style={[styles.historySkippedHeading, { color: colors.foreground }]}>
                          Übersprungene Karten
                        </Text>
                        {(entry.skippedCards ?? []).map((card, index) => (
                          <View
                            key={`${card.id ?? 'ohne-kennung'}-${index}`}
                            style={[styles.skippedCard, { borderLeftColor: colors.border }]}
                          >
                            <Text allowFontScaling style={[styles.historyReason, { color: colors.foreground }]}>
                              {card.title ?? 'Titel nicht erkannt'}
                            </Text>
                            <Text allowFontScaling style={[styles.historyReason, { color: colors.mutedForeground }]}>
                              Kennung: {card.id ?? 'nicht erkannt'}
                            </Text>
                            <Text allowFontScaling style={[styles.historyReason, { color: colors.mutedForeground }]}>
                              Prüfgrund: {card.reason}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                  Bisher wurde noch kein Dateiimport gespeichert.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14 },
  backButton: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9 },
  backText: { fontSize: 13, fontWeight: '600' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: -8 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 3 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  uploadIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardCopy: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  periodCopy: { fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 12 },
  dateFields: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { fontSize: 12, fontWeight: '600' },
  dateInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 14 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 15 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  fileBadge: { minHeight: 38, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginTop: 10 },
  fileName: { flex: 1, fontSize: 12, fontWeight: '600' },
  primaryButton: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12, paddingHorizontal: 14 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  importButton: { marginTop: 0, marginBottom: 10 },
  regionPicker: { gap: 9, marginTop: 16, marginBottom: 14 },
  regionLabel: { fontSize: 13, fontWeight: '600' },
  regionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  regionOption: { minWidth: 52, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  regionOptionText: { fontSize: 13, fontWeight: '700' },
  snapshotWarning: { marginTop: 12 },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.5 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  errorNotice: { alignItems: 'flex-start' },
  noticeCopy: { flex: 1 },
  noticeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  historyHeading: { flex: 1 },
  historyState: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9 },
  historyRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, gap: 5 },
  historyRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyDate: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  historySource: { fontSize: 10, flex: 1, textAlign: 'right' },
  historyAdmin: { fontSize: 10 },
  historyCounts: { fontSize: 11, fontWeight: '600' },
  historyReasons: { gap: 2, marginTop: 4 },
  historyReason: { fontSize: 12 },
  skippedCards: { gap: 8, marginTop: 6 },
  historySkippedHeading: { fontSize: 12, fontWeight: '700' },
  skippedCard: { gap: 2, paddingLeft: 10, borderLeftWidth: 2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 10 },
  stat: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center' },
  statValue: { fontSize: 19, fontWeight: '800' },
  statLabel: { fontSize: 9, textAlign: 'center', marginTop: 3 },
  detailCopy: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  sourceCopy: { fontSize: 10, lineHeight: 14, marginTop: 9 },
  eventRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  eventFilter: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 12, marginTop: 12, marginBottom: 4 },
  eventFilterButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 6 },
  eventFilterText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  eventCopy: { flex: 1 },
  eventTitle: { fontSize: 12, fontWeight: '700' },
  eventMeta: { fontSize: 10, marginTop: 4 },
  timeChangeText: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  warningText: { fontSize: 10, lineHeight: 14, marginTop: 4 },
  eventState: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  issueRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  messageBox: { borderWidth: 1, borderRadius: 13, padding: 13, flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  messageText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
