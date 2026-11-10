import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';

export default function EventDetailsScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { events, bookmarkedIds, toggleBookmark } = useCupCal();
  const event = events.find((item) => item.id === id);
  const isBookmarked = event ? bookmarkedIds.includes(event.id) : false;
  const handleBack = () => {
    router.replace('/(tabs)');
  };

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.notFound}>
          <Text style={[styles.title, { color: colors.foreground }]}>Turnier nicht gefunden</Text>
          <Pressable accessibilityRole="button" onPress={handleBack}>
            <Text style={[styles.backText, { color: colors.primary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const dateLabel = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(start);
  const timeLabel = `${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(start)}–${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(end)}`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zurück"
            testID="event-back"
            onPress={handleBack}
            style={({ pressed }) => [styles.navButton, { backgroundColor: colors.card }, pressed && styles.pressed]}
          >
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.navLabel, { color: colors.mutedForeground }]}>TURNIERDETAILS</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? 'Aus Merkliste entfernen' : 'In Merkliste speichern'}
            testID="event-detail-bookmark"
            onPress={() => {
              void Haptics.selectionAsync();
              void toggleBookmark(event.id);
            }}
            style={({ pressed }) => [styles.navButton, { backgroundColor: colors.card }, pressed && styles.pressed]}
          >
            <Feather name="bookmark" size={18} color={isBookmarked ? colors.primary : colors.foreground} />
          </Pressable>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroShape} />
          <View style={[styles.heroIcon, { backgroundColor: colors.heroHighlight }]}>
            <Feather name="zap" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.heroEyebrow, { color: colors.heroMeta }]}>BEISPIELTERMIN · {event.region}</Text>
          <Text style={[styles.title, { color: colors.heroForeground }]}>{event.title}</Text>
          <Text style={[styles.heroCopy, { color: colors.heroMeta }]}>{event.description}</Text>
        </View>

        <View style={styles.infoGrid}>
          <InfoBlock icon="calendar" label="DATUM" value={dateLabel} />
          <InfoBlock icon="clock" label="UHRZEIT" value={`${timeLabel} Uhr`} />
          <InfoBlock icon="users" label="FORMAT" value={event.teamFormat} />
          <InfoBlock icon="target" label="MODUS" value={event.gameMode} />
        </View>

        <View style={[styles.notice, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Feather name="info" size={17} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            Das sind Beispieldaten. Aktuelle offizielle Turniertermine werden angezeigt, sobald die Live-Datenquelle verbunden ist.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          testID="event-save-button"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void toggleBookmark(event.id);
          }}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: isBookmarked ? colors.secondary : colors.primary },
            pressed && styles.pressed,
          ]}
        >
          <Feather
            name={isBookmarked ? 'check' : 'bookmark'}
            size={17}
            color={isBookmarked ? colors.secondaryForeground : colors.primaryForeground}
          />
          <Text style={[styles.saveText, { color: isBookmarked ? colors.secondaryForeground : colors.primaryForeground }]}>
            {isBookmarked ? 'In deiner Merkliste' : 'In Merkliste speichern'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoBlock({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.info, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  nav: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  navLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  hero: { borderRadius: 24, minHeight: 240, padding: 22, overflow: 'hidden', justifyContent: 'flex-end', marginBottom: 15 },
  heroShape: { position: 'absolute', top: -46, right: -46, width: 190, height: 190, borderRadius: 100, opacity: 0.7 },
  heroIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 25 },
  heroEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, lineHeight: 31 },
  heroCopy: { fontSize: 13, lineHeight: 19, marginTop: 9, maxWidth: 290 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  info: { width: '48%', flexGrow: 1, minHeight: 107, borderWidth: 1, borderRadius: 17, padding: 13, justifyContent: 'space-between' },
  infoLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  infoValue: { fontSize: 13, lineHeight: 18, fontWeight: '700', textTransform: 'capitalize' },
  notice: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 15 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  saveButton: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  saveText: { fontSize: 14, fontWeight: '700' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  backText: { fontSize: 14, fontWeight: '700' },
});
