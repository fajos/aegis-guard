import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import { syncCategoriesAndSafari } from '../utils/backup';
import { analyzeEmailOrLink, EmailOrLinkScanResult } from '../utils/phishingAnalyzer';

interface LinkScannerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LinkScannerModal: React.FC<LinkScannerModalProps> = ({ visible, onClose }) => {
  const [inputText, setInputText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [verdict, setVerdict] = useState<EmailOrLinkScanResult | null>(null);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await analyzeEmailOrLink(inputText);
      setVerdict(result);
    } finally {
      setScanning(false);
    }
  };

  const handleBlockThreats = async () => {
    if (!verdict || verdict.threatDomains.length === 0) return;
    setBlocking(true);
    try {
      const existing = (await AdGuardVpn.getUserRules().catch(() => '')) || '';
      const existingLines = new Set(
        existing
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean)
      );

      const newRules: string[] = [];
      for (const dom of verdict.threatDomains) {
        const rule = `||${dom}^`;
        if (!existingLines.has(rule.toLowerCase())) {
          newRules.push(rule);
        }
      }

      if (newRules.length > 0) {
        const merged = [existing.trim(), ...newRules].filter(Boolean).join('\n');
        await AdGuardVpn.saveUserRules(merged);
        await syncCategoriesAndSafari();
      }

      Alert.alert(
        'Threat Domains Blocked',
        `${verdict.threatDomains.length} suspicious domain(s) added to your custom filter list (${verdict.threatDomains.join(', ')}).`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not add threat rules.');
    } finally {
      setBlocking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>🔍 Phishing Email &amp; Link Scanner</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Paste a suspicious URL, SMS text, or an entire email (including From: header &amp; links). Inspected 100% offline on-device.
          </Text>

          <TextInput
            style={styles.input}
            placeholder={'Paste URL or suspicious email/SMS:\nFrom: PayPal <alert@paypa1-verify.xyz>\nYour account is suspended, verify at https://...'}
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning}>
              {scanning ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.scanBtnText}>Analyze Email / Link</Text>
              )}
            </TouchableOpacity>
            {inputText.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setInputText('');
                  setVerdict(null);
                }}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {verdict && (
            <ScrollView style={styles.verdictScroll} showsVerticalScrollIndicator={false}>
              <View
                style={[
                  styles.resultBox,
                  verdict.status === 'DANGEROUS'
                    ? styles.resDanger
                    : verdict.status === 'SUSPICIOUS'
                    ? styles.resWarn
                    : styles.resSafe,
                ]}
              >
                <Text style={styles.resTitle}>{verdict.headline}</Text>
                {verdict.senderEmail && (
                  <Text style={styles.metaText}>
                    Sender: {verdict.senderEmail}
                  </Text>
                )}
                {verdict.extractedDomains.length > 0 && (
                  <Text style={styles.metaText}>
                    Domains checked: {verdict.extractedDomains.slice(0, 5).join(', ')}
                    {verdict.extractedDomains.length > 5 ? ` (+${verdict.extractedDomains.length - 5} more)` : ''}
                  </Text>
                )}

                <View style={{ marginTop: 8 }}>
                  {verdict.reasons.map((r, i) => (
                    <Text key={i} style={styles.resReason}>
                      • {r}
                    </Text>
                  ))}
                </View>

                {verdict.threatDomains.length > 0 && (
                  <TouchableOpacity
                    style={styles.blockThreatBtn}
                    onPress={handleBlockThreats}
                    disabled={blocking}
                  >
                    <Text style={styles.blockThreatBtnText}>
                      {blocking ? 'Blocking...' : `🛡️ Block ${verdict.threatDomains.length} Threat Domain(s) System-Wide`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
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
    padding: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    maxHeight: '86%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
    paddingRight: 8,
  },
  closeX: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  input: {
    minHeight: 92,
    maxHeight: 140,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    marginBottom: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scanBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  clearBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  clearBtnText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '700',
  },
  verdictScroll: {
    marginTop: 14,
  },
  resultBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  resSafe: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  resWarn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  resDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  resTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  resReason: {
    fontSize: 12.5,
    color: '#1F2937',
    lineHeight: 18,
    marginTop: 4,
  },
  blockThreatBtn: {
    marginTop: 12,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  blockThreatBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
