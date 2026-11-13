import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCupCal } from '@/state/AppContext';

export function LegacyBookmarkImportPrompt() {
  const colors = useColors();
  const {
    legacyBookmarkImportCount,
    importLegacyBookmarks,
    keepLegacyBookmarksLocal,
  } = useCupCal();
  const [isSavingChoice, setIsSavingChoice] = useState(false);

  const choose = async (action: () => Promise<void>) => {
    if (isSavingChoice) return;
    setIsSavingChoice(true);
    try {
      await action();
    } finally {
      setIsSavingChoice(false);
    }
  };

  return (
    <Modal
      visible={legacyBookmarkImportCount > 0}
      transparent
      animationType="fade"
      onRequestClose={() => void choose(keepLegacyBookmarksLocal)}
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <View style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Alte Merkliste gefunden
          </Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            {legacyBookmarkImportCount === 1
              ? 'Ein alter Favorit liegt auf diesem Gerät und wurde vor der Anmeldung gespeichert. Möchtest du ihn in dieses Konto übernehmen? Andernfalls bleibt er lokal auf diesem Gerät und wird nicht hochgeladen.'
              : `${legacyBookmarkImportCount} alte Favoriten liegen auf diesem Gerät und wurden vor der Anmeldung gespeichert. Möchtest du sie in dieses Konto übernehmen? Andernfalls bleiben sie lokal auf diesem Gerät und werden nicht hochgeladen.`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSavingChoice }}
            disabled={isSavingChoice}
            testID="legacy-bookmarks-import"
            onPress={() => void choose(importLegacyBookmarks)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              (pressed || isSavingChoice) && styles.pressed,
            ]}
          >
            <Text style={[styles.primaryLabel, { color: colors.primaryForeground }]}>
              In dieses Konto übernehmen
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSavingChoice }}
            disabled={isSavingChoice}
            testID="legacy-bookmarks-keep-local"
            onPress={() => void choose(keepLegacyBookmarksLocal)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryLabel, { color: colors.mutedForeground }]}>
              Nur lokal behalten
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    gap: 14,
  },
  title: { fontSize: 20, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 21 },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  primaryLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryLabel: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
