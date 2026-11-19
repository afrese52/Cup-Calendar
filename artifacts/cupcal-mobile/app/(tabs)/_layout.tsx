import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

type CupCalTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

function CupCalTabBar({ state, descriptors, emitter, navigateToTab, insets }: CupCalTabBarProps) {
  const colors = useColors();
  const isWeb = Platform.OS === 'web';
  const bottomInset = isWeb ? 34 : insets.bottom;
  const barBodyHeight = isWeb ? 84 : 70;
  const selectedRoute = state.routes[state.index];
  const otherRoutes = state.routes.filter((_, index) => index !== state.index);
  const centeredRoutes = [otherRoutes[0], selectedRoute, otherRoutes[1]].filter(
    (route): route is (typeof state.routes)[number] => route !== undefined,
  );
  const lineY = barBodyHeight * 0.2;
  const notchY = barBodyHeight * 0.7;
  const topEdge = `M 0 ${lineY} H 140 C 170 ${lineY} 170 ${notchY} 200 ${notchY} C 230 ${notchY} 230 ${lineY} 260 ${lineY} H 400`;

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: bottomInset,
          height: (isWeb ? 84 : 70) + bottomInset,
        },
      ]}
    >
      <Svg
        pointerEvents="none"
        viewBox={`0 0 400 ${barBodyHeight}`}
        preserveAspectRatio="none"
        style={[StyleSheet.absoluteFill, { bottom: bottomInset, height: barBodyHeight }]}
      >
        <Path d={`${topEdge} V ${barBodyHeight} H 0 Z`} fill={colors.card} />
        <Path d={topEdge} fill="none" stroke={colors.border} strokeWidth={1} />
      </Svg>
      {bottomInset > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.safeAreaFill,
            { height: bottomInset, backgroundColor: colors.card },
          ]}
        />
      )}
      <View style={styles.tabRow}>
        {centeredRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const isFocused = route.key === selectedRoute.key;
          const iconName = route.name === 'index'
            ? 'calendar'
            : route.name === 'saved'
              ? 'bookmark'
              : 'info';

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
              testID={`tab-${route.name}`}
              onPress={onPress}
              onLongPress={() =>
                emitter.emit({ type: 'tabLongPress', target: route.key })
              }
              style={[
                styles.tabButton,
                isFocused ? styles.tabButtonActive : styles.tabButtonInactive,
              ]}
            >
              <View
                style={[
                  isFocused ? styles.iconWrapActive : styles.iconWrapInactive,
                  isFocused && {
                    backgroundColor: colors.primary,
                    shadowColor: colors.primary,
                    shadowOpacity: 0.38,
                    shadowRadius: 19,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 16,
                  },
                ]}
              >
                <Feather
                  name={iconName}
                  size={isFocused ? 24 : 18}
                  color={isFocused ? colors.primaryForeground : colors.mutedForeground}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.mutedForeground },
                  isFocused && styles.tabLabelActive,
                  !isFocused && styles.tabLabelInactive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CupCalTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Kalender' }} />
      <Tabs.Screen name="saved" options={{ title: 'Agenda' }} />
      <Tabs.Screen name="settings" options={{ title: 'Info' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 6,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  safeAreaFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabRow: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  tabButtonActive: {
    zIndex: 2,
  },
  tabButtonInactive: {
    transform: [{ scale: 0.9 }],
  },
  iconWrapActive: {
    position: 'absolute',
    top: -20,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
  },
  iconWrapInactive: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
    position: 'absolute',
    bottom: -2,
  },
  tabLabelInactive: {
    fontSize: 10,
    lineHeight: 13,
  },
});
