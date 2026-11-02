import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';

export type LegalTab = 'privacy' | 'terms';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  visible,
  onClose,
  initialTab = 'privacy',
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const handleOpenExternal = async () => {
    const url =
      activeTab === 'privacy'
        ? 'https://github.com/fajos/aegis-guard/blob/main/PRIVACY.md'
        : 'https://github.com/fajos/aegis-guard/blob/main/TERMS.md';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Notice', `Please visit:\n${url}`);
      }
    } catch (e) {
      Alert.alert('Notice', `Please visit:\n${url}`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerIcon}>{activeTab === 'privacy' ? '🔒' : '📜'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>
                  {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  Aegis Guard • Fajostechnologies Ltd
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Segmented Switcher */}
            <View style={styles.segmentedContainer}>
              <TouchableOpacity
                style={[styles.segmentButton, activeTab === 'privacy' && styles.segmentButtonActive]}
                onPress={() => setActiveTab('privacy')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.segmentText, activeTab === 'privacy' && styles.segmentTextActive]}
                >
                  🔒 Privacy Policy
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, activeTab === 'terms' && styles.segmentButtonActive]}
                onPress={() => setActiveTab('terms')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.segmentText, activeTab === 'terms' && styles.segmentTextActive]}
                >
                  📜 Terms of Service
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Body Content */}
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.scrollContent}
          >
            {activeTab === 'privacy' ? (
              <View>
                {/* Zero Logs Assurance Banner */}
                <View style={styles.zeroLogsCard}>
                  <Text style={styles.zeroLogsTitle}>🛡️ Strict Zero-Logs Guarantee</Text>
                  <Text style={styles.zeroLogsDesc}>
                    Aegis Guard does NOT collect, store, profile, track, or share your DNS queries,
                    browsing history, IP address, or personal data. All filtering is strictly
                    on-device or via encrypted DNS-over-HTTPS (DoH).
                  </Text>
                  <View style={styles.badgesRow}>
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>✓ No Browsing History</Text>
                    </View>
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>✓ No Remote DNS Logs</Text>
                    </View>
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>✓ No Ad Tracking IDs</Text>
                    </View>
                  </View>
                </View>

                {/* Section 1 */}
                <Text style={styles.sectionHeading}>1. Information We DO NOT Collect</Text>
                <Text style={styles.paragraph}>
                  Unlike traditional VPN providers, Aegis Guard operates on a strict zero-knowledge
                  architecture. We do not operate remote tracking proxy servers. We never see or record:
                </Text>
                <Text style={styles.bulletItem}>• The websites, apps, or streaming links you access</Text>
                <Text style={styles.bulletItem}>• Your public, Wi-Fi, or cellular IP address</Text>
                <Text style={styles.bulletItem}>• Your device advertising identifier (IDFA / GAID)</Text>
                <Text style={styles.bulletItem}>• Your real name, physical location, or email address</Text>

                {/* Section 2 */}
                <Text style={styles.sectionHeading}>2. How Filtering Works On-Device</Text>
                <Text style={styles.paragraph}>
                  <Text style={styles.bold}>• On iOS:</Text> Aegis Guard sets up a secure, encrypted
                  DNS-over-HTTPS (DoH) profile using Apple's official NetworkExtension API. Lookups
                  are encrypted directly to chosen upstream resolvers. We operate no intermediate
                  proxy that could inspect your traffic.
                </Text>
                <Text style={styles.paragraph}>
                  <Text style={styles.bold}>• On Android:</Text> A local loopback TUN interface runs
                  directly on your device. Filtering occurs 100% on-processor with zero data exiting
                  to third-party inspection servers.
                </Text>

                {/* Section 3 */}
                <Text style={styles.sectionHeading}>3. Local Device Storage Only</Text>
                <Text style={styles.paragraph}>
                  Recent query logs, custom AdBlock rules, app bypass selections, and your 3-day trial
                  status are stored strictly in your device's isolated local app sandbox. This data
                  never leaves your physical device and can be erased anytime using the "Clear Logs"
                  feature.
                </Text>

                {/* Section 4 */}
                <Text style={styles.sectionHeading}>4. In-App Purchases & Payments</Text>
                <Text style={styles.paragraph}>
                  The optional Lifetime Pro license is handled entirely by Apple App Store (StoreKit)
                  or Google Play Billing. We never receive, process, or store your credit card or
                  banking credentials.
                </Text>

                {/* Section 5 */}
                <Text style={styles.sectionHeading}>5. Children & Family Protection</Text>
                <Text style={styles.paragraph}>
                  Aegis Guard complies with COPPA and GDPR-K. We do not knowingly collect information
                  from children under 13. Our optional Family Shield mode blocks adult and explicit
                  content to provide a safer browsing environment for families.
                </Text>

                {/* Section 6 */}
                <Text style={styles.sectionHeading}>6. Contact Information</Text>
                <Text style={styles.paragraph}>
                  For questions regarding our privacy practices, contact us at:
                  {'\n'}
                  <Text style={styles.bold}>privacy@fajostech.com</Text> or{' '}
                  <Text style={styles.bold}>support@fajostech.com</Text>
                </Text>
              </View>
            ) : (
              <View>
                {/* Terms Summary Card */}
                <View style={styles.zeroLogsCard}>
                  <Text style={styles.zeroLogsTitle}>📜 License Agreement & Terms</Text>
                  <Text style={styles.zeroLogsDesc}>
                    By using Aegis Guard, you agree to these terms. Aegis Guard grants you a personal,
                    non-exclusive, non-transferable license to use this app on your devices.
                  </Text>
                </View>

                {/* Section 1 */}
                <Text style={styles.sectionHeading}>1. Acceptance of Terms</Text>
                <Text style={styles.paragraph}>
                  By installing and opening Aegis Guard, you agree to comply with and be bound by
                  these Terms of Service. If you do not agree, please uninstall the app.
                </Text>

                {/* Section 2 */}
                <Text style={styles.sectionHeading}>2. 3-Day Trial & Lifetime Pro</Text>
                <Text style={styles.paragraph}>
                  Aegis Guard includes a 3-day free trial providing full access to all features,
                  including in-app ad blocking and split-tunneling. Following trial expiration, the
                  app reverts to Basic Mode (encrypted DNS privacy). Users can unlock permanent full
                  protection with a one-off Lifetime Pro in-app purchase with zero recurring subscriptions.
                </Text>

                {/* Section 3 */}
                <Text style={styles.sectionHeading}>3. Acceptable Use</Text>
                <Text style={styles.paragraph}>
                  You agree to use Aegis Guard strictly for lawful personal purposes and not to
                  interfere with the operation of third-party network services or attempt to reverse-engineer
                  the application.
                </Text>

                {/* Section 4 */}
                <Text style={styles.sectionHeading}>4. Disclaimer of Warranties</Text>
                <Text style={styles.paragraph}>
                  Aegis Guard is provided "as is" and "as available". While we maintain advanced
                  filtering and DNS protection, we do not guarantee that every advertisement or
                  tracker will be blocked, or that content will never be inadvertently impacted.
                </Text>

                {/* Section 5 */}
                <Text style={styles.sectionHeading}>5. Contact & Inquiries</Text>
                <Text style={styles.paragraph}>
                  For support inquiries regarding these terms:
                  {'\n'}
                  <Text style={styles.bold}>support@fajostech.com</Text>
                </Text>
              </View>
            )}

            {/* External Web Link Action */}
            <TouchableOpacity
              style={styles.externalButton}
              onPress={handleOpenExternal}
              activeOpacity={0.7}
            >
              <Text style={styles.externalButtonText}>
                🌐 View Full {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms'} on GitHub / Web
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.doneButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.doneButtonText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  zeroLogsCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  zeroLogsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 4,
  },
  zeroLogsDesc: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 17,
    marginBottom: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgePill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '700',
    color: '#1F2937',
  },
  bulletItem: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    marginLeft: 6,
    marginBottom: 3,
  },
  externalButton: {
    marginTop: 18,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  externalButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  doneButton: {
    backgroundColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
