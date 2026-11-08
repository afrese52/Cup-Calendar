import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '@/components/EventCard';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';

export default function SavedScreen() {
  const colors = useColors();
  const { events, bookmarkedIds, toggleBookmark, isReady } = useCupCal();
  const [savedOnly, setSavedOnly] = useState(false);
  const agendaEvents = useMemo(
    () =>
      events
        .filter((event) => !savedOnly || bookmarkedIds.includes(event.id))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, bookmarkedIds, savedOnly],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={agendaEvents}
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
          </View>
        }
        ListEmptyComponent={
          isReady ? (
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
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 70, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
