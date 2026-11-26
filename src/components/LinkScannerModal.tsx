import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AdGuardVpn } from '../native/AdGuardVpnModule';

interface LinkScannerModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ScanVerdict {
  domain: string;
  status: 'SAFE' | 'SUSPICIOUS' | 'DANGEROUS';
  headline: string;
  reasons: string[];
}

const RISKY_TLDS = ['.xyz', '.top', '.click', '.tk', '.ml', '.ga', '.cf', '.gq', '.loan', '.zip', '.mov'];
const PHISHING_KEYWORDS = ['verify-account', 'login-update', 'secure-billing', 'wallet-connect', 'free-nitro', 'claim-prize', 'appleid-support', 'paypal-confirm'];

function extractDomain(rawInput: string): string {
  let clean = rawInput.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//, '');
  clean = clean.split('/')[0].split('?')[0].split('#')[0];
  clean = clean.split(':')[0];
  return clean;
}

export const LinkScannerModal: React.FC<LinkScannerModalProps> = ({ visible, onClose }) => {
  const [inputUrl, setInputUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [verdict, setVerdict] = useState<ScanVerdict | null>(null);

  const handleScan = async () => {
    const domain = extractDomain(inputUrl);
    if (!domain || !domain.includes('.')) {
      setVerdict({
        domain: inputUrl || '(empty)',
        status: 'SUSPICIOUS',
        headline: 'Enter a Valid Domain or URL',
        reasons: ['Please paste a link or hostname such as https://example.com.'],
      });
      return;
    }

    setScanning(true);
    try {
      const reasons: string[] = [];
      let status: 'SAFE' | 'SUSPICIOUS' | 'DANGEROUS' = 'SAFE';

      // 1. Check native/engine blocklists
      const filterRes = await AdGuardVpn.testDomainFilter(domain);
      if (filterRes?.isBlocked) {
        status = 'DANGEROUS';
        reasons.push(`Blocked by AegisGuard filter rule: ${filterRes.matchedRule || domain}`);
      }

      // 2. Check Punycode IDN homograph attack
      if (domain.includes('xn--')) {
        status = 'DANGEROUS';
        reasons.push('Uses Punycode (xn--) internationalized characters often abused for homograph lookalike phishing.');
      }

      // 3. Check high-risk phishing keywords
      if (PHISHING_KEYWORDS.some((kw) => domain.includes(kw))) {
        status = 'DANGEROUS';
        reasons.push('Contains deceptive credential-harvesting / brand impersonation pattern.');
      }

      // 4. Check abusive / risky TLDs
      if (RISKY_TLDS.some((tld) => domain.endsWith(tld)) && status === 'SAFE') {
        status = 'SUSPICIOUS';
        reasons.push('Hosted on a top-level domain heavily correlated with spam and SMS phishing.');
      }

      // 5. Deep subdomain impersonation check
      if (domain.split('.').length >= 4 && (domain.includes('paypal') || domain.includes('apple') || domain.includes('bank') || domain.includes('amazon'))) {
        status = 'DANGEROUS';
        reasons.push('Uses multi-level subdomain spoofing to mimic a trusted brand.');
      }

      if (reasons.length === 0) {
        reasons.push('No adware, malware, homograph, or known phishing signatures detected on this hostname.');
      }

      setVerdict({
        domain,
        status,
        headline:
          status === 'DANGEROUS'
            ? '🚨 Threat / Tracker Detected'
            : status === 'SUSPICIOUS'
            ? '⚠️ Caution Advised'
            : '✅ Link Appears Clean',
        reasons,
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>🔍 Phishing &amp; Link Scanner</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Paste any suspicious SMS, WhatsApp, or email URL to inspect it safely before opening.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Paste URL (e.g. https://appleid-support.xyz/verify)"
            placeholderTextColor="#9CA3AF"
            value={inputUrl}
            onChangeText={setInputUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning}>
            {scanning ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.scanBtnText}>Analyze Link Safety</Text>
            )}
          </TouchableOpacity>

          {verdict && (
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
              <Text style={styles.resDomain}>{verdict.domain}</Text>
              {verdict.reasons.map((r, i) => (
                <Text key={i} style={styles.resReason}>
                  • {r}
                </Text>
              ))}
            </View>
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
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
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
    marginBottom: 14,
    lineHeight: 18,
  },
  input: {
    height: 44,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
    marginBottom: 12,
  },
  scanBtn: {
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
  resultBox: {
    marginTop: 14,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  resDomain: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginTop: 2,
    marginBottom: 8,
  },
  resReason: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
});
