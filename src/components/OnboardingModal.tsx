import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import { CATEGORY_STORAGE_KEYS } from '../utils/backup';

interface OnboardingModalProps {
  visible: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ visible, onClose }) => {
  const [step, setStep] = useState<number>(0);
  const [dnsActive, setDnsActive] = useState<boolean>(false);
  const [safariActive, setSafariActive] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);

  const checkNativeStatus = useCallback(async () => {
    setChecking(true);
    try {
      const dnsOk =
        typeof AdGuardVpn.isDnsProfileInstalled === 'function'
          ? await AdGuardVpn.isDnsProfileInstalled()
          : await AdGuardVpn.isRunning();
      setDnsActive(dnsOk);

      if (Platform.OS === 'ios' && typeof AdGuardVpn.getSafariBlockerStatus === 'function') {
        const safariOk = await AdGuardVpn.getSafariBlockerStatus();
        setSafariActive(safariOk);
      }
    } catch {
      // Safe fallback
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      checkNativeStatus();
    }
  }, [visible, checkNativeStatus]);

  const handleFinish = async () => {
    await AsyncStorage.setItem(CATEGORY_STORAGE_KEYS.ONBOARDING_DONE, 'true').catch(() => {});
    onClose();
  };

  const handleOpenSettings = async () => {
    if (Platform.OS === 'ios') {
      await AdGuardVpn.startVpn().catch(() => {});
    }
    Linking.openSettings().catch(() => {});
  };

  const isIos = Platform.OS === 'ios';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleFinish}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.stepPill}>
              Step {step + 1} of {isIos ? 3 : 2}
            </Text>
            <TouchableOpacity onPress={handleFinish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {step === 0 && (
              <>
                <Text style={styles.heroEmoji}>🛡️</Text>
                <Text style={styles.title}>
                  {isIos ? 'Activate System-Wide Encrypted DNS' : 'Enable Local VPN Protection'}
                </Text>
                <Text style={styles.desc}>
                  {isIos
                    ? 'AegisGuard registers an encrypted DNS-over-HTTPS (DoH) profile natively on your iPhone so ads and trackers are filtered across all apps without battery drain.'
                    : 'AegisGuard creates an on-device loopback VPN tunnel (10.0.0.2) to filter ad and tracker domains locally without routing your traffic through remote servers.'}
                </Text>

                {isIos ? (
                  <View style={styles.stepsBox}>
                    <Text style={styles.stepLine}>1. Tap "Open iOS Settings" below.</Text>
                    <Text style={styles.stepLine}>
                      2. Go to General &gt; VPN &amp; Device Management &gt; DNS.
                    </Text>
                    <Text style={styles.stepLine}>3. Select "Aegis Guard DNS (Default)".</Text>
                  </View>
                ) : (
                  <View style={styles.stepsBox}>
                    <Text style={styles.stepLine}>1. Tap "Activate Local VPN" below.</Text>
                    <Text style={styles.stepLine}>2. Approve Android's local VPN connection dialog.</Text>
                  </View>
                )}

                <View style={[styles.statusBadge, dnsActive ? styles.statusOk : styles.statusPending]}>
                  <Text style={[styles.statusText, dnsActive ? styles.statusTextOk : styles.statusTextPending]}>
                    {dnsActive ? '✓ DNS Protection Active' : '⏳ Waiting for activation'}
                  </Text>
                  <TouchableOpacity onPress={checkNativeStatus} disabled={checking}>
                    {checking ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <Text style={styles.recheckText}>Check Again</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={isIos ? handleOpenSettings : () => AdGuardVpn.startVpn().then(checkNativeStatus)}
                >
                  <Text style={styles.secondaryBtnText}>
                    {isIos ? 'Open iOS Settings' : 'Activate Local VPN'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {isIos && step === 1 && (
              <>
                <Text style={styles.heroEmoji}>🧭</Text>
                <Text style={styles.title}>Enable Safari Web Ad Blocker</Text>
                <Text style={styles.desc}>
                  Turn on AegisGuard's Safari Content Blocker to hide sponsored Yahoo Mail promos, YouTube mobile web ads, and cookie banners inside Safari.
                </Text>

                <View style={styles.stepsBox}>
                  <Text style={styles.stepLine}>1. Open iOS Settings &gt; Apps &gt; Safari (or Safari).</Text>
                  <Text style={styles.stepLine}>2. Tap Extensions &gt; AegisSafariBlocker.</Text>
                  <Text style={styles.stepLine}>3. Toggle "Allow Extension" ON.</Text>
                </View>

                <View style={[styles.statusBadge, safariActive ? styles.statusOk : styles.statusPending]}>
                  <Text style={[styles.statusText, safariActive ? styles.statusTextOk : styles.statusTextPending]}>
                    {safariActive ? '✓ Safari Extension Enabled' : '⏳ Extension Not Enabled Yet'}
                  </Text>
                  <TouchableOpacity onPress={checkNativeStatus} disabled={checking}>
                    {checking ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <Text style={styles.recheckText}>Check Again</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openSettings().catch(() => {})}>
                  <Text style={styles.secondaryBtnText}>Open iOS Settings</Text>
                </TouchableOpacity>
              </>
            )}

            {((isIos && step === 2) || (!isIos && step === 1)) && (
              <>
                <Text style={styles.heroEmoji}>🚀</Text>
                <Text style={styles.title}>You're Protected!</Text>
                <Text style={styles.desc}>
                  • Zero remote logs — all inspection and settings remain on your device.{'\n'}
                  • Switch between Aegis Secure DNS, Cloudflare, NextDNS, Control D, or custom sdns:// stamps anytime in Settings &gt; DNS.{'\n'}
                  • Use Quick Game Mode to snooze protection temporarily when you want rewarded game ads.
                </Text>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                const maxStep = isIos ? 2 : 1;
                if (step < maxStep) {
                  setStep((s) => s + 1);
                } else {
                  handleFinish();
                }
              }}
            >
              <Text style={styles.primaryBtnText}>
                {(isIos && step === 2) || (!isIos && step === 1) ? 'Launch Shield' : 'Continue →'}
              </Text>
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
    backgroundColor: 'rgba(3, 11, 32, 0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepPill: {
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  body: {
    paddingBottom: 12,
  },
  heroEmoji: {
    fontSize: 44,
    textAlign: 'center',
    marginVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 13.5,
    color: '#4B5563',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  stepsBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  stepLine: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '600',
    lineHeight: 19,
  },
  statusBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  statusOk: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  statusTextOk: {
    color: '#065F46',
  },
  statusTextPending: {
    color: '#92400E',
  },
  recheckText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  secondaryBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
