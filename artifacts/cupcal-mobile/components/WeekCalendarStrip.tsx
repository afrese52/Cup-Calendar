import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { toLocalDateKey, type EventCategory, type TournamentEvent } from '@/data/events';

const CATEGORY_COLOR: Record<
  EventCategory,
  'categoryTournament' | 'categoryLeague' | 'categoryQualification' | 'categoryTraining'
> = {
  Turnier: 'categoryTournament',
  Liga: 'categoryLeague',
  Qualifikation: 'categoryQualification',
  Trainingsrunde: 'categoryTraining',
};

interface WeekCalendarStripProps {
  selectedDate: Date;
  events: TournamentEvent[];
  onSelectDate: (date: Date) => void;
}

export function WeekCalendarStrip({
  selectedDate,
  events,
  onSelectDate,
}: WeekCalendarStripProps) {
  const colors = useColors();
  const selectedKey = toLocalDateKey(selectedDate);
  const todayKey = toLocalDateKey(new Date());
  const weekDates = useMemo(() => {
    const mondayOffset = (selectedDate.getDay() + 6) % 7;
    const monday = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate() - mondayOffset,
    );
    return Array.from(
      { length: 7 },
      (_, index) =>
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index),
    );
  }, [selectedDate]);

  return (
    <View style={styles.row} accessibilityLabel="Woche auswählen">
      {weekDates.map((date) => {
        const dateKey = toLocalDateKey(date);
        const isSelected = dateKey === selectedKey;
        const isToday = dateKey === todayKey;
        const dayEvents = events.filter((event) => toLocalDateKey(event.startTime) === dateKey);
        const categories = Array.from(new Set(dayEvents.map((event) => event.category))).slice(0, 3);
        const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
          .format(date)
          .replace(/\.$/, '');
        const dateLabel = date.toLocaleDateString('de-DE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        return (
          <Pressable
            key={dateKey}
            accessibilityRole="button"
            accessibilityLabel={`${dateLabel}, ${dayEvents.length} ${dayEvents.length === 1 ? 'Termin' : 'Termine'}`}
            accessibilityState={{ selected: isSelected }}
            testID={`calendar-week-day-${dateKey}`}
            onPress={() => onSelectDate(date)}
            style={({ pressed }) => [
              styles.day,
              {
                borderColor: isSelected ? colors.primary : isToday ? colors.primary : 'transparent',
                backgroundColor: isSelected ? colors.primary : 'transparent',
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.weekday,
                { color: isSelected ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {weekday}
            </Text>
            <Text
              style={[
                styles.dayNumber,
                { color: isSelected ? colors.primaryForeground : colors.foreground },
              ]}
            >
              {date.getDate()}
            </Text>
            <View style={styles.markers} accessible={false}>
              {categories.map((category) => (
                <View
                  key={category}
                  style={[
                    styles.marker,
                    {
                      backgroundColor:
                        isSelected && category === 'Turnier'
                          ? colors.primaryForeground
                          : colors[CATEGORY_COLOR[category]],
                    },
                  ]}
                  testID={`calendar-week-marker-${dateKey}-${category}`}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 5,
    marginHorizontal: 20,
  },
  day: {
    flex: 1,
    minWidth: 0,
    height: 68,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekday: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
  },
  markers: {
    height: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  marker: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
});
