import React from 'react';
import {
  View,
  Text,
  Switch,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAdGuardVpn } from '../hooks/useAdGuardVpn';

export const DashboardScreen: React.FC = () => {
  const { isRunning, stats, recentLogs, toggleVpn } = useAdGuardVpn();

  const dataSavedFormatted =
    stats.dataSavedBytes > 1024 * 1024
      ? `${(stats.dataSavedBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(stats.dataSavedBytes / 1024)} KB`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Aegis Guard Protection</Text>
        <Text style={styles.headerSubtitle}>Local VPN DNS Engine</Text>
      </View>

      {/* Main Status Hero Card */}
      <View style={[styles.statusCard, isRunning ? styles.statusCardActive : styles.statusCardPaused]}>
        <View style={styles.statusContent}>
          <View style={[styles.statusDot, { backgroundColor: isRunning ? '#10B981' : '#9CA3AF' }]} />
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
          onValueChange={toggleVpn}
          trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
          thumbColor={isRunning ? '#10B981' : '#F3F4F6'}
          style={styles.switchControl}
        />
      </View>

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

      {/* Live Filtering Log Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Live Activity Feed</Text>
        <Text style={styles.sectionBadge}>{recentLogs.length} events</Text>
      </View>

      {/* Live Stream List */}
      <FlatList
        data={recentLogs}
        keyExtractor={(item, index) => `${item.domain}-${item.timestamp}-${index}`}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {isRunning ? 'Waiting for DNS queries...' : 'Start protection to view live activity'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.logItem}>
            <View
              style={[
                styles.badge,
                { backgroundColor: item.isBlocked ? '#FEE2E2' : '#D1FAE5' },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: item.isBlocked ? '#DC2626' : '#059669' },
                ]}
              >
                {item.isBlocked ? 'BLOCKED' : 'ALLOWED'}
              </Text>
            </View>
            <View style={styles.logInfo}>
              <Text style={styles.logDomain} numberOfLines={1}>
                {item.domain}
              </Text>
              <Text style={styles.logSub} numberOfLines={1}>
                {item.matchedRule ? `Rule: ${item.matchedRule}` : `Upstream: ${item.upstream}`}
              </Text>
            </View>
            <Text style={styles.logDuration}>{item.durationMs.toFixed(0)} ms</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingTop: 12,
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
    paddingRight: 10,
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
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 3,
  },
  switchControl: {
    transform: [{ scaleX: 1.15 }, { scaleY: 1.15 }],
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionBadge: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logInfo: {
    flex: 1,
  },
  logDomain: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  logSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  logDuration: {
    fontSize: 12,
    color: '#9CA3AF',
    fontVariant: ['tabular-nums'],
  },
});
