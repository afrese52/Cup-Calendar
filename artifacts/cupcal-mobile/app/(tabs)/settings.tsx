import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';

const DISCLAIMER =
  'Teile der verwendeten Materialien sind Marken und/oder urheberrechtlich geschützte Werke von Epic Games, Inc. Alle Rechte vorbehalten. Dieses Material ist inoffiziell und wird nicht von Epic Games unterstützt.';

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: destructive ? colors.destructive + '20' : colors.secondary }]}>
        <Feather name={icon} size={17} color={destructive ? colors.destructive : colors.secondaryForeground} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: destructive ? colors.destructive : colors.foreground }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      {onPress ? <Feather name="chevron-right" size={17} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { bookmarkedIds, clearBookmarks, storageError } = useCupCal();

  const confirmClear = () => {
    Alert.alert(
      'Favoriten löschen?',
      'Alle lokal gespeicherten Turniere werden aus deiner Merkliste entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => void clearBookmarks(),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 67 : 10, paddingBottom: Platform.OS === 'web' ? 100 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.primary }]}>CUPCAL</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>Mehr</Text>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Deine App-Einstellungen und Informationen.</Text>

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>APP</Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="wifi-off" title="Offline verfügbar" subtitle="Deine Merkliste wird auf diesem Gerät gespeichert." />
          <SettingRow icon="bookmark" title="Gespeicherte Turniere" subtitle={`${bookmarkedIds.length} in deiner Merkliste`} />
          <SettingRow
            icon="trash-2"
            title="Favoriten löschen"
            subtitle="Entfernt alle lokal gespeicherten Favoriten."
            onPress={() => {
              void Haptics.selectionAsync();
              confirmClear();
            }}
            destructive
          />
        </View>

        {storageError ? <Text style={[styles.error, { color: colors.warning }]}>{storageError}</Text> : null}

        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>ÜBER CUPCAL</Text>
        <View style={[styles.about, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.aboutTitle, { color: colors.foreground }]}>Inoffizielle Begleit-App</Text>
          <Text style={[styles.aboutCopy, { color: colors.mutedForeground }]}>
            CupCal ist ein unabhängiges Fanprojekt. Fortnite-Wettbewerbe und Turniertermine sind kostenlos zugänglich.
          </Text>
          <Text style={[styles.disclaimer, { color: colors.mutedForeground, borderTopColor: colors.border }]}>{DISCLAIMER}</Text>
        </View>
        <Text style={[styles.version, { color: colors.mutedForeground }]}>CupCal · Vorschau</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 8, marginTop: 12 },
  heading: { fontSize: 30, fontWeight: '700', letterSpacing: -0.7 },
  intro: { fontSize: 13, marginTop: 5, marginBottom: 25 },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 9, marginLeft: 3 },
  group: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, marginBottom: 23 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.7 },
  about: { borderWidth: 1, borderRadius: 18, padding: 16 },
  aboutTitle: { fontSize: 14, fontWeight: '700', marginBottom: 7 },
  aboutCopy: { fontSize: 12, lineHeight: 18, marginBottom: 13 },
  disclaimer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, fontSize: 10, lineHeight: 15 },
  error: { fontSize: 12, marginTop: -13, marginBottom: 18 },
  version: { textAlign: 'center', marginTop: 18, fontSize: 10 },
});
