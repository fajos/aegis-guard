import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import { authenticateWithBiometrics } from '../utils/security';

export const FamilySecuritySection: React.FC = () => {
  const [familyProtectionEnabled, setFamilyProtectionEnabled] = useState(false);
  const [safeSearchEnabled, setSafeSearchEnabled] = useState(false);
  const [parentalLockEnabled, setParentalLockEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!AdGuardVpn) return;
        const [safe, locked, family] = await Promise.all([
          AdGuardVpn.isSafeSearchEnabled(),
          AdGuardVpn.isParentalLockEnabled(),
          AdGuardVpn.isFamilyProtectionEnabled(),
        ]);
        setSafeSearchEnabled(safe);
        setParentalLockEnabled(locked);
        setFamilyProtectionEnabled(family);
      } catch (e) {
        console.error('[FamilySecurity] load error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

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
          ? 'AdGuard Family Protection is now active. All pornographic domains and adult websites are blocked across the entire device on both Cellular (4G/5G) and Wi-Fi.'
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
              Biometric Protected • AdGuard Family Shield
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
});
