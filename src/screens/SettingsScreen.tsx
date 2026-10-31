import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DnsSettingsScreen } from './DnsSettingsScreen';
import { UserRulesScreen } from './UserRulesScreen';
import { FamilySecuritySection } from '../components/FamilySecuritySection';
import { useLicense } from '../hooks/useLicense';
import { LifetimePaywallModal } from '../components/LifetimePaywallModal';

export type SettingsSubTab = 'dns' | 'rules' | 'security';

interface SettingsScreenProps {
  initialSubTab?: SettingsSubTab;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ initialSubTab = 'dns' }) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialSubTab);
  const { isLifetimePurchased, isTrialActive, trialExpired, daysRemaining, hoursRemaining } = useLicense();
  const [paywallVisible, setPaywallVisible] = useState(false);

  return (
    <View style={styles.container}>
      {/* Header with Segmented Switcher */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings & Protection</Text>
        <Text style={styles.headerSubtitle}>
          Configure upstream resolvers, custom syntax, and family safety
        </Text>

        {/* License Status Card */}
        <TouchableOpacity
          style={
            isLifetimePurchased
              ? styles.proLicenseCard
              : isTrialActive
              ? styles.trialLicenseCard
              : styles.expiredLicenseCard
          }
          onPress={() => setPaywallVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.licenseCardLeft}>
            <Text style={styles.licenseCardIcon}>
              {isLifetimePurchased ? '👑' : isTrialActive ? '✨' : '⚠️'}
            </Text>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.licenseCardTitle}>
                {isLifetimePurchased
                  ? 'Lifetime Pro (Active)'
                  : isTrialActive
                  ? `3-Day Free Trial (${daysRemaining > 0 ? `${daysRemaining}d ${hoursRemaining}h left` : `${hoursRemaining}h left`})`
                  : 'Basic Mode (Trial Expired)'}
              </Text>
              <Text style={styles.licenseCardSub}>
                {isLifetimePurchased
                  ? 'All in-app ad blocking & premium features unlocked forever'
                  : isTrialActive
                  ? 'Full in-app ad blocking active. Tap to lock in Lifetime Pro.'
                  : 'In-app ad blocking paused. Tap to unlock Lifetime Pro.'}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.licenseActionPill,
              isLifetimePurchased && styles.licenseActionPillPro,
              trialExpired && styles.licenseActionPillExpired,
            ]}
          >
            <Text
              style={[
                styles.licenseActionText,
                isLifetimePurchased && styles.licenseActionTextPro,
                trialExpired && styles.licenseActionTextExpired,
              ]}
            >
              {isLifetimePurchased ? 'PRO' : isTrialActive ? 'Upgrade' : '$4.99'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentButton, activeSubTab === 'dns' && styles.segmentButtonActive]}
            onPress={() => setActiveSubTab('dns')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, activeSubTab === 'dns' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              🌐 DNS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentButton, activeSubTab === 'rules' && styles.segmentButtonActive]}
            onPress={() => setActiveSubTab('rules')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, activeSubTab === 'rules' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              ✏️ Rules
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentButton, activeSubTab === 'security' && styles.segmentButtonActive]}
            onPress={() => setActiveSubTab('security')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, activeSubTab === 'security' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              👨‍👩‍👧 Family
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Nested Sub-Screen View */}
      <View style={styles.content}>
        {activeSubTab === 'dns' ? (
          <DnsSettingsScreen isNested />
        ) : activeSubTab === 'rules' ? (
          <UserRulesScreen isNested />
        ) : (
          <FamilySecuritySection />
        )}
      </View>

      {/* Lifetime Pro Paywall Modal */}
      <LifetimePaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 10,
  },
  proLicenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  trialLicenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  expiredLicenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  licenseCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  licenseCardIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  licenseCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  licenseCardSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
    lineHeight: 14,
  },
  licenseActionPill: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  licenseActionPillPro: {
    backgroundColor: '#D97706',
  },
  licenseActionPillExpired: {
    backgroundColor: '#DC2626',
  },
  licenseActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  licenseActionTextPro: {
    color: '#FFFFFF',
  },
  licenseActionTextExpired: {
    color: '#FFFFFF',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
