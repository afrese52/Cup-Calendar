import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '@/components/EventCard';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';
import type { TournamentEvent } from '@/data/events';

type FilterKey = 'region' | 'gameMode' | 'tournamentType';
type FilterValue = string;

const filterGroups: { key: FilterKey; title: string; options: FilterValue[] }[] = [
  { key: 'region', title: 'Region', options: ['Alle', 'EU', 'NAE', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'] },
  { key: 'gameMode', title: 'Modus', options: ['Alle', 'Battle Royale', 'Zero Build', 'Reload', 'Community'] },
  { key: 'tournamentType', title: 'Format', options: ['Alle', 'FNCS', 'Cash Cup', 'Ranked Cup', 'Community'] },
];

function FilterRow({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.filterGroup}>
      <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
        {options.map((option) => {
          const active = selected === option;
          return (
            <Pressable
              key={`${title}-${option}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              testID={`filter-${title}-${option}`}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(option);
              }}
              style={({ pressed }) => [
                styles.filterChip,
                { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? colors.primaryForeground : colors.secondaryForeground }]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CalendarHeader({
  filters,
  onSelect,
  onReset,
  featured,
}: {
  filters: Record<FilterKey, string>;
  onSelect: (key: FilterKey, value: string) => void;
  onReset: () => void;
  featured: TournamentEvent | undefined;
}) {
  const colors = useColors();
  const today = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const eventDate = featured
    ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(featured.startTime))
    : 'Bald verfügbar';

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL <Text style={{ color: colors.mutedForeground }}>/ VORSCHAU</Text></Text>
          <Text style={[styles.greeting, { color: colors.foreground }]}>Dein Wettkampfplan.</Text>
          <Text style={[styles.today, { color: colors.mutedForeground }]}>{today}</Text>
        </View>
        <View style={[styles.calendarIcon, { backgroundColor: colors.accent }]}>
          <Feather name="calendar" size={21} color={colors.accentForeground} />
        </View>
      </View>

      <View style={[styles.previewNotice, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={[styles.noticeDot, { backgroundColor: colors.warning }]} />
        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
          Beispieldaten · Live-Turnierdaten noch nicht verbunden
        </Text>
      </View>

      {featured ? (
        <View style={[styles.featured, { backgroundColor: colors.primary }]}>
          <View style={styles.featuredTop}>
            <Text style={styles.featuredLabel}>ALS NÄCHSTES</Text>
            <View style={[styles.featuredMark, { backgroundColor: colors.heroHighlight }]}>
              <Feather name="zap" size={13} color={colors.primary} />
            </View>
          </View>
          <Text style={[styles.featuredTitle, { color: colors.heroForeground }]} numberOfLines={2}>{featured.title}</Text>
          <View style={styles.featuredBottom}>
            <Text style={[styles.featuredMeta, { color: colors.heroMeta }]}>{eventDate} · {featured.region} · {featured.teamFormat}</Text>
            <Feather name="arrow-up-right" size={17} color={colors.heroForeground} />
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Turniere</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>Finde deinen nächsten Drop-in</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alle Filter zurücksetzen"
          testID="reset-filters"
          onPress={onReset}
          style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
        >
          <Feather name="sliders" size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {filterGroups.map((group) => (
        <FilterRow
          key={group.key}
          title={group.title}
          options={group.options}
          selected={filters[group.key]}
          onSelect={(value) => onSelect(group.key, value)}
        />
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const colors = useColors();
  const { events, bookmarkedIds, toggleBookmark, isReady, storageError } = useCupCal();
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    region: 'Alle',
    gameMode: 'Alle',
    tournamentType: 'Alle',
  });

  const orderedEvents = useMemo(() => [...events].sort((a, b) => a.startTime.localeCompare(b.startTime)), [events]);
  const filteredEvents = useMemo(
    () =>
      orderedEvents.filter((event) =>
        filterGroups.every(({ key }) => filters[key] === 'Alle' || event[key] === filters[key]),
      ),
    [orderedEvents, filters],
  );
  const featured = orderedEvents.find((event) => event.featured);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isBookmarked={bookmarkedIds.includes(item.id)}
            onBookmarkToggle={(id) => void toggleBookmark(id)}
          />
        )}
        ListHeaderComponent={
          <CalendarHeader
            filters={filters}
            featured={featured}
            onSelect={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
            onReset={() => setFilters({ region: 'Alle', gameMode: 'Alle', tournamentType: 'Alle' })}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="filter" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Treffer</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Ändere die Filter, um weitere Turniere zu sehen.</Text>
          </View>
        }
        ListFooterComponent={
          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
            Inoffizielles Fanprojekt, nicht von Epic Games unterstützt.
          </Text>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: Platform.OS === 'web' ? 67 : 8, paddingBottom: Platform.OS === 'web' ? 110 : 104 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
      {storageError ? (
        <View style={[styles.storageWarning, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text style={[styles.storageWarningText, { color: colors.warning }]}>{storageError}</Text>
        </View>
      ) : null}
      {!isReady ? <View pointerEvents="none" style={[styles.loadingShade, { backgroundColor: colors.background + '66' }]} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  listContent: { flexGrow: 1 },
  header: { paddingTop: 14, paddingBottom: 16 },
  headerTop: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8 },
  greeting: { fontSize: 28, fontWeight: '700', letterSpacing: -0.7 },
  today: { fontSize: 13, marginTop: 4, textTransform: 'capitalize' },
  calendarIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  previewNotice: { marginHorizontal: 20, borderWidth: 1, borderRadius: 12, minHeight: 39, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  noticeDot: { width: 7, height: 7, borderRadius: 4 },
  noticeText: { fontSize: 11, fontWeight: '600' },
  featured: { marginHorizontal: 20, borderRadius: 22, padding: 19, marginBottom: 23 },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  featuredLabel: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  featuredMark: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  featuredTitle: { fontSize: 23, lineHeight: 28, fontWeight: '800', marginBottom: 15 },
  featuredBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featuredMeta: { fontSize: 12, fontWeight: '700' },
  sectionHeader: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  sectionSub: { fontSize: 12, marginTop: 3 },
  resetButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filterGroup: { marginBottom: 10 },
  filterLabel: { marginLeft: 20, marginBottom: 7, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  filterChips: { paddingHorizontal: 20, gap: 7 },
  filterChip: { minHeight: 32, justifyContent: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 11 },
  filterChipText: { fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.72 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 42, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 19 },
  disclaimer: { textAlign: 'center', marginHorizontal: 26, marginTop: 6, fontSize: 10, lineHeight: 16 },
  storageWarning: { position: 'absolute', bottom: 14, left: 20, right: 20, borderWidth: 1, borderRadius: 12, padding: 12 },
  storageWarningText: { fontSize: 12, textAlign: 'center', fontWeight: '600' },
  loadingShade: { ...StyleSheet.absoluteFill },
});
