import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '@/components/EventCard';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';

export default function SavedScreen() {
  const colors = useColors();
  const { events, bookmarkedIds, toggleBookmark, isReady } = useCupCal();
  const savedEvents = useMemo(
    () => events.filter((event) => bookmarkedIds.includes(event.id)).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, bookmarkedIds],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={savedEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard event={item} isBookmarked onBookmarkToggle={(id) => void toggleBookmark(id)} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>DEIN PLAN</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Merkliste</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {savedEvents.length === 1 ? '1 Turnier vorgemerkt' : `${savedEvents.length} Turniere vorgemerkt`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          isReady ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
                <Feather name="bookmark" size={22} color={colors.accentForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Noch nichts gespeichert</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Speichere Turniere im Kalender. Sie bleiben auch offline in deiner Merkliste.
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
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 70, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
