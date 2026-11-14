import { Feather } from '@expo/vector-icons';
import {
  getGetAdminImportHistoryQueryKey,
  getGetEventsQueryKey,
  useGetAdminImportAccess,
  useGetAdminImportHistory,
  useImportMhtSchedule,
  usePreviewMhtImport,
} from '@workspace/api-client-react';
import type { MhtImportPreview, MhtImportResult } from '@workspace/api-client-react';
import { File as ExpoFile } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { watchAuthSession } from '@/services/accountAuth';
import { supabase } from '@/services/supabase';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type PickedImportSource = {
  name: string;
  uri: string;
  size: number | null | undefined;
  readText: () => Promise<string | undefined>;
};

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

function getImportPeriod(preview: MhtImportPreview) {
  const eligibleEvents = preview.events.filter((event) => event.warnings.length === 0);
  if (eligibleEvents.length === 0) return null;

  const start = eligibleEvents.reduce(
    (earliest, event) => Math.min(earliest, Date.parse(event.startTime)),
    Number.POSITIVE_INFINITY,
  );
  const end = eligibleEvents.reduce(
    (latest, event) => Math.max(latest, Date.parse(event.endTime)),
    Number.NEGATIVE_INFINITY,
  );
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
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
  const [pickedFile, setPickedFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<MhtImportPreview | null>(null);
  const [importResult, setImportResult] = useState<MhtImportResult | null>(null);
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
      if (!/\.(mht|mhtml)$/i.test(selection.name)) {
        setPickedFile(null);
        setPreview(null);
        setError('Bitte wähle eine MHT- oder MHTML-Datei aus.');
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
      setPickedFile({ name: selection.name, content });
      setPreview(null);
      setImportResult(null);
    } catch (pickError) {
      setError('Die Datei konnte nicht gelesen werden. Bitte prüfe, ob sie noch verfügbar ist, und wähle sie erneut aus.');
    }
  };

  const checkFile = async () => {
    if (!pickedFile) return;
    setError(null);
    setPreview(null);
    try {
      const result = await previewMutation.mutateAsync({ data: pickedFile.content });
      setPreview(result);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Die Datei konnte nicht geprüft werden.');
    }
  };

  function showImportConfirmation(currentPreview: MhtImportPreview) {
    const period = getImportPeriod(currentPreview);
    const periodCopy = period
      ? ` Zeitraum: ${formatImportTime(period.start, currentPreview.timeZone)} bis ${formatImportTime(period.end, currentPreview.timeZone)}.`
      : '';
    const message =
      `${currentPreview.importableCount} geprüfte Termine importieren.${periodCopy} ` +
      `${currentPreview.warningCount} Termine mit Zuordnungswarnungen bleiben ausgelassen. ` +
      `${currentPreview.updateCount} vorhandene Einträge werden aktualisiert; persönliche Admin-Notizen bleiben erhalten.` +
      (currentPreview.isSnapshotStale
        ? ' Achtung: Der Snapshot ist inzwischen älter als 24 Stunden. Prüfe eine aktuelle Datei oder bestätige ausdrücklich den Import dieser veralteten Vorschau.'
        : '');
    const confirmedStaleSnapshot = currentPreview.isSnapshotStale;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void saveImport(confirmedStaleSnapshot);
      return;
    }
    Alert.alert(confirmedStaleSnapshot ? 'Veralteten Spielplan importieren?' : 'Termine importieren?', message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Importieren', onPress: () => void saveImport(confirmedStaleSnapshot) },
    ]);
  }

  async function saveImport(staleSnapshotWasConfirmed: boolean) {
    if (!pickedFile || !preview || preview.importableCount === 0) return;
    setError(null);
    try {
      const currentPreview = await previewMutation.mutateAsync({ data: pickedFile.content });
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
        params: { confirmStaleSnapshot: currentPreview.isSnapshotStale },
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
          const currentPreview = await previewMutation.mutateAsync({ data: pickedFile.content });
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
    try {
      const currentPreview = await previewMutation.mutateAsync({ data: pickedFile.content });
      setPreview(currentPreview);
      if (currentPreview.importableCount === 0) {
        setError('Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren.');
        return;
      }
      showImportConfirmation(currentPreview);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Die Vorschau konnte nicht aktualisiert werden.');
    }
  }

  const isAuthorized = accessQuery.data?.authorized === true;
  const busy = previewMutation.isPending || importMutation.isPending;
  const isCheckingAccess = isCheckingSession || (Boolean(accessToken) && accessQuery.isLoading);
  const importPeriod = preview ? getImportPeriod(preview) : null;
  const visiblePreviewEvents = preview
    ? preview.events.filter((event, index) => (
        index < 20 || event.warnings.length > 0 || hasPreviewChanges(event)
      ))
    : [];
  const omittedUnwarnedEvents = preview
    ? preview.events.slice(20).filter((event) => (
        event.warnings.length === 0 && !hasPreviewChanges(event)
      )).length
    : 0;

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
          Lade einen gespeicherten Fortnite-Spielplan als MHT-Datei hoch. Vor dem Speichern siehst du, welche Einträge neu sind, aktualisiert werden oder wegen unklarer Zuordnung ausgelassen werden.
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
                MHT oder MHTML · maximal 25 MB · Zeitzone Europe/Berlin
              </Text>
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
                  {previewMutation.isPending ? 'Datei wird geprüft …' : 'Datei prüfen'}
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
                    {importPeriod
                      ? `${formatImportTime(importPeriod.start, preview.timeZone)} bis ${formatImportTime(importPeriod.end, preview.timeZone)}`
                      : 'keine eindeutig zugeordneten Termine'}
                  </Text>
                  <View style={styles.stats}>
                    <Stat value={preview.importableCount} label="importierbar" color={colors.primary} />
                    <Stat value={preview.newCount} label="neu" color={colors.success} />
                    <Stat value={preview.updateCount} label="aktualisiert" color={colors.categoryLeague} />
                    <Stat value={preview.warningCount + preview.invalidCount} label="übersprungen" color={colors.warning} />
                  </View>
                  <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                    Vergangene Termine, fehlerhafte Karten und Termine mit uneindeutigem Spielformat werden nicht gespeichert.
                  </Text>
                  {preview.sourceUrl ? (
                    <Text numberOfLines={2} style={[styles.sourceCopy, { color: colors.mutedForeground }]}>{preview.sourceUrl}</Text>
                  ) : null}
                </View>

                  {visiblePreviewEvents.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Zukünftige Termine und Zuordnungswarnungen</Text>
                    {visiblePreviewEvents.map((event) => {
                      const hasWarnings = event.warnings.length > 0;
                      return (
                        <View key={event.id} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
                          <View style={styles.eventCopy}>
                            <Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text>
                            <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>
                              {formatImportTime(event.startTime, preview.timeZone)} · {event.teamFormat} · {event.gameMode}
                            </Text>
                            {event.previousTitle
                              || event.previousGameMode
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
                              <Text style={[styles.warningText, { color: colors.warning }]}>{event.warnings.join(' ')}</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.eventState, { color: hasWarnings ? colors.warning : event.willUpdate ? colors.categoryLeague : colors.success }]}>
                            {hasWarnings ? 'Prüfen' : event.willUpdate ? 'Update' : 'Neu'}
                          </Text>
                        </View>
                      );
                    })}
                    {omittedUnwarnedEvents > 0 ? (
                      <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                        {omittedUnwarnedEvents} weitere Termine ohne Warnung sind in der Anzahl enthalten.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {preview.issues.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.warning }]}>
                    <Text style={[styles.sectionTitle, { color: colors.warning }]}>Nicht importierte Karten</Text>
                    {preview.issues.map((issue, index) => (
                      <Text key={`${issue.title ?? 'karte'}-${index}`} style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                        {issue.title ?? 'Turnierkarte'}: {issue.errors.join(' ')}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  testID="confirm-import-button"
                  onPress={confirmImport}
                  disabled={preview.importableCount === 0 || busy}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.importButton,
                    { backgroundColor: colors.primary },
                    pressed && preview.importableCount > 0 && !busy ? styles.pressed : null,
                    preview.importableCount === 0 || busy ? styles.disabled : null,
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
                    <Text style={[styles.historyCounts, { color: colors.foreground }]}>
                      {entry.insertedCount} neu · {entry.updatedCount} aktualisiert · {entry.skippedCount} übersprungen
                    </Text>
                    {entry.skippedWarningCount == null
                      || entry.skippedPastCount == null
                      || entry.skippedInvalidCount == null ? (
                      <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                        Für diesen älteren Eintrag ist keine Aufschlüsselung gespeichert.
                      </Text>
                    ) : (
                      <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                        Davon {entry.skippedWarningCount} mit unklarer Zuordnung, {entry.skippedPastCount} vergangene Termine und {entry.skippedInvalidCount} fehlerhafte Karten.
                      </Text>
                    )}
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
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 15 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  fileBadge: { minHeight: 38, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginTop: 10 },
  fileName: { flex: 1, fontSize: 12, fontWeight: '600' },
  primaryButton: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12, paddingHorizontal: 14 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  importButton: { marginTop: 0, marginBottom: 10 },
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
  historyCounts: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 10 },
  stat: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center' },
  statValue: { fontSize: 19, fontWeight: '800' },
  statLabel: { fontSize: 9, textAlign: 'center', marginTop: 3 },
  detailCopy: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  sourceCopy: { fontSize: 10, lineHeight: 14, marginTop: 9 },
  eventRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  eventCopy: { flex: 1 },
  eventTitle: { fontSize: 12, fontWeight: '700' },
  eventMeta: { fontSize: 10, marginTop: 4 },
  timeChangeText: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  warningText: { fontSize: 10, lineHeight: 14, marginTop: 4 },
  eventState: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  messageBox: { borderWidth: 1, borderRadius: 13, padding: 13, flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  messageText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
