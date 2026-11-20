import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EventCard } from '@/components/EventCard';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';

export default function SavedScreen() {
  const colors = useColors();
  const {
    events,
    bookmarkedIds,
    toggleBookmark,
    isReady,
    authReady,
    isAuthenticated,
    bookmarkSyncError,
    bookmarkSyncStatus,
    clearBookmarks,
    retryBookmarkSync,
    retryLocalBookmarkLoad,
    canRetryLocalBookmarkLoad,
    isRetryingLocalBookmarkLoad,
    storageError,
  } = useCupCal();
  const [savedOnly, setSavedOnly] = useState(false);
  const agendaEvents = useMemo(
    () =>
      events
        .filter((event) => !savedOnly || bookmarkedIds.includes(event.id))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, bookmarkedIds, savedOnly],
  );
  const visibleEvents = savedOnly && (!authReady || (!isAuthenticated && bookmarkedIds.length === 0))
    ? []
    : agendaEvents;

  const confirmClear = () => {
    Alert.alert(
      'Merkliste leeren?',
      'Alle gespeicherten Turniere dieses Kontos werden aus deiner Merkliste entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Leeren', style: 'destructive', onPress: () => void clearBookmarks() },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={visibleEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard event={item} isBookmarked onBookmarkToggle={(id) => void toggleBookmark(id)} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>DEIN KALENDER</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Agenda</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {savedOnly ? `${agendaEvents.length} vorgemerkte Termine` : `${agendaEvents.length} Beispieltermine`}
            </Text>
            <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !savedOnly }}
                testID="agenda-all"
                onPress={() => setSavedOnly(false)}
                style={[styles.segmentButton, !savedOnly ? { backgroundColor: colors.primary } : null]}
              >
                <Text style={[styles.segmentText, { color: !savedOnly ? colors.primaryForeground : colors.mutedForeground }]}>
                  Alle Termine
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: savedOnly }}
                testID="agenda-bookmarked"
                onPress={() => setSavedOnly(true)}
                style={[styles.segmentButton, savedOnly ? { backgroundColor: colors.primary } : null]}
              >
                <Text style={[styles.segmentText, { color: savedOnly ? colors.primaryForeground : colors.mutedForeground }]}>
                  Merkliste
                </Text>
              </Pressable>
            </View>
            {savedOnly && !authReady ? (
              <View style={styles.loadingNotice}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.authText, { color: colors.mutedForeground }]}>Sitzung wird geprüft …</Text>
              </View>
            ) : savedOnly && !isAuthenticated && bookmarkedIds.length === 0 ? (
              <View style={[styles.authNotice, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="lock" size={18} color={colors.primary} />
                <View style={styles.authCopy}>
                  <Text style={[styles.authTitle, { color: colors.foreground }]}>Anmeldung erforderlich</Text>
                  <Text style={[styles.authText, { color: colors.mutedForeground }]}>
                    Termine kannst du nach der Anmeldung in deiner Merkliste speichern.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    testID="agenda-sign-in"
                    onPress={() => router.push('/(tabs)/settings')}
                    style={({ pressed }) => [styles.signInButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                  >
                    <Text style={[styles.signInText, { color: colors.primaryForeground }]}>Zum Konto</Text>
                  </Pressable>
                </View>
              </View>
            ) : savedOnly && !isAuthenticated && bookmarkedIds.length > 0 ? (
              <View style={[styles.authNotice, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="smartphone" size={18} color={colors.primary} />
                <View style={styles.authCopy}>
                  <Text style={[styles.authTitle, { color: colors.foreground }]}>Nur auf diesem Gerät</Text>
                  <Text style={[styles.authText, { color: colors.mutedForeground }]}>
                    Diese alten Favoriten bleiben lokal und werden keinem Konto zugeordnet.
                  </Text>
                </View>
              </View>
            ) : null}
            {storageError ? (
              <View style={[styles.errorCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.error, { color: colors.warning }]}>{storageError}</Text>
                {canRetryLocalBookmarkLoad ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isRetryingLocalBookmarkLoad }}
                    disabled={isRetryingLocalBookmarkLoad}
                    testID="agenda-retry-local-bookmarks"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      void retryLocalBookmarkLoad();
                    }}
                    style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
                  >
                    {isRetryingLocalBookmarkLoad ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather name="refresh-cw" size={14} color={colors.primary} />
                    )}
                    <Text style={[styles.textActionLabel, { color: colors.primary }]}>
                      {isRetryingLocalBookmarkLoad ? 'Favoriten werden geladen …' : 'Favoriten erneut laden'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {savedOnly && isAuthenticated ? (
              <View style={[styles.syncCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.syncStatus}>
                  {bookmarkSyncStatus === 'syncing' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather
                      name={bookmarkSyncStatus === 'synced' ? 'cloud' : 'smartphone'}
                      size={16}
                      color={colors.primary}
                    />
                  )}
                  <Text style={[styles.syncText, { color: colors.mutedForeground }]}>
                    {bookmarkSyncStatus === 'syncing'
                      ? 'Merkliste wird abgeglichen …'
                      : bookmarkSyncStatus === 'synced'
                        ? 'Auf diesem Gerät und mit deinem Konto gespeichert.'
                        : bookmarkSyncStatus === 'pending'
                          ? 'Offline gespeichert; Abgleich folgt.'
                          : 'Lokal auf diesem Gerät gespeichert.'}
                  </Text>
                </View>
                {bookmarkSyncStatus !== 'syncing' ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="agenda-retry-sync"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      void retryBookmarkSync();
                    }}
                    style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
                  >
                    <Feather name="refresh-cw" size={14} color={colors.primary} />
                    <Text style={[styles.textActionLabel, { color: colors.primary }]}>Abgleich wiederholen</Text>
                  </Pressable>
                ) : null}
                {bookmarkedIds.length ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="agenda-clear-bookmarks"
                    onPress={confirmClear}
                    style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
                  >
                    <Feather name="trash-2" size={14} color={colors.destructive} />
                    <Text style={[styles.textActionLabel, { color: colors.destructive }]}>Merkliste leeren</Text>
                  </Pressable>
                ) : null}
                {bookmarkSyncError ? (
                  <Text style={[styles.error, { color: colors.warning }]}>{bookmarkSyncError}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          savedOnly && (!authReady || (!isAuthenticated && bookmarkedIds.length === 0)) ? <View /> : isReady ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
                <Feather name="bookmark" size={22} color={colors.accentForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {savedOnly ? 'Noch nichts gespeichert' : 'Keine Termine verfügbar'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {savedOnly
                  ? 'Speichere Turniere im Kalender. Sie bleiben auch offline in deiner Merkliste.'
                  : 'Für diesen Bereich sind gerade keine Termine vorhanden.'}
              </Text>
            </View>
          ) : <View />
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 10, paddingBottom: Platform.OS === 'web' ? 110 : 104 },
        ]}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 22 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.7 },
  subtitle: { fontSize: 13, marginTop: 5 },
  segment: { borderWidth: 1, borderRadius: 13, padding: 4, flexDirection: 'row', gap: 4, marginTop: 19 },
  segmentButton: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 12, fontWeight: '700' },
  authNotice: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14, flexDirection: 'row', gap: 12 },
  authCopy: { flex: 1 },
  authTitle: { fontSize: 14, fontWeight: '700' },
  authText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  loadingNotice: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14 },
  signInButton: { minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  signInText: { fontSize: 12, fontWeight: '700' },
  syncCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 14, gap: 11 },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 14, gap: 8 },
  syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  syncText: { flex: 1, fontSize: 12, lineHeight: 18 },
  textAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  textActionLabel: { fontSize: 12, fontWeight: '700' },
  error: { fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.75 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 70, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
