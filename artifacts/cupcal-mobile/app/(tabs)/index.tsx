import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '@/components/EventCard';
import { MonthCalendar } from '@/components/MonthCalendar';
import { useColors } from '@/hooks/useColors';
import { toLocalDateKey, type EventCategory } from '@/data/events';
import { useCupCal } from '@/state/AppContext';

type CategoryFilter = 'Alle Termine' | EventCategory;

const categoryFilters: CategoryFilter[] = [
  'Alle Termine',
  'Turnier',
  'Liga',
  'Qualifikation',
  'Trainingsrunde',
];

const categoryColorKey: Record<EventCategory, 'categoryTournament' | 'categoryLeague' | 'categoryQualification' | 'categoryTraining'> = {
  Turnier: 'categoryTournament',
  Liga: 'categoryLeague',
  Qualifikation: 'categoryQualification',
  Trainingsrunde: 'categoryTraining',
};

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase('de-DE') + value.slice(1);
}

function deviceTimezoneLabel() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Gerätezeit';
  const offset = new Intl.DateTimeFormat('en', { timeZoneName: 'longOffset' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value
    ?.replace('GMT', 'UTC') ?? 'UTC';
  return `Zeiten in Gerätezeit · ${zone} (${offset})`;
}

function CategoryLegend() {
  const colors = useColors();
  const entries: { category: EventCategory; colorKey: (typeof categoryColorKey)[EventCategory] }[] = [
    { category: 'Turnier', colorKey: 'categoryTournament' },
    { category: 'Liga', colorKey: 'categoryLeague' },
    { category: 'Qualifikation', colorKey: 'categoryQualification' },
    { category: 'Trainingsrunde', colorKey: 'categoryTraining' },
  ];

  return (
    <View style={styles.legend}>
      {entries.map(({ category, colorKey }) => (
        <View key={category} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors[colorKey] }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>{category}</Text>
        </View>
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const colors = useColors();
  const { events, bookmarkedIds, toggleBookmark, storageError } = useCupCal();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('Alle Termine');
  const [filterOpen, setFilterOpen] = useState(false);

  const visibleEvents = useMemo(
    () =>
      [...events]
        .filter((event) => selectedCategory === 'Alle Termine' || event.category === selectedCategory)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, selectedCategory],
  );
  const monthEvents = useMemo(
    () =>
      visibleEvents.filter((event) => {
        const date = new Date(event.startTime);
        return date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
      }),
    [visibleEvents, currentMonth],
  );
  const selectedDayEvents = useMemo(
    () => visibleEvents.filter((event) => toLocalDateKey(event.startTime) === toLocalDateKey(selectedDate)),
    [visibleEvents, selectedDate],
  );
  const monthName = capitalize(
    new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(currentMonth),
  );
  const selectedDateLabel = capitalize(
    new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(selectedDate),
  );

  const moveMonth = (amount: number) => {
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + amount, 1));
    void Haptics.selectionAsync();
  };

  const selectToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    void Haptics.selectionAsync();
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (date.getMonth() !== currentMonth.getMonth() || date.getFullYear() !== currentMonth.getFullYear()) {
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    void Haptics.selectionAsync();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 5, paddingBottom: Platform.OS === 'web' ? 112 : 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]} />
            <Text style={[styles.brandName, { color: colors.mutedForeground }]}>CAP-CALENDAR</Text>
          </View>
          <View style={[styles.previewBadge, { borderColor: colors.warning, backgroundColor: colors.warning + '16' }]}>
            <Feather name="alert-triangle" size={11} color={colors.warning} />
            <Text style={[styles.previewBadgeText, { color: colors.warning }]}>TESTDATEN · FIKTIVE TERMINE</Text>
          </View>
        </View>

        <View style={styles.monthHeading}>
          <View style={styles.monthTitleBlock}>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthName}</Text>
            <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>
              {currentMonth.getFullYear()} · {monthEvents.length} {monthEvents.length === 1 ? 'Termin' : 'Termine'}
            </Text>
          </View>
          <View style={styles.monthControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Vorheriger Monat"
              testID="previous-month"
              onPress={() => moveMonth(-1)}
              style={({ pressed }) => [
                styles.monthArrow,
                { borderColor: colors.border, backgroundColor: colors.background },
                pressed && styles.pressed,
              ]}
            >
              <Feather name="chevron-left" size={20} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zum heutigen Datum"
              testID="today-button"
              onPress={selectToday}
              style={({ pressed }) => [
                styles.todayButton,
                { borderColor: colors.primary },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.todayButtonText, { color: colors.primary }]}>Heute</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nächster Monat"
              testID="next-month"
              onPress={() => moveMonth(1)}
              style={({ pressed }) => [
                styles.monthArrow,
                { borderColor: colors.border, backgroundColor: colors.background },
                pressed && styles.pressed,
              ]}
            >
              <Feather name="chevron-right" size={20} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <MonthCalendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          events={visibleEvents}
          onSelectDate={selectDate}
        />

        <CategoryLegend />

        <View style={styles.filterWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: filterOpen }}
            accessibilityLabel={`Filter, ${selectedCategory}`}
            testID="calendar-filter"
            onPress={() => setFilterOpen((open) => !open)}
            style={({ pressed }) => [
              styles.filterButton,
              { borderColor: colors.border, backgroundColor: colors.card },
              pressed && styles.pressed,
            ]}
          >
            <Feather name="sliders" size={18} color={colors.mutedForeground} />
            <Text style={[styles.filterTitle, { color: colors.foreground }]}>Filter</Text>
            <Text style={[styles.filterSelection, { color: colors.mutedForeground }]} numberOfLines={1}>
              {selectedCategory}
            </Text>
            <Feather name={filterOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </Pressable>
          {filterOpen ? (
            <View style={[styles.filterMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {categoryFilters.map((category) => {
                const active = selectedCategory === category;
                const color = category === 'Alle Termine' ? colors.foreground : colors[categoryColorKey[category]];
                return (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    testID={`calendar-filter-${category}`}
                    onPress={() => {
                      setSelectedCategory(category);
                      setFilterOpen(false);
                    }}
                    style={({ pressed }) => [styles.filterOption, pressed && styles.pressed]}
                  >
                    <View style={[styles.optionDot, { backgroundColor: color }]} />
                    <Text style={[styles.filterOptionText, { color: colors.foreground }]}>{category}</Text>
                    {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.dayHeading}>
          <Text style={[styles.dayTitle, { color: colors.foreground }]}>{selectedDateLabel}</Text>
          <Text style={[styles.timezone, { color: colors.mutedForeground }]}>{deviceTimezoneLabel()}</Text>
        </View>

        {selectedDayEvents.length ? (
          <View style={styles.dayEvents}>
            {selectedDayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isBookmarked={bookmarkedIds.includes(event.id)}
                onBookmarkToggle={(id) => void toggleBookmark(id)}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.emptyDay, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="calendar" size={18} color={colors.mutedForeground} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Termine an diesem Tag</Text>
              <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>
                Wähle einen anderen Tag im Kalender.
              </Text>
            </View>
          </View>
        )}

        {storageError ? <Text style={[styles.storageError, { color: colors.warning }]}>{storageError}</Text> : null}
        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          Inoffizielles Fanprojekt · Nicht von Epic Games unterstützt
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1 },
  brandRow: { marginHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28, marginBottom: 18, gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 11, height: 11, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  brandName: { fontSize: 11, fontWeight: '800', letterSpacing: 2.2 },
  previewBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 26, flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  monthHeading: { marginHorizontal: 20, minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8 },
  monthTitleBlock: { flexShrink: 1 },
  monthTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.2 },
  monthSub: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthArrow: { width: 43, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  todayButton: { height: 46, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  todayButtonText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginHorizontal: 22, marginTop: 12, marginBottom: 15 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 11, fontWeight: '500' },
  filterWrap: { marginHorizontal: 19, marginBottom: 22 },
  filterButton: { minHeight: 54, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  filterTitle: { fontSize: 14, fontWeight: '700' },
  filterSelection: { flex: 1, fontSize: 13 },
  filterMenu: { borderWidth: 1, borderRadius: 16, marginTop: 7, overflow: 'hidden' },
  filterOption: { minHeight: 45, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionDot: { width: 7, height: 7, borderRadius: 4 },
  filterOptionText: { flex: 1, fontSize: 13, fontWeight: '600' },
  dayHeading: { marginHorizontal: 20, marginBottom: 12 },
  dayTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.35 },
  timezone: { marginTop: 6, fontSize: 12 },
  dayEvents: { paddingTop: 1 },
  emptyDay: { marginHorizontal: 20, minHeight: 83, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  emptyIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyCopy: { flex: 1 },
  emptyTitle: { fontSize: 13, fontWeight: '700' },
  emptyDescription: { marginTop: 3, fontSize: 11 },
  storageError: { marginHorizontal: 20, marginTop: 12, fontSize: 12, textAlign: 'center' },
  disclaimer: { marginHorizontal: 24, marginTop: 18, fontSize: 10, textAlign: 'center' },
});
