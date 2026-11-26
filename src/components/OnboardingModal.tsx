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

  const handleActivateProtection = async () => {
    try {
      await AdGuardVpn.startVpn();
      if (Platform.OS === 'ios' && typeof AdGuardVpn.requestNotificationPermission === 'function') {
        await AdGuardVpn.requestNotificationPermission().catch(() => {});
      }
    } catch {
      // Prompt dismissed or denied; fallback link still opens Settings if needed
    }
    await checkNativeStatus();
  };

  const isIos = Platform.OS === 'ios';

  const maxStep = isIos ? 3 : 2;
  const isFinalStep = step === maxStep;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleFinish}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.stepPill}>
              Step {step + 1} of {maxStep + 1}
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
                  {isIos ? 'Activate Local VPN DNS Shield' : 'Enable Local VPN Protection'}
                </Text>
                <Text style={styles.desc}>
                  {isIos
                    ? 'AegisGuard creates a local on-device VPN DNS tunnel (NEPacketTunnelProvider) to block ads, trackers, category apps, and enforce SafeSearch across all apps without battery drain.'
                    : 'AegisGuard creates an on-device loopback VPN tunnel (10.0.0.2) to filter ad and tracker domains locally without routing your traffic through remote servers.'}
                </Text>

                {isIos ? (
                  <View style={styles.stepsBox}>
                    <Text style={styles.stepLine}>1. Tap "Activate Local VPN Shield" below.</Text>
                    <Text style={styles.stepLine}>
                      2. Tap "Allow" when iOS prompts to add AegisGuard VPN configurations.
                    </Text>
                    <Text style={styles.stepLine}>3. Enjoy system-wide protection across apps &amp; browsers.</Text>
                  </View>
                ) : (
                  <View style={styles.stepsBox}>
                    <Text style={styles.stepLine}>1. Tap "Activate Local VPN" below.</Text>
                    <Text style={styles.stepLine}>2. Approve Android's local VPN connection dialog.</Text>
                  </View>
                )}

                <View style={[styles.statusBadge, dnsActive ? styles.statusOk : styles.statusPending]}>
                  <Text style={[styles.statusText, dnsActive ? styles.statusTextOk : styles.statusTextPending]}>
                    {dnsActive ? '✓ Local VPN Protection Active' : '⏳ Waiting for activation'}
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
                  onPress={handleActivateProtection}
                >
                  <Text style={styles.secondaryBtnText}>
                    {isIos ? 'Activate Local VPN Shield' : 'Activate Local VPN'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {isIos && step === 1 && (
              <>
                <Text style={styles.heroEmoji}>🧭</Text>
                <Text style={styles.title}>Safari, SMS Filter &amp; Widget</Text>
                <Text style={styles.desc}>
                  Enable Safari Web Ad Blocking (blocks sponsored Yahoo Mail promos &amp; YouTube web ads), offline SMS phishing screening, and add the Home Screen Widget.
                </Text>

                <View style={styles.stepsBox}>
                  <Text style={styles.stepLine}>1. Safari Ad Blocker: Settings &gt; Apps &gt; Safari &gt; Extensions &gt; AegisSafariBlocker.</Text>
                  <Text style={styles.stepLine}>2. SMS Scam Filter (Optional): Settings &gt; Apps &gt; Messages &gt; Unknown &amp; Spam &gt; AegisSmsFilter.</Text>
                  <Text style={styles.stepLine}>3. Widget &amp; Siri: Add the Aegis Guard Widget to your Home Screen or say "Enable AegisGuard".</Text>
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
                <Text style={styles.heroEmoji}>🚨</Text>
                <Text style={styles.title}>Phishing &amp; Category Protection</Text>
                <Text style={styles.desc}>
                  Powerful family controls and scam defense that run 100% locally on your device — zero remote inspection.
                </Text>
                <View style={styles.stepsBox}>
                  <Text style={styles.stepLine}>• Email &amp; Link Scanner: Paste suspicious emails, SMS, or URLs to detect brand spoofs &amp; homographs before tapping.</Text>
                  <Text style={styles.stepLine}>• Real-Time Threat Alerts: Instant local alerts whenever the shield blocks a phishing or cryptojacking domain.</Text>
                  <Text style={styles.stepLine}>• Category &amp; Bedtime Schedule: Block Social, Gambling, Gaming, Dating, or Crypto automatically on your schedule.</Text>
                </View>
              </>
            )}

            {isFinalStep && (
              <>
                <Text style={styles.heroEmoji}>🚀</Text>
                <Text style={styles.title}>You're Protected!</Text>
                <Text style={styles.desc}>
                  • Zero remote logs — DNS logs, Privacy Insights trends, and rule backups stay strictly on your device.{'\n'}
                  • Custom Private DNS: Configure Aegis Secure DNS, NextDNS, Control D, Cloudflare, or sdns:// stamps in Settings &gt; DNS.{'\n'}
                  • Tap any logged query to block or allow it immediately, or use Quick Game Mode for temporary rewarded ads.
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
                if (!isFinalStep) {
                  setStep((s) => s + 1);
                } else {
                  handleFinish();
                }
              }}
            >
              <Text style={styles.primaryBtnText}>
                {isFinalStep ? 'Launch Shield' : 'Continue →'}
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
