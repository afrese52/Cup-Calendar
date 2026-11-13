import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { TournamentEvent } from '@/data/events';
import { promptAccountSignIn } from '@/services/accountSignInPrompt';
import { useCupCal } from '@/state/AppContext';
import { getEventCountdownLabel } from '@/data/eventCountdown';

interface EventCardProps {
  event: TournamentEvent;
  isBookmarked: boolean;
  onBookmarkToggle: (eventId: string) => void;
}

export function EventCard({ event, isBookmarked, onBookmarkToggle }: EventCardProps) {
  const colors = useColors();
  const { authReady, isAuthenticated } = useCupCal();
  const [now, setNow] = useState(() => Date.now());
  const start = new Date(event.startTime);
  const dateLabel = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(start);
  const timeLabel = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
  const countdown = getEventCountdownLabel(event.startTime, event.endTime, now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, Details öffnen`}
        testID={`event-open-${event.id}`}
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={styles.topRow}>
          <View style={[styles.typePill, { backgroundColor: colors.accent }]}>
            <Text style={[styles.typeText, { color: colors.accentForeground }]}>{event.tournamentType}</Text>
          </View>
          <Text style={[styles.countdown, { color: colors.success }]}>{countdown}</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{dateLabel} · {timeLabel}</Text>
          <View style={[styles.dot, { backgroundColor: colors.border }]} />
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{event.region}</Text>
        </View>
        <View style={styles.tagRow}>
          <Text style={[styles.tag, { color: colors.secondaryForeground, backgroundColor: colors.secondary }]}>
            {event.gameMode}
          </Text>
          <Text style={[styles.tag, { color: colors.secondaryForeground, backgroundColor: colors.secondary }]}>
            {event.teamFormat}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          !authReady
            ? `${event.title}, Anmeldung wird geprüft`
            : isAuthenticated
              ? `${event.title}, ${isBookmarked ? 'Aus Merkliste entfernen' : 'In Merkliste speichern'}`
              : `${event.title}, Zum Speichern anmelden`
        }
        accessibilityState={{
          disabled: !authReady,
          busy: !authReady,
          selected: isAuthenticated && isBookmarked,
        }}
        testID={`bookmark-${event.id}`}
        disabled={!authReady}
        onPress={() => {
          if (!isAuthenticated) {
            promptAccountSignIn();
            return;
          }
          void Haptics.selectionAsync();
          onBookmarkToggle(event.id);
        }}
        style={({ pressed }) => [
          styles.bookmark,
          {
            borderColor: colors.border,
            backgroundColor: isBookmarked && isAuthenticated ? colors.accent : colors.surfaceRaised,
          },
          pressed && styles.pressed,
        ]}
        hitSlop={8}
      >
        <Feather
          name={authReady && !isAuthenticated ? 'lock' : 'bookmark'}
          size={17}
          color={isBookmarked && isAuthenticated ? colors.accentForeground : colors.mutedForeground}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  main: { flex: 1, padding: 16 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  typePill: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  typeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  countdown: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '700', lineHeight: 22, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  meta: { fontSize: 12, fontWeight: '500' },
  dot: { width: 3, height: 3, borderRadius: 2 },
  tagRow: { flexDirection: 'row', gap: 7 },
  tag: { fontSize: 11, fontWeight: '600', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
  bookmark: {
    width: 48,
    borderLeftWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
