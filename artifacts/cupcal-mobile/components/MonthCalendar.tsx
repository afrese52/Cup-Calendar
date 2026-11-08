import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { toLocalDateKey, type EventCategory, type TournamentEvent } from '@/data/events';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const CATEGORY_TOKEN: Record<EventCategory, 'categoryTournament' | 'categoryLeague' | 'categoryQualification' | 'categoryTraining'> = {
  Turnier: 'categoryTournament',
  Liga: 'categoryLeague',
  Qualifikation: 'categoryQualification',
  Trainingsrunde: 'categoryTraining',
};

interface MonthCalendarProps {
  currentMonth: Date;
  selectedDate: Date;
  events: TournamentEvent[];
  onSelectDate: (date: Date) => void;
}

export function MonthCalendar({ currentMonth, selectedDate, events, onSelectDate }: MonthCalendarProps) {
  const colors = useColors();
  const todayKey = toLocalDateKey(new Date());
  const selectedKey = toLocalDateKey(selectedDate);
  const days = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const firstCell = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstCell);
      date.setDate(firstCell.getDate() + index);
      return date;
    });
  }, [currentMonth]);

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.weekHeader}>
        {WEEKDAYS.map((weekday, index) => (
          <Text
            key={weekday}
            style={[
              styles.weekday,
              { color: index > 4 ? colors.mutedForeground : colors.mutedForeground },
            ]}
          >
            {weekday}
          </Text>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.weekRow}>
          {days.slice(weekIndex * 7, weekIndex * 7 + 7).map((date) => {
            const dateKey = toLocalDateKey(date);
            const isSelected = dateKey === selectedKey;
            const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
            const isToday = dateKey === todayKey;
            const dayCategories = Array.from(
              new Set(events.filter((event) => toLocalDateKey(event.startTime) === dateKey).map((event) => event.category)),
            ).slice(0, 3);

            return (
              <Pressable
                key={dateKey}
                accessibilityRole="button"
                accessibilityLabel={`${date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${dayCategories.length ? `, ${dayCategories.length} Kategorien mit Terminen` : ''}`}
                accessibilityState={{ selected: isSelected }}
                testID={`calendar-day-${dateKey}`}
                onPress={() => onSelectDate(date)}
                style={({ pressed }) => [
                  styles.dayCell,
                  isToday && !isSelected ? { borderColor: colors.primary, borderWidth: 1 } : null,
                  isSelected ? { backgroundColor: colors.primary } : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    { color: isSelected ? colors.primaryForeground : isCurrentMonth ? colors.foreground : colors.mutedForeground },
                    !isCurrentMonth && !isSelected ? styles.outsideMonth : null,
                  ]}
                >
                  {date.getDate()}
                </Text>
                <View style={styles.dots}>
                  {dayCategories.map((category) => (
                    <View
                      key={category}
                      style={[
                        styles.eventDot,
                        { backgroundColor: isSelected ? colors.primaryForeground : colors[CATEGORY_TOKEN[category]] },
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 19, borderWidth: 1, borderRadius: 25, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 10 },
  weekHeader: { flexDirection: 'row', marginBottom: 3 },
  weekday: { flex: 1, height: 29, textAlign: 'center', textAlignVertical: 'center', fontSize: 11, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 1 },
  dayCell: { flex: 1, height: 49, marginHorizontal: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  outsideMonth: { opacity: 0.47 },
  dots: { height: 6, marginTop: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },
  pressed: { opacity: 0.72 },
});
