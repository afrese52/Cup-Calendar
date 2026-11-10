import { Feather } from '@expo/vector-icons';
import { getGetEventsQueryKey, useGetAdminImportAccess, useImportMhtSchedule, usePreviewMhtImport } from '@workspace/api-client-react';
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

function resultCopy(result: MhtImportResult) {
  return `${result.importedCount} Termine gespeichert: ${result.insertedCount} neu, ${result.updatedCount} aktualisiert. ${result.skippedWarningCount} mit unklarer Zuordnung und ${result.skippedPastCount} vergangene Termine wurden übersprungen.`;
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
  const previewMutation = usePreviewMhtImport({ request: authRequest });
  const importMutation = useImportMhtSchedule({ request: authRequest });
  const [pickedFile, setPickedFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<MhtImportPreview | null>(null);
  const [importResult, setImportResult] = useState<MhtImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = async () => {
    setError(null);
    setPreview(null);
    setImportResult(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;

      const asset = selection.assets[0];
      if (!asset) {
        setError('Es wurde keine Datei ausgewählt.');
        return;
      }
      if (!/\.(mht|mhtml)$/i.test(asset.name)) {
        setError('Bitte wähle eine MHT- oder MHTML-Datei aus.');
        return;
      }
      if (asset.size != null && asset.size > MAX_FILE_BYTES) {
        setError('Die Datei ist größer als 25 MB.');
        return;
      }

      const content = Platform.OS === 'web'
        ? await asset.file?.text()
        : await new ExpoFile(asset.uri).text();
      if (content === undefined) {
        throw new Error('Der Browser konnte den Inhalt der ausgewählten Datei nicht lesen. Bitte wähle sie erneut aus.');
      }
      if (!content.trim()) {
        setError('Die ausgewählte Datei ist leer.');
        return;
      }
      setPickedFile({ name: asset.name, content });
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Die Datei konnte nicht geöffnet werden.');
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

  const saveImport = async () => {
    if (!pickedFile || !preview || preview.importableCount === 0) return;
    setError(null);
    try {
      const result = await importMutation.mutateAsync({ data: pickedFile.content });
      setImportResult(result);
      setPreview(null);
      setPickedFile(null);
      await queryClient.invalidateQueries({ queryKey: getGetEventsQueryKey() });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Der Import ist fehlgeschlagen.');
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const message =
      `${preview.importableCount} eindeutige zukünftige Termine importieren. ` +
      `${preview.updateCount} vorhandene Einträge werden aktualisiert; persönliche Admin-Notizen bleiben erhalten.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void saveImport();
      return;
    }
    Alert.alert('Termine importieren?', message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Importieren', onPress: () => void saveImport() },
    ]);
  };

  const isAuthorized = accessQuery.data?.authorized === true;
  const busy = previewMutation.isPending || importMutation.isPending;
  const isCheckingAccess = isCheckingSession || (Boolean(accessToken) && accessQuery.isLoading);

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

                {preview.events.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Zukünftige Termine</Text>
                    {preview.events.slice(0, 20).map((event) => {
                      const hasWarnings = event.warnings.length > 0;
                      return (
                        <View key={event.id} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
                          <View style={styles.eventCopy}>
                            <Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text>
                            <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>
                              {formatImportTime(event.startTime, preview.timeZone)} · {event.teamFormat} · {event.gameMode}
                            </Text>
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
                    {preview.events.length > 20 ? (
                      <Text style={[styles.detailCopy, { color: colors.mutedForeground }]}>
                        Weitere {preview.events.length - 20} Termine sind in der Zusammenfassung enthalten.
                      </Text>
                    ) : null}
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
                    {importMutation.isPending ? 'Speichere in Supabase …' : `${preview.importableCount} Termine importieren`}
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
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 15 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  fileBadge: { minHeight: 38, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginTop: 10 },
  fileName: { flex: 1, fontSize: 12, fontWeight: '600' },
  primaryButton: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12, paddingHorizontal: 14 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  importButton: { marginTop: 0, marginBottom: 10 },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.5 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  errorNotice: { alignItems: 'flex-start' },
  noticeCopy: { flex: 1 },
  noticeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
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
  warningText: { fontSize: 10, lineHeight: 14, marginTop: 4 },
  eventState: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  messageBox: { borderWidth: 1, borderRadius: 13, padding: 13, flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  messageText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
