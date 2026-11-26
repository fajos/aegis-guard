import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import { authenticateWithBiometrics } from '../utils/security';
import {
  BedtimeSchedule,
  CATEGORY_DEFINITIONS,
  CategoryId,
  DEFAULT_SCHEDULE,
  formatHourLabel,
  isScheduleCurrentlyActive,
} from '../utils/categories';
import { CATEGORY_STORAGE_KEYS, syncCategoriesAndSafari } from '../utils/backup';

export const FamilySecuritySection: React.FC = () => {
  const [familyProtectionEnabled, setFamilyProtectionEnabled] = useState(false);
  const [safeSearchEnabled, setSafeSearchEnabled] = useState(false);
  const [parentalLockEnabled, setParentalLockEnabled] = useState(false);
  const [threatAlertsEnabled, setThreatAlertsEnabled] = useState(true);
  const [enabledCategories, setEnabledCategories] = useState<Record<CategoryId, boolean>>({
    social: false,
    gambling: false,
    gaming: false,
    dating: false,
    crypto: true,
  });
  const [schedule, setSchedule] = useState<BedtimeSchedule>(DEFAULT_SCHEDULE);
  const [isLoading, setIsLoading] = useState(true);

  const syncEnforcement = useCallback(
    async (cats: Record<CategoryId, boolean>, sched: BedtimeSchedule) => {
      await syncCategoriesAndSafari(cats, sched);
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        if (!AdGuardVpn) return;
        const [safe, locked, family, threatAlerts, rawCats, rawSched] = await Promise.all([
          AdGuardVpn.isSafeSearchEnabled(),
          AdGuardVpn.isParentalLockEnabled(),
          AdGuardVpn.isFamilyProtectionEnabled(),
          typeof AdGuardVpn.isThreatAlertsEnabled === 'function'
            ? AdGuardVpn.isThreatAlertsEnabled()
            : Promise.resolve(true),
          AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.CATEGORIES),
          AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.SCHEDULE),
        ]);
        setSafeSearchEnabled(safe);
        setParentalLockEnabled(locked);
        setFamilyProtectionEnabled(family);
        setThreatAlertsEnabled(threatAlerts);

        let parsedCats: Record<CategoryId, boolean> = {
          social: false,
          gambling: false,
          gaming: false,
          dating: false,
          crypto: true,
        };
        if (rawCats) {
          parsedCats = { ...parsedCats, ...JSON.parse(rawCats) };
        }
        setEnabledCategories(parsedCats);

        const parsedSched: BedtimeSchedule = rawSched
          ? { ...DEFAULT_SCHEDULE, ...JSON.parse(rawSched) }
          : DEFAULT_SCHEDULE;
        setSchedule(parsedSched);

        await syncEnforcement(parsedCats, parsedSched);
      } catch (e) {
        console.error('[FamilySecurity] load error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [syncEnforcement]);

  const handleToggleFamilyProtection = async (newValue: boolean) => {
    // If turning OFF, strictly require biometric authentication
    if (!newValue) {
      const ok = await authenticateWithBiometrics(
        'Scan Face ID or Fingerprint to disable Adult Content Blocking'
      );
      if (!ok) {
        return; // Retain current ON state
      }
    }

    try {
      await AdGuardVpn.setFamilyProtectionEnabled(newValue);
      setFamilyProtectionEnabled(newValue);
      Alert.alert(
        newValue ? 'Adult Content Blocked' : 'Adult Content Unblocked',
        newValue
          ? 'Aegis Family Shield is now active. All pornographic domains and adult websites are blocked across the entire device on both Cellular (4G/5G) and Wi-Fi.'
          : 'Standard protection restored. Adult website filtering is now disabled.'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update Adult Content filter');
    }
  };

  const handleToggleSafeSearch = async (newValue: boolean) => {
    if (parentalLockEnabled) {
      const ok = await authenticateWithBiometrics('Verify identity to change SafeSearch settings');
      if (!ok) return;
    }

    try {
      await AdGuardVpn.setSafeSearchEnabled(newValue);
      setSafeSearchEnabled(newValue);
      Alert.alert(
        newValue ? 'SafeSearch Enforced' : 'SafeSearch Disabled',
        newValue
          ? 'Google, YouTube, Bing, and DuckDuckGo will strictly filter explicit results and adult videos.'
          : 'Standard search engine rules restored.'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update SafeSearch setting');
    }
  };

  const handleToggleParentalLock = async (newValue: boolean) => {
    const ok = await authenticateWithBiometrics(
      newValue
        ? 'Scan Face ID or Fingerprint to enable Parental Lock'
        : 'Scan Face ID or Fingerprint to unlock settings'
    );
    if (!ok) return;

    try {
      await AdGuardVpn.setParentalLockEnabled(newValue);
      setParentalLockEnabled(newValue);
      Alert.alert(
        newValue ? 'Parental Lock Enabled' : 'Parental Lock Disabled',
        newValue
          ? 'Protection settings and filters are now locked with biometric security (Face ID / Fingerprint).'
          : 'Biometric lock has been removed from settings.'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update Parental Lock');
    }
  };

  const handleToggleThreatAlerts = async (newValue: boolean) => {
    if (!newValue && parentalLockEnabled) {
      const ok = await authenticateWithBiometrics('Verify identity to disable Phishing Alerts');
      if (!ok) return;
    }
    try {
      if (typeof AdGuardVpn.setThreatAlertsEnabled === 'function') {
        await AdGuardVpn.setThreatAlertsEnabled(newValue);
      }
      setThreatAlertsEnabled(newValue);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update Threat Alerts');
    }
  };

  const handleToggleCategory = async (categoryId: CategoryId) => {
    const nextVal = !enabledCategories[categoryId];
    if (!nextVal && parentalLockEnabled) {
      const ok = await authenticateWithBiometrics('Authenticate to unblock category filter');
      if (!ok) return;
    }
    const nextCats = { ...enabledCategories, [categoryId]: nextVal };
    setEnabledCategories(nextCats);
    await AsyncStorage.setItem(CATEGORY_STORAGE_KEYS.CATEGORIES, JSON.stringify(nextCats)).catch(() => {});
    await syncEnforcement(nextCats, schedule);
  };

  const updateSchedule = async (nextSched: BedtimeSchedule, requireAuth: boolean) => {
    if (requireAuth && parentalLockEnabled) {
      const ok = await authenticateWithBiometrics('Authenticate to modify Bedtime Schedule');
      if (!ok) return;
    }
    setSchedule(nextSched);
    await AsyncStorage.setItem(CATEGORY_STORAGE_KEYS.SCHEDULE, JSON.stringify(nextSched)).catch(() => {});
    await syncEnforcement(enabledCategories, nextSched);
  };

  if (isLoading) {
    return null;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
      {/* Block Adult Content Card (Hero) */}
      <View style={[styles.card, familyProtectionEnabled ? styles.cardFamilyActive : null]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🔞</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Block Adult & Explicit Websites</Text>
            <Text style={styles.cardSubtitle}>
              Biometric Protected • Aegis Family Shield
            </Text>
          </View>
          <Switch
            value={familyProtectionEnabled}
            onValueChange={handleToggleFamilyProtection}
            trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
            thumbColor={familyProtectionEnabled ? '#10B981' : '#F3F4F6'}
          />
        </View>

        <Text style={styles.cardDescription}>
          Blocks access to all pornographic, adult, and explicit NSFW websites across the entire phone on both Wi-Fi and Cellular (4G/5G).
        </Text>

        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>
            • <Text style={styles.bulletBold}>Direct Domain Blocking:</Text> Direct browser visits to adult sites fail to load (0.0.0.0 sinkhole).
          </Text>
          <Text style={styles.bulletItem}>
            • <Text style={styles.bulletBold}>SafeSearch Included:</Text> Automatically enforces strict SafeSearch across Google, Bing, DuckDuckGo, and YouTube.
          </Text>
          <Text style={styles.bulletItem}>
            • <Text style={styles.bulletBold}>Biometric Lock:</Text> Requires Face ID, Touch ID, or Device PIN to turn off.
          </Text>
        </View>
      </View>

      {/* SafeSearch Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🔍</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Enforce SafeSearch Only</Text>
            <Text style={styles.cardSubtitle}>
              Search engine query filtering
            </Text>
          </View>
          <Switch
            value={safeSearchEnabled}
            onValueChange={handleToggleSafeSearch}
            trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
            thumbColor={safeSearchEnabled ? '#10B981' : '#F3F4F6'}
          />
        </View>

        <Text style={styles.cardDescription}>
          Filters explicit images and adult query suggestions from search engine results:
        </Text>

        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• <Text style={styles.bulletBold}>Google:</Text> forcesafesearch.google.com</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bulletBold}>YouTube:</Text> restrict.youtube.com (Restricted Mode)</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bulletBold}>Bing:</Text> strict.bing.com</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bulletBold}>DuckDuckGo:</Text> safe.duckduckgo.com</Text>
        </View>
      </View>

      {/* Biometric Security Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🔐</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Biometric Parental Lock</Text>
            <Text style={styles.cardSubtitle}>
              Require Face ID / Fingerprint / PIN
            </Text>
          </View>
          <Switch
            value={parentalLockEnabled}
            onValueChange={handleToggleParentalLock}
            trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
            thumbColor={parentalLockEnabled ? '#10B981' : '#F3F4F6'}
          />
        </View>

        <Text style={styles.cardDescription}>
          Prevents unauthorized changes. Anyone attempting to pause protection or delete filter rules will be prompted for device biometric authentication.
        </Text>
      </View>

      {/* Real-Time Phishing & Threat Alerts Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🚨</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Real-Time Phishing Alerts</Text>
            <Text style={styles.cardSubtitle}>
              Instant on-device notification on blocked phishing/scam links
            </Text>
          </View>
          <Switch
            value={threatAlertsEnabled}
            onValueChange={handleToggleThreatAlerts}
            trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
            thumbColor={threatAlertsEnabled ? '#DC2626' : '#F3F4F6'}
          />
        </View>

        <Text style={styles.cardDescription}>
          Alerts you immediately with a local notification whenever the VPN tunnel blocks a clicked phishing link, Punycode lookalike domain, or cryptomining script.
        </Text>
      </View>

      {/* 1-Tap Category Blockers */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🗂️</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Category Blockers</Text>
            <Text style={styles.cardSubtitle}>
              1-tap blocking synced to Local VPN &amp; Safari Blocker
            </Text>
          </View>
        </View>

        {CATEGORY_DEFINITIONS.map((cat) => (
          <View key={cat.id} style={styles.catRow}>
            <Text style={styles.catIcon}>{cat.icon}</Text>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.catTitle}>{cat.title}</Text>
              <Text style={styles.catDesc}>{cat.description}</Text>
            </View>
            <Switch
              value={!!enabledCategories[cat.id]}
              onValueChange={() => handleToggleCategory(cat.id)}
              trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
              thumbColor={enabledCategories[cat.id] ? '#10B981' : '#F3F4F6'}
            />
          </View>
        ))}
      </View>

      {/* Bedtime & Study Schedule */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🌙</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Bedtime &amp; Focus Schedule</Text>
            <Text style={styles.cardSubtitle}>
              {isScheduleCurrentlyActive(schedule)
                ? 'Active now — blocking scheduled categories'
                : 'Auto-block selected apps during downtime hours'}
            </Text>
          </View>
          <Switch
            value={schedule.enabled}
            onValueChange={(val) => updateSchedule({ ...schedule, enabled: val }, !val)}
            trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
            thumbColor={schedule.enabled ? '#2563EB' : '#F3F4F6'}
          />
        </View>

        <View style={styles.timeRow}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Starts</Text>
            <View style={styles.timeStepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  updateSchedule({ ...schedule, startHour: (schedule.startHour + 23) % 24 }, true)
                }
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.timeVal}>{formatHourLabel(schedule.startHour)}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  updateSchedule({ ...schedule, startHour: (schedule.startHour + 1) % 24 }, true)
                }
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Ends</Text>
            <View style={styles.timeStepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  updateSchedule({ ...schedule, endHour: (schedule.endHour + 23) % 24 }, true)
                }
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.timeVal}>{formatHourLabel(schedule.endHour)}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  updateSchedule({ ...schedule, endHour: (schedule.endHour + 1) % 24 }, true)
                }
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={styles.schedHint}>Scheduled Categories:</Text>
        <View style={styles.schedChipsRow}>
          {CATEGORY_DEFINITIONS.map((cat) => {
            const active = schedule.categories.includes(cat.id);
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.schedChip, active && styles.schedChipActive]}
                onPress={() => {
                  const next = active
                    ? schedule.categories.filter((c) => c !== cat.id)
                    : [...schedule.categories, cat.id];
                  updateSchedule({ ...schedule, categories: next }, active);
                }}
              >
                <Text style={[styles.schedChipText, active && styles.schedChipTextActive]}>
                  {cat.icon} {cat.title.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Info Card */}
      <View style={styles.infoBox}>
        <Text style={styles.infoBoxText}>
          🛡️ <Text style={styles.infoBoxBold}>Family Shield Guarantee:</Text> Adult content filtering and biometric locks operate with zero data logging. No browsing history or personal data is ever recorded.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardFamilyActive: {
    borderColor: '#6EE7B7',
    borderWidth: 1.5,
    backgroundColor: '#F0FDF4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 26,
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cardDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 8,
  },
  bulletList: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  bulletItem: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 20,
  },
  bulletBold: {
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 4,
  },
  infoBoxText: {
    fontSize: 12,
    color: '#065F46',
    lineHeight: 18,
  },
  infoBoxBold: {
    fontWeight: '700',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  catIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  catTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111827',
  },
  catDesc: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 1,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  timeBox: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  timeVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  schedHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  schedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  schedChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  schedChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  schedChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  schedChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
});
