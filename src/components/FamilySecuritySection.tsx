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
  const [safeSearchEnabled, setSafeSearchEnabled] = useState(false);
  const [parentalLockEnabled, setParentalLockEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!AdGuardVpn) return;
        const [safe, locked] = await Promise.all([
          AdGuardVpn.isSafeSearchEnabled(),
          AdGuardVpn.isParentalLockEnabled(),
        ]);
        setSafeSearchEnabled(safe);
        setParentalLockEnabled(locked);
      } catch (e) {
        console.error('[FamilySecurity] load error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

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
      {/* SafeSearch Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🔍</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Enforce SafeSearch</Text>
            <Text style={styles.cardSubtitle}>
              DNS-level restriction for adult queries & videos
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
          Automatically rewrites search engine queries to their official SafeSearch VIPs:
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
          Prevents unauthorized changes. Anyone attempting to pause VPN protection, disable SafeSearch, or delete filter rules will be prompted for device biometric authentication.
        </Text>
      </View>

      {/* Info Card */}
      <View style={styles.infoBox}>
        <Text style={styles.infoBoxText}>
          🛡️ <Text style={styles.infoBoxBold}>Family Shield Guarantee:</Text> SafeSearch and Parental Locks operate strictly on-device inside Aegis Guard. No browsing history or personal data is ever recorded.
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
