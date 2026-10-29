import React, { useMemo } from 'react';
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

interface DashboardScreenProps {
  isActive?: boolean;
  onNavigateToTab?: (tab: 'queryLog' | 'filters' | 'apps' | 'settings') => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  isActive = true,
  onNavigateToTab,
}) => {
  const { isRunning, stats, toggleVpn } = useAdGuardVpn(isActive);

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

        {/* Quick Hub Navigation Cards */}
        <Text style={styles.sectionHeading}>Protection Management</Text>

        {/* Query Log Card */}
        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.7}
          onPress={() => onNavigateToTab?.('queryLog')}
        >
          <View style={styles.actionCardLeft}>
            <Text style={styles.actionCardIcon}>📋</Text>
            <View style={styles.actionCardTextContainer}>
              <Text style={styles.actionCardTitle}>DNS Query Log</Text>
              <Text style={styles.actionCardSubtitle}>
                Search live domain requests, latency, and 1-tap block/whitelist
              </Text>
            </View>
          </View>
          <Text style={styles.actionCardArrow}>→</Text>
        </TouchableOpacity>

        {/* Filter Subscriptions Card */}
        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.7}
          onPress={() => onNavigateToTab?.('filters')}
        >
          <View style={styles.actionCardLeft}>
            <Text style={styles.actionCardIcon}>⚡</Text>
            <View style={styles.actionCardTextContainer}>
              <Text style={styles.actionCardTitle}>Filter Subscriptions</Text>
              <Text style={styles.actionCardSubtitle}>
                AdGuard Base, Mobile & tracking lists ({stats.ruleCount.toLocaleString()} rules)
              </Text>
            </View>
          </View>
          <Text style={styles.actionCardArrow}>→</Text>
        </TouchableOpacity>

        {/* Settings Card */}
        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.7}
          onPress={() => onNavigateToTab?.('settings')}
        >
          <View style={styles.actionCardLeft}>
            <Text style={styles.actionCardIcon}>⚙️</Text>
            <View style={styles.actionCardTextContainer}>
              <Text style={styles.actionCardTitle}>DNS & Custom Rules</Text>
              <Text style={styles.actionCardSubtitle}>
                Configure upstream resolvers, blocking modes, and custom rules
              </Text>
            </View>
          </View>
          <Text style={styles.actionCardArrow}>→</Text>
        </TouchableOpacity>
      </ScrollView>
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
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  actionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  actionCardIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  actionCardTextContainer: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  actionCardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  actionCardArrow: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
});
