import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLicense } from '../hooks/useLicense';

interface LifetimePaywallModalProps {
  visible: boolean;
  onClose: () => void;
  reason?: string;
}

export const LifetimePaywallModal: React.FC<LifetimePaywallModalProps> = ({
  visible,
  onClose,
  reason,
}) => {
  const { purchaseLifetime, restorePurchases } = useLicense();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePurchase = async () => {
    setIsProcessing(true);
    try {
      const success = await purchaseLifetime();
      if (success) {
        Alert.alert(
          '🎉 Lifetime Pro Unlocked!',
          'Thank you for supporting Aegis Guard. Full in-app ad blocking and all premium features are now unlocked forever on your device.',
          [{ text: 'Awesome', onPress: onClose }]
        );
      } else {
        Alert.alert('Error', 'Unable to complete purchase. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Purchase failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    setIsProcessing(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert(
          'Purchase Restored',
          'Your Lifetime Pro license was successfully restored!',
          [{ text: 'OK', onPress: onClose }]
        );
      } else {
        Alert.alert(
          'No Purchase Found',
          'We could not find an active Lifetime Pro purchase on this account.'
        );
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message || 'Failed to restore purchases');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Crown & Hero Header */}
            <View style={styles.heroHeader}>
              <View style={styles.crownCircle}>
                <Text style={styles.crownEmoji}>👑</Text>
              </View>
              <Text style={styles.heroTitle}>Aegis Guard Lifetime</Text>
              <Text style={styles.heroSubtitle}>
                Pay once. Keep forever. Zero monthly or annual subscriptions.
              </Text>
            </View>

            {/* Custom Reason Callout if triggered by a locked feature */}
            {reason ? (
              <View style={styles.reasonCard}>
                <Text style={styles.reasonText}>🔒 {reason}</Text>
              </View>
            ) : null}

            {/* Price Badge Hero */}
            <View style={styles.priceContainer}>
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>🔥 50% OFF LAUNCH SPECIAL</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.originalPrice}>$9.99</Text>
                <Text style={styles.finalPrice}>$4.99</Text>
              </View>
              <Text style={styles.pricePeriod}>One-time payment • Lifetime access</Text>
            </View>

            {/* Value Highlights */}
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>🚫</Text>
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Full In-App Ad Blocking</Text>
                  <Text style={styles.featureDescription}>
                    Eliminate video popups & banner ads in GSE Smart IPTV, streaming apps, and games.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>🎮</Text>
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Unlimited Game Mode</Text>
                  <Text style={styles.featureDescription}>
                    1-tap auto-resuming snooze timer to claim rewarded video ads, gems & coins on demand.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>📱</Text>
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Split-Tunneling & Game Library</Text>
                  <Text style={styles.featureDescription}>
                    One-tap exclusion for 13+ popular mobile games and custom domain routing rules.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>🛡️</Text>
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Family Shield & Biometric Lock</Text>
                  <Text style={styles.featureDescription}>
                    Enforce adult content filtering and Google/Bing SafeSearch with FaceID/TouchID protection.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>⚡</Text>
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Zero Server Costs</Text>
                  <Text style={styles.featureDescription}>
                    Runs 100% on-device inside your phone's sandbox. No middleman subscription fees.
                  </Text>
                </View>
              </View>
            </View>

            {/* Purchase CTA */}
            <TouchableOpacity
              style={[styles.purchaseButton, isProcessing && styles.purchaseButtonDisabled]}
              onPress={handlePurchase}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.purchaseButtonText}>
                  Unlock Lifetime Access • $4.99
                </Text>
              )}
            </TouchableOpacity>

            {/* Restore Purchases & Legal */}
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={handleRestore}
                disabled={isProcessing}
                style={styles.restoreButton}
              >
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              </TouchableOpacity>
              <Text style={styles.footerDivider}>•</Text>
              <TouchableOpacity onPress={onClose} style={styles.restoreButton}>
                <Text style={styles.restoreButtonText}>Continue with Basic</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.legalDisclaimer}>
              Basic Mode provides encrypted DNS privacy against ISP tracking, but disables in-app ad blocking after trial.
            </Text>
          </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  crownCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  crownEmoji: {
    fontSize: 30,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  reasonCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'center',
  },
  priceContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  discountBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  discountBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  originalPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94A3B8',
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  finalPrice: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
  },
  pricePeriod: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  featuresList: {
    marginBottom: 18,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  featureDescription: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  purchaseButton: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    marginBottom: 12,
  },
  purchaseButtonDisabled: {
    opacity: 0.7,
  },
  purchaseButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  restoreButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  restoreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  footerDivider: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  legalDisclaimer: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 14,
  },
});
