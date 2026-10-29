import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { AdGuardVpn } from '../native/AdGuardVpnModule';

interface AuditItem {
  id: string;
  category: string;
  domain: string;
  status: 'PENDING' | 'BLOCKED' | 'LEAKED';
  rule?: string;
}

const TEST_VECTORS: { category: string; domain: string }[] = [
  { category: 'Commercial Ads', domain: 'doubleclick.net' },
  { category: 'Google Ad Network', domain: 'googleads.g.doubleclick.net' },
  { category: 'Yahoo Ad Network', domain: 'adserver.yahoo.com' },
  { category: 'Mobile In-App Ads', domain: 'm.yap.yahoo.com' },
  { category: 'Analytics Tracker', domain: 'ups.analytics.yahoo.com' },
  { category: 'Telemetry Collector', domain: 'analytics.query.yahoo.com' },
  { category: 'Cryptominer / Malware', domain: 'coinhive.com' },
];

interface ShieldAuditModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ShieldAuditModal: React.FC<ShieldAuditModalProps> = ({
  visible,
  onClose,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<AuditItem[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const runAudit = async () => {
    try {
      await AdGuardVpn.testDomainFilter(TEST_VECTORS[0].domain);
    } catch (e: any) {
      Alert.alert(
        'Rebuild Required',
        'The Diagnostic Audit requires the newly compiled APK binary. Please rebuild your APK (e.g. via "eas build") to activate this feature.'
      );
      return;
    }

    setIsRunning(true);
    setHasRun(true);
    const list: AuditItem[] = [];

    for (let i = 0; i < TEST_VECTORS.length; i++) {
      const item = TEST_VECTORS[i];
      try {
        const test = await AdGuardVpn.testDomainFilter(item.domain);
        list.push({
          id: `${item.domain}-${i}`,
          category: item.category,
          domain: item.domain,
          status: test.isBlocked ? 'BLOCKED' : 'LEAKED',
          rule: test.matchedRule,
        });
      } catch (e) {
        list.push({
          id: `${item.domain}-${i}`,
          category: item.category,
          domain: item.domain,
          status: 'LEAKED',
        });
      }
    }

    setResults(list);
    setIsRunning(false);
  };

  const blockedCount = results.filter((r) => r.status === 'BLOCKED').length;
  const score = results.length > 0 ? Math.round((blockedCount / results.length) * 100) : 0;
  const grade = score >= 90 ? 'A+' : score >= 70 ? 'B' : 'F';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🛡️ Shield Efficacy Audit</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Simulate live DNS queries against 7 known tracker and ad vectors to verify filter engine integrity.
          </Text>

          {/* Score Hero Banner */}
          {hasRun && !isRunning && (
            <View style={[styles.scoreBanner, score >= 90 ? styles.scoreGreen : styles.scoreRed]}>
              <View>
                <Text style={styles.scoreTitle}>
                  {score >= 90 ? 'Leak-Proof Protection' : 'Protection Alert'}
                </Text>
                <Text style={styles.scoreSub}>
                  {blockedCount} of {results.length} vectors successfully intercepted
                </Text>
              </View>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeText}>{grade}</Text>
              </View>
            </View>
          )}

          {/* Test Action Button */}
          {!isRunning && (
            <TouchableOpacity style={styles.actionButton} onPress={runAudit} activeOpacity={0.8}>
              <Text style={styles.actionButtonText}>
                {hasRun ? 'Re-run Security Audit' : 'Start Diagnostic Audit'}
              </Text>
            </TouchableOpacity>
          )}

          {isRunning && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#10B981" size="large" />
              <Text style={styles.loadingText}>Testing filter rules against threat vectors...</Text>
            </View>
          )}

          {/* Results List */}
          <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
            {results.map((r) => {
              const isBlocked = r.status === 'BLOCKED';
              return (
                <View key={r.id} style={styles.resultItem}>
                  <View style={styles.resultLeft}>
                    <Text style={styles.resultCategory}>{r.category}</Text>
                    <Text style={styles.resultDomain}>{r.domain}</Text>
                    {r.rule ? (
                      <Text style={styles.resultRule} numberOfLines={1}>
                        Rule: {r.rule}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: isBlocked ? '#D1FAE5' : '#FEE2E2' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: isBlocked ? '#065F46' : '#DC2626' },
                      ]}
                    >
                      {isBlocked ? '✓ BLOCKED' : '✕ LEAK'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 10,
  },
  scoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  scoreGreen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  scoreRed: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  scoreSub: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  gradeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultsList: {
    marginTop: 4,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resultLeft: {
    flex: 1,
    marginRight: 10,
  },
  resultCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  resultDomain: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  resultRule: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
