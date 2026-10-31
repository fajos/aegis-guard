import React, { useState, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAdGuardVpn } from '../hooks/useAdGuardVpn';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import { ShieldAuditModal } from '../components/ShieldAuditModal';
import { authenticateWithBiometrics } from '../utils/security';

interface DashboardScreenProps {
  isActive?: boolean;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  isActive = true,
}) => {
  const { isRunning, stats, snoozeSeconds, toggleVpn, snoozeVpn, cancelSnooze } = useAdGuardVpn(isActive);
  const [auditModalVisible, setAuditModalVisible] = useState(false);

  const formatSnoozeTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleToggleVpn = async () => {
    if (isRunning) {
      // User is attempting to pause protection
      try {
        const isLocked = await AdGuardVpn.isParentalLockEnabled();
        if (isLocked) {
          const ok = await authenticateWithBiometrics('Verify identity with Biometrics to pause protection');
          if (!ok) return;
        }
      } catch (e) {}
    }
    toggleVpn();
  };

  const dataSavedFormatted = useMemo(() => {
    return stats.dataSavedBytes > 1024 * 1024
      ? `${(stats.dataSavedBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(stats.dataSavedBytes / 1024)} KB`;
  }, [stats.dataSavedBytes]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Aegis Guard Protection</Text>
          <Text style={styles.headerSubtitle}>Local VPN DNS Engine</Text>
        </View>

        {/* Main Status Hero Card */}
        <View
          style={[
            styles.statusCard,
            isRunning ? styles.statusCardActive : styles.statusCardPaused,
          ]}
        >
          <View style={styles.statusContent}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isRunning ? '#10B981' : '#9CA3AF' },
              ]}
            />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>
                {isRunning ? 'Protection is Enabled' : 'Protection is Paused'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isRunning
                  ? `Local VPN active • ${stats.ruleCount.toLocaleString()} rules loaded`
                  : 'Tap switch to protect against ads and trackers'}
              </Text>
            </View>
          </View>
          <Switch
            value={isRunning}
            onValueChange={handleToggleVpn}
            trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
            thumbColor={isRunning ? '#10B981' : '#F3F4F6'}
            style={styles.switchControl}
          />
        </View>

        {/* Game Mode / Quick Snooze Bar */}
        {snoozeSeconds > 0 ? (
          <View style={styles.gameModeActiveCard}>
            <View style={styles.gameModeActiveHeader}>
              <Text style={styles.gameModeActiveIcon}>🎮</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.gameModeActiveTitle}>Game Mode Active</Text>
                <Text style={styles.gameModeActiveSubtitle}>
                  Protection snoozed • Rewarded ads & gaming servers accessible
                </Text>
              </View>
              <Text style={styles.gameModeCountdown}>{formatSnoozeTime(snoozeSeconds)}</Text>
            </View>
            <TouchableOpacity
              style={styles.gameModeResumeButton}
              onPress={cancelSnooze}
              activeOpacity={0.8}
            >
              <Text style={styles.gameModeResumeText}>🛡️ Resume Protection Now</Text>
            </TouchableOpacity>
          </View>
        ) : isRunning ? (
          <View style={styles.gameModeCard}>
            <View style={styles.gameModeHeader}>
              <Text style={styles.gameModeIcon}>🎮</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.gameModeTitle}>Quick Game Mode</Text>
                <Text style={styles.gameModeSubtitle}>
                  Need rewarded ads in a game? Auto-resuming snooze:
                </Text>
              </View>
            </View>
            <View style={styles.gameModeChips}>
              <TouchableOpacity
                style={styles.gameModeChip}
                onPress={() => snoozeVpn(60)}
                activeOpacity={0.7}
              >
                <Text style={styles.gameModeChipText}>⚡ 1 Min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.gameModeChip}
                onPress={() => snoozeVpn(120)}
                activeOpacity={0.7}
              >
                <Text style={styles.gameModeChipText}>⚡ 2 Mins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.gameModeChip}
                onPress={() => snoozeVpn(300)}
                activeOpacity={0.7}
              >
                <Text style={styles.gameModeChipText}>⚡ 5 Mins</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* 4-Card Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              {stats.blockedQueries.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Blocked Requests</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>
              {stats.totalQueries.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Total DNS Queries</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>
              {dataSavedFormatted}
            </Text>
            <Text style={styles.statLabel}>Data Saved</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#8B5CF6' }]}>
              {stats.blockRate.toFixed(1)}%
            </Text>
            <Text style={styles.statLabel}>Block Ratio</Text>
          </View>
        </View>

        {/* Diagnostic Security & Leak Audit Button */}
        <TouchableOpacity
          style={styles.auditCard}
          activeOpacity={0.8}
          onPress={() => setAuditModalVisible(true)}
        >
          <View style={styles.auditCardLeft}>
            <Text style={styles.auditCardIcon}>🛡️</Text>
            <View style={styles.auditCardTextContainer}>
              <Text style={styles.auditCardTitle}>Run Security & Leak Audit</Text>
              <Text style={styles.auditCardSubtitle}>
                Test 7 threat vectors to verify filter engine integrity
              </Text>
            </View>
          </View>
          <Text style={styles.auditCardArrow}>→</Text>
        </TouchableOpacity>

        {/* Protection Details Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Protection Overview</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Engine Status</Text>
            <View style={styles.infoBadge}>
              <View
                style={[
                  styles.infoBadgeDot,
                  { backgroundColor: isRunning ? '#10B981' : '#9CA3AF' },
                ]}
              />
              <Text
                style={[
                  styles.infoBadgeText,
                  { color: isRunning ? '#059669' : '#6B7280' },
                ]}
              >
                {isRunning ? 'Filtering Active' : 'Protection Paused'}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Active Filter Rules</Text>
            <Text style={styles.infoValue}>
              {stats.ruleCount.toLocaleString()} rules
            </Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Interception Mode</Text>
            <Text style={styles.infoValue}>Local VPN DNS (Port 53)</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Data Privacy</Text>
            <Text style={styles.infoValue}>Zero Remote Logs</Text>
          </View>
        </View>

        {/* Privacy Note Card */}
        <View style={styles.tipCard}>
          <Text style={styles.tipText}>
            💡 <Text style={styles.tipBold}>Privacy Note:</Text> All DNS filtering happens entirely on your device inside the local VPN sandbox. Your personal web browsing is never transmitted to an external logging server.
          </Text>
        </View>
      </ScrollView>

      {/* Security & Leak Audit Diagnostic Modal */}
      <ShieldAuditModal
        visible={auditModalVisible}
        onClose={() => setAuditModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 16,
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
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  statusCardActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusCardPaused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  switchControl: {
    transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }],
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginTop: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  infoBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  infoBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  tipCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  tipText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  tipBold: {
    fontWeight: '700',
  },
  auditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  auditCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  auditCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  auditCardTextContainer: {
    flex: 1,
  },
  auditCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  auditCardSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  auditCardArrow: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  gameModeActiveCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  gameModeActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  gameModeActiveIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  gameModeActiveTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  gameModeActiveSubtitle: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 1,
  },
  gameModeCountdown: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B45309',
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
  gameModeResumeButton: {
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameModeResumeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  gameModeCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  gameModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  gameModeIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  gameModeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  gameModeSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  gameModeChips: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  gameModeChip: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  gameModeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
});
