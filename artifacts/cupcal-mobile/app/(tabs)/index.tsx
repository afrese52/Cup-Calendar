import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { LocationPermissionResponse } from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '@/components/EventCard';
import { MonthCalendar } from '@/components/MonthCalendar';
import { WeekCalendarStrip } from '@/components/WeekCalendarStrip';
import { useColors } from '@/hooks/useColors';
import {
  calendarRegionFilters,
  getAvailableEvents,
  matchesEventFilter,
  toLocalDateKey,
  type CalendarCategoryFilter,
  type CalendarGameFeatureFilter,
  type CalendarRegionFilter,
  type EventCategory,
} from '@/data/events';
import {
  loadCalendarRegionPreference,
  saveCalendarRegionPreference,
} from '@/services/calendarRegionPreference';
import {
  resolveDeviceRegion,
  type DeviceRegionStatus,
} from '@/services/deviceRegion';
import { useCupCal } from '@/state/AppContext';

const categoryFilters: CalendarCategoryFilter[] = [
  'Alle Termine',
  'Turnier',
  'Liga',
  'Qualifikation',
  'Trainingsrunde',
];

const gameFeatureFilters: CalendarGameFeatureFilter[] = [
  'Alle Spielmerkmale',
  'Reload',
  'Zero Build',
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
  const entries: {
    category: EventCategory;
    label: string;
    colorKey: (typeof categoryColorKey)[EventCategory];
  }[] = [
    { category: 'Turnier', label: 'Turnier', colorKey: 'categoryTournament' },
    { category: 'Liga', label: 'Liga', colorKey: 'categoryLeague' },
    { category: 'Qualifikation', label: 'Quali', colorKey: 'categoryQualification' },
    { category: 'Trainingsrunde', label: 'Training', colorKey: 'categoryTraining' },
  ];

  return (
    <View style={styles.legend}>
      {entries.map(({ category, label, colorKey }) => (
        <View key={category} style={styles.legendItem} accessibilityLabel={category}>
          <View style={[styles.legendDot, { backgroundColor: colors[colorKey] }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const colors = useColors();
  const { events, bookmarkedIds, toggleBookmark, eventError, storageError } = useCupCal();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedCategory, setSelectedCategory] = useState<CalendarCategoryFilter>('Alle Termine');
  const [selectedGameFeature, setSelectedGameFeature] =
    useState<CalendarGameFeatureFilter>('Alle Spielmerkmale');
  const [selectedRegion, setSelectedRegion] =
    useState<CalendarRegionFilter>('Alle Regionen');
  const [regionSource, setRegionSource] = useState<'automatic' | 'manual'>('manual');
  const [regionStatus, setRegionStatus] = useState<DeviceRegionStatus | 'loading' | 'unavailable'>('loading');
  const [regionMessage, setRegionMessage] = useState<string | null>(null);
  const [isDetectingRegion, setIsDetectingRegion] = useState(false);
  const [locationPermission, setLocationPermission] =
    useState<LocationPermissionResponse | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const requestVersion = useRef(0);
  const manualSelectionMade = useRef(false);
  const mounted = useRef(false);

  const detectRegion = useCallback(async (request: 'initial' | 'explicit') => {
    const version = ++requestVersion.current;
    setIsDetectingRegion(true);
    setRegionStatus('loading');
    setRegionMessage(null);

    try {
      const result = await resolveDeviceRegion(request);
      if (!mounted.current || version !== requestVersion.current) return;

      setLocationPermission(result.permission);
      setRegionStatus(result.status);
      if (result.status === 'ready' && result.region) {
        setSelectedRegion(result.region);
        setRegionSource('automatic');
        try {
          await saveCalendarRegionPreference({
            region: result.region,
            source: 'automatic',
          });
        } catch {
          if (mounted.current && version === requestVersion.current) {
            setRegionMessage('Region erkannt, aber die Einstellung konnte nicht gespeichert werden.');
          }
        }
      } else if (result.status === 'permission-required') {
        setRegionMessage('Standortfreigabe fehlt. Du kannst die Region unten manuell wählen.');
      } else if (result.status === 'settings-required') {
        setRegionMessage('Standortfreigabe in den Geräteeinstellungen erlauben oder Region manuell wählen.');
      } else if (result.status === 'services-disabled') {
        setRegionMessage('Standortdienste sind ausgeschaltet. Du kannst die Region manuell wählen.');
      }
    } catch {
      if (mounted.current && version === requestVersion.current) {
        setRegionStatus('unavailable');
        setRegionMessage('Standort konnte nicht ermittelt werden. Du kannst die Region manuell wählen.');
      }
    } finally {
      if (mounted.current && version === requestVersion.current) {
        setIsDetectingRegion(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeRegion = async () => {
      try {
        const preference = await loadCalendarRegionPreference();
        if (cancelled || manualSelectionMade.current) return;

        if (preference) {
          setSelectedRegion(preference.region);
          setRegionSource(preference.source);
          if (preference.source === 'manual') {
            setRegionStatus('ready');
            return;
          }
        }
      } catch {
        if (!cancelled) {
          setRegionMessage('Gespeicherte Region konnte nicht geladen werden.');
        }
      }

      if (
        !cancelled &&
        !manualSelectionMade.current &&
        requestVersion.current === 0
      ) {
        await detectRegion('initial');
      }
    };

    void initializeRegion();
    return () => {
      cancelled = true;
    };
  }, [detectRegion]);

  const selectRegionManually = (region: CalendarRegionFilter) => {
    manualSelectionMade.current = true;
    requestVersion.current += 1;
    setIsDetectingRegion(false);
    setSelectedRegion(region);
    setRegionSource('manual');
    setRegionStatus('ready');
    setRegionMessage(null);
    void saveCalendarRegionPreference({ region, source: 'manual' }).catch(() => {
      setRegionMessage('Region ausgewählt, aber die Einstellung konnte nicht gespeichert werden.');
    });
  };

  const handleAutomaticRegion = async () => {
    if (regionStatus === 'settings-required' && Platform.OS !== 'web') {
      try {
        await Linking.openSettings();
      } catch {
        setRegionMessage('Die Geräteeinstellungen konnten nicht geöffnet werden.');
      }
      return;
    }

    manualSelectionMade.current = false;
    await detectRegion('explicit');
  };

  const filtersActive =
    selectedCategory !== 'Alle Termine' ||
    selectedGameFeature !== 'Alle Spielmerkmale' ||
    selectedRegion !== 'Alle Regionen';
  const activeFilterLabels = [
    selectedCategory !== 'Alle Termine' ? `Terminart: ${selectedCategory}` : null,
    selectedGameFeature !== 'Alle Spielmerkmale'
      ? `Spielmerkmal: ${selectedGameFeature}`
      : null,
    selectedRegion !== 'Alle Regionen' ? `Region: ${selectedRegion}` : null,
  ].filter(Boolean);
  const filterSummary = filtersActive
    ? [
        selectedRegion !== 'Alle Regionen' ? selectedRegion : null,
        selectedCategory !== 'Alle Termine' ? selectedCategory : null,
        selectedGameFeature !== 'Alle Spielmerkmale' ? selectedGameFeature : null,
      ].filter(Boolean).join(' · ')
    : 'Alle Termine';
  const regionStatusLabel =
    regionStatus === 'loading'
      ? regionSource === 'automatic' && selectedRegion !== 'Alle Regionen'
        ? `Standortregion wird aktualisiert · ${selectedRegion}`
        : 'Region wird anhand des Standorts ermittelt …'
      : (regionStatus === 'permission-required' ||
          regionStatus === 'settings-required' ||
          regionStatus === 'services-disabled') &&
          regionSource === 'automatic'
        ? `Zuletzt automatisch ermittelt · ${selectedRegion}`
        : regionSource === 'automatic' && selectedRegion !== 'Alle Regionen'
          ? `Automatisch ermittelt · ${selectedRegion}`
          : regionSource === 'manual'
            ? `Manuell ausgewählt · ${selectedRegion}`
            : 'Region manuell auswählen';

  const visibleEvents = useMemo(
    () =>
      getAvailableEvents(events)
        .filter((event) =>
          matchesEventFilter(event, selectedCategory, selectedGameFeature, selectedRegion),
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, selectedCategory, selectedGameFeature, selectedRegion],
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
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setCurrentMonth(nextMonth);
    setSelectedDate(
      new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selectedDate.getDate(), lastDay)),
    );
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
            <Text style={[styles.brandName, { color: colors.mutedForeground }]}>CUPCAL</Text>
          </View>
          {eventError ? (
            <View
              style={[
                styles.previewBadge,
                {
                  borderColor: colors.warning,
                  backgroundColor: colors.warning + '16',
                },
              ]}
            >
              <Feather name="alert-triangle" size={11} color={colors.warning} />
              <Text style={[styles.previewBadgeText, { color: colors.warning }]}>TERMINE OFFLINE</Text>
            </View>
          ) : null}
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

        <WeekCalendarStrip
          selectedDate={selectedDate}
          events={visibleEvents}
          onSelectDate={selectDate}
        />

        <View style={styles.weekFooter}>
          <CategoryLegend />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: monthExpanded }}
            accessibilityLabel={monthExpanded ? 'Wochenansicht anzeigen' : 'Monat anzeigen'}
            testID="month-calendar-toggle"
            onPress={() => setMonthExpanded((expanded) => !expanded)}
            style={({ pressed }) => [styles.monthToggle, pressed && styles.pressed]}
          >
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.monthToggleText, { color: colors.primary }]}>
              {monthExpanded ? 'Woche' : 'Monat'}
            </Text>
            <Feather
              name={monthExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.primary}
            />
          </Pressable>
        </View>

        {monthExpanded ? (
          <MonthCalendar
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            events={visibleEvents}
            onSelectDate={selectDate}
          />
        ) : null}

        <View style={styles.dayHeading}>
          <View style={styles.dayTitleRow}>
            <Text style={[styles.dayTitle, { color: colors.foreground }]}>{selectedDateLabel}</Text>
            <Text style={[styles.dayCount, { color: colors.mutedForeground }]}>
              {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'Termin' : 'Termine'}
            </Text>
          </View>
          <Text style={[styles.timezone, { color: colors.mutedForeground }]}>{deviceTimezoneLabel()}</Text>
          {eventError ? (
            <Text style={[styles.storageError, { color: colors.warning }]}>{eventError}</Text>
          ) : null}
        </View>

        <View style={styles.filterWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: filterOpen }}
            accessibilityLabel={`Kalenderfilter. ${
              filtersActive
                ? activeFilterLabels.join(', ')
                : 'Alle Terminarten, Spielmerkmale und Regionen'
            }`}
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
              {filterSummary}
            </Text>
            <Feather name={filterOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </Pressable>
          {filterOpen ? (
            <View style={[styles.filterMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text
                accessibilityRole="header"
                style={[styles.filterGroupTitle, { color: colors.mutedForeground }]}
              >
                TERMINART
              </Text>
              {categoryFilters.map((category) => {
                const active = selectedCategory === category;
                const color = category === 'Alle Termine'
                  ? colors.foreground
                  : colors[categoryColorKey[category as EventCategory]];
                return (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    accessibilityLabel={`Terminart: ${category}`}
                    accessibilityState={{ selected: active }}
                    testID={`calendar-filter-category-${category}`}
                    onPress={() => setSelectedCategory(category)}
                    style={({ pressed }) => [styles.filterOption, pressed && styles.pressed]}
                  >
                    <View style={[styles.optionDot, { backgroundColor: color }]} />
                    <Text style={[styles.filterOptionText, { color: colors.foreground }]}>{category}</Text>
                    {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              <Text
                accessibilityRole="header"
                style={[styles.filterGroupTitle, { color: colors.mutedForeground }]}
              >
                SPIELMERKMAL
              </Text>
              {gameFeatureFilters.map((feature) => {
                const active = selectedGameFeature === feature;
                return (
                  <Pressable
                    key={feature}
                    accessibilityRole="button"
                    accessibilityLabel={`Spielmerkmal: ${feature}`}
                    accessibilityState={{ selected: active }}
                    testID={`calendar-filter-feature-${feature}`}
                    onPress={() => setSelectedGameFeature(feature)}
                    style={({ pressed }) => [styles.filterOption, pressed && styles.pressed]}
                  >
                    <View style={[styles.optionDot, { backgroundColor: feature === 'Alle Spielmerkmale' ? colors.foreground : colors.primary }]} />
                    <Text style={[styles.filterOptionText, { color: colors.foreground }]}>{feature}</Text>
                    {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              <Text
                accessibilityRole="header"
                style={[styles.filterGroupTitle, { color: colors.mutedForeground }]}
              >
                REGION
              </Text>
              <View style={styles.regionControls}>
                <View style={styles.regionStatusRow}>
                  <Feather name="map-pin" size={13} color={colors.primary} />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.regionStatusText, { color: colors.mutedForeground }]}
                    numberOfLines={2}
                  >
                    {regionStatusLabel}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      regionStatus === 'settings-required' && Platform.OS !== 'web'
                        ? 'Standortzugriff in den Einstellungen öffnen'
                        : 'Region automatisch ermitteln'
                    }
                    accessibilityState={{ disabled: isDetectingRegion }}
                    disabled={isDetectingRegion}
                    testID="calendar-region-detect"
                    onPress={() => void handleAutomaticRegion()}
                    style={({ pressed }) => [
                      styles.regionDetectButton,
                      { borderColor: colors.border },
                      pressed && styles.pressed,
                      isDetectingRegion && styles.disabled,
                    ]}
                  >
                    <Feather
                      name={regionStatus === 'settings-required' ? 'settings' : 'crosshair'}
                      size={13}
                      color={colors.primary}
                    />
                    <Text style={[styles.regionDetectText, { color: colors.primary }]}>
                      {isDetectingRegion
                        ? 'Ermittle …'
                        : regionStatus === 'settings-required' && Platform.OS !== 'web'
                          ? 'Einstellungen'
                          : 'Automatisch'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={[styles.regionPrivacyNote, { color: colors.mutedForeground }]}>
                  Ungefähr nächstgelegene Turnierregion; dein genauer Standort wird nicht gespeichert.
                </Text>
                {regionMessage ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.regionMessage, { color: colors.warning }]}
                  >
                    {regionMessage}
                  </Text>
                ) : null}
                {locationPermission?.status === 'denied' && !locationPermission.canAskAgain &&
                Platform.OS !== 'web' ? (
                  <Text style={[styles.regionPrivacyNote, { color: colors.mutedForeground }]}>
                    Du kannst den Standortzugriff auch in den Geräteeinstellungen wieder aktivieren.
                  </Text>
                ) : null}
                <View style={styles.regionOptions}>
                  {calendarRegionFilters.map((region) => {
                    const active = selectedRegion === region;
                    return (
                      <Pressable
                        key={region}
                        accessibilityRole="button"
                        accessibilityLabel={`Region: ${region}`}
                        accessibilityState={{ selected: active }}
                        testID={`calendar-filter-region-${region}`}
                        onPress={() => selectRegionManually(region)}
                        style={({ pressed }) => [
                          styles.regionOption,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.accent : colors.card,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.regionOptionText,
                            { color: active ? colors.primary : colors.foreground },
                          ]}
                        >
                          {region}
                        </Text>
                        {active ? <Feather name="check" size={13} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filter zurücksetzen"
                accessibilityState={{ disabled: !filtersActive }}
                disabled={!filtersActive}
                testID="calendar-filter-reset"
                onPress={() => {
                  setSelectedCategory('Alle Termine');
                  setSelectedGameFeature('Alle Spielmerkmale');
                  selectRegionManually('Alle Regionen');
                }}
                style={({ pressed }) => [
                  styles.filterReset,
                  { borderTopColor: colors.border, opacity: filtersActive ? 1 : 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterResetText, { color: colors.primary }]}>Filter zurücksetzen</Text>
              </Pressable>
            </View>
          ) : null}
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
  brandRow: { marginHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28, marginBottom: 12, gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 11, height: 11, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  brandName: { fontSize: 11, fontWeight: '800', letterSpacing: 2.2 },
  previewBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 26, flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  monthHeading: { marginHorizontal: 20, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  monthTitleBlock: { flexShrink: 1 },
  monthTitle: { fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: -0.8 },
  monthSub: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthArrow: { width: 38, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  todayButton: { height: 40, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  todayButtonText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  weekFooter: { marginHorizontal: 20, marginTop: 9, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  legend: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 9, fontWeight: '500' },
  monthToggle: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  monthToggleText: { fontSize: 10, fontWeight: '700' },
  filterWrap: { marginHorizontal: 19, marginBottom: 14 },
  filterButton: { minHeight: 54, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  filterTitle: { fontSize: 14, fontWeight: '700' },
  filterSelection: { flex: 1, fontSize: 13 },
  filterMenu: { borderWidth: 1, borderRadius: 16, marginTop: 7, overflow: 'hidden' },
  filterGroupTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 4 },
  filterOption: { minHeight: 45, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  regionControls: { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  regionStatusRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7 },
  regionStatusText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  regionDetectButton: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  regionDetectText: { fontSize: 10, fontWeight: '700' },
  regionPrivacyNote: { fontSize: 10, lineHeight: 14 },
  regionMessage: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  regionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 2 },
  regionOption: { minWidth: 65, minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  regionOptionText: { fontSize: 11, fontWeight: '700' },
  filterReset: { minHeight: 45, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  filterResetText: { fontSize: 13, fontWeight: '700' },
  optionDot: { width: 7, height: 7, borderRadius: 4 },
  filterOptionText: { flex: 1, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  dayHeading: { marginHorizontal: 20, marginBottom: 10 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.35 },
  dayCount: { fontSize: 10, fontWeight: '700' },
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
