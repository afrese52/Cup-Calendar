import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { promptAccountSignIn } from '@/services/accountSignInPrompt';
import { useCupCal } from '@/state/AppContext';
import { isEventAvailable } from '@/data/events';

export default function EventDetailsScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    events,
    bookmarkedIds,
    toggleBookmark,
    authReady,
    isAuthenticated,
  } = useCupCal();
  const event = events.find((item) => item.id === id && isEventAvailable(item));
  const headerBookmarkRef = useRef<React.ComponentRef<typeof Pressable>>(null);
  const saveButtonRef = useRef<React.ComponentRef<typeof Pressable>>(null);
  const isBookmarked = event ? bookmarkedIds.includes(event.id) : false;
  const isSavedByUser = isAuthenticated && isBookmarked;
  const handleBack = () => {
    router.replace('/(tabs)');
  };
  const handleBookmark = (restoreFocus: () => void = () => {
    if (saveButtonRef.current) AccessibilityInfo.sendAccessibilityEvent(saveButtonRef.current, 'focus');
  }) => {
    if (!authReady) return;
    if (!isAuthenticated) {
      promptAccountSignIn(event?.title ?? 'diesen Termin', restoreFocus);
      return;
    }
    if (!event) return;
    void Haptics.selectionAsync();
    void toggleBookmark(event.id);
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled
        testID="event-details-scroll-view"
      >
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
          <Text allowFontScaling style={[styles.navLabel, { color: colors.mutedForeground }]}>TURNIERDETAILS</Text>
          <Pressable
            ref={headerBookmarkRef}
            accessibilityRole="button"
            accessibilityLabel={
              !authReady
                ? `${event.title}, Anmeldung wird geprüft`
                : isAuthenticated
                  ? `${event.title}, ${isSavedByUser ? 'Aus Merkliste entfernen' : 'In Merkliste speichern'}`
                  : `${event.title}, Zum Speichern anmelden`
            }
            accessibilityState={{
              disabled: !authReady,
              busy: !authReady,
              selected: isSavedByUser,
            }}
            testID="event-detail-bookmark"
            disabled={!authReady}
            onPress={() => handleBookmark(() => {
              if (headerBookmarkRef.current) {
                AccessibilityInfo.sendAccessibilityEvent(headerBookmarkRef.current, 'focus');
              }
            })}
            style={({ pressed }) => [styles.navButton, { backgroundColor: colors.card }, pressed && styles.pressed]}
          >
            <Feather
              name={authReady && !isAuthenticated ? 'lock' : 'bookmark'}
              size={18}
              color={isSavedByUser ? colors.primary : colors.foreground}
            />
          </Pressable>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroShape} />
          <View style={[styles.heroIcon, { backgroundColor: colors.heroHighlight }]}>
            <Feather name="zap" size={20} color={colors.primary} />
          </View>
          <Text allowFontScaling style={[styles.heroEyebrow, { color: colors.heroMeta }]}>
            TURNIER · {event.region}
          </Text>
          <Text allowFontScaling style={[styles.title, { color: colors.heroForeground }]}>{event.title}</Text>
          <Text allowFontScaling style={[styles.heroCopy, { color: colors.heroMeta }]}>{event.description}</Text>
        </View>

        <View style={styles.infoGrid}>
          <InfoBlock icon="calendar" label="DATUM" value={dateLabel} />
          <InfoBlock icon="clock" label="UHRZEIT" value={`${timeLabel} Uhr`} />
          <InfoBlock icon="users" label="FORMAT" value={event.teamFormat} />
          <InfoBlock icon="target" label="REGELWERK" value={event.gameRuleset ?? event.gameMode} />
          {event.tournamentSeries ? (
            <InfoBlock icon="refresh-cw" label="SERIE" value={event.tournamentSeries} />
          ) : null}
        </View>

        <View style={[styles.notice, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Feather name="info" size={17} color={colors.warning} />
          <Text allowFontScaling style={[styles.noticeText, { color: colors.mutedForeground }]}>
            Quelle: CupCals Turnierdatenbank. Zeiten und Angaben können sich kurzfristig ändern.
          </Text>
        </View>

        <Pressable
          ref={saveButtonRef}
          accessibilityRole="button"
          accessibilityLabel={
            !authReady
              ? `${event.title}, Anmeldung wird geprüft`
              : isAuthenticated
                ? `${event.title}, ${isSavedByUser ? 'Aus Merkliste entfernen' : 'In Merkliste speichern'}`
                : `${event.title}, Zum Speichern anmelden`
          }
          accessibilityState={{
            disabled: !authReady,
            busy: !authReady,
            selected: isSavedByUser,
          }}
          testID="event-save-button"
          disabled={!authReady}
          onPress={() => handleBookmark(() => {
            if (saveButtonRef.current) AccessibilityInfo.sendAccessibilityEvent(saveButtonRef.current, 'focus');
          })}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: isSavedByUser ? colors.secondary : colors.primary },
            pressed && styles.pressed,
          ]}
        >
          <Feather
            name={!authReady || !isAuthenticated ? 'lock' : isSavedByUser ? 'check' : 'bookmark'}
            size={17}
            color={isSavedByUser ? colors.secondaryForeground : colors.primaryForeground}
          />
          <Text
            allowFontScaling
            style={[styles.saveText, { color: isSavedByUser ? colors.secondaryForeground : colors.primaryForeground }]}
          >
            {!authReady
              ? 'Anmeldung wird geprüft'
              : isSavedByUser
                ? 'In deiner Merkliste'
                : isAuthenticated
                  ? 'In Merkliste speichern'
                  : 'Zum Speichern anmelden'}
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
      <Text allowFontScaling style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text allowFontScaling style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
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
  saveButton: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  saveText: { flexShrink: 1, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  backText: { fontSize: 14, fontWeight: '700' },
});
