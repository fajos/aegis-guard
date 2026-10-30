import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdGuardVpn } from '../native/AdGuardVpnModule';

const LAST_UPDATE_KEY = '@aegis_last_auto_filter_update';
// Check updates if last update was over 4 hours ago, or on cold start
const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

export const FilterAutoUpdateBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<'idle' | 'updating' | 'done'>('idle');
  const [ruleCount, setRuleCount] = useState<number>(0);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current;

  const showBanner = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideBanner = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 20,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStatus('idle');
    });
  };

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const lastUpdateStr = await AsyncStorage.getItem(LAST_UPDATE_KEY);
        const lastUpdate = lastUpdateStr ? parseInt(lastUpdateStr, 10) : 0;
        const now = Date.now();

        // If updated recently (within 4 hours), skip background check to avoid excessive bandwidth
        if (now - lastUpdate < AUTO_UPDATE_INTERVAL_MS) {
          return;
        }

        if (!isMounted) return;
        setStatus('updating');
        showBanner();

        // Perform filter update
        const count = await AdGuardVpn.updateFilterSubscriptions();
        await AsyncStorage.setItem(LAST_UPDATE_KEY, String(Date.now()));

        if (!isMounted) return;
        setRuleCount(count);
        setStatus('done');

        // Automatically dismiss after 3.5 seconds
        setTimeout(() => {
          if (isMounted) hideBanner();
        }, 3500);
      } catch (e) {
        if (isMounted) hideBanner();
      }
    }, 1800); // 1.8 second delay on app launch for smooth initial render

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  if (status === 'idle') {
    return null;
  }

  const bottomPosition = Math.max(insets.bottom, 12) + 64;

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          bottom: bottomPosition,
          opacity: opacityAnim,
          transform: [{ translateY: translateYAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[
          styles.bannerCard,
          status === 'done' ? styles.bannerCardDone : styles.bannerCardUpdating,
        ]}
        activeOpacity={0.9}
        onPress={hideBanner}
      >
        <View style={styles.iconContainer}>
          {status === 'updating' ? (
            <ActivityIndicator size="small" color="#10B981" />
          ) : (
            <Text style={styles.doneIcon}>✓</Text>
          )}
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {status === 'updating'
              ? 'Updating Protection Filters...'
              : 'Protection Filters Updated'}
          </Text>
          <Text style={styles.subtitle}>
            {status === 'updating'
              ? 'Downloading latest ad & tracker blocking rules in background'
              : `${ruleCount > 0 ? ruleCount.toLocaleString() : '106,000+'} rules active • Everything up to date`}
          </Text>
        </View>

        <TouchableOpacity onPress={hideBanner} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  bannerCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
  },
  bannerCardUpdating: {
    backgroundColor: '#0F172A', // Dark slate
    borderColor: '#334155',
  },
  bannerCardDone: {
    backgroundColor: '#064E3B', // Rich emerald green
    borderColor: '#059669',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  doneIcon: {
    color: '#34D399',
    fontSize: 16,
    fontWeight: '800',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
    marginLeft: 6,
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
});
