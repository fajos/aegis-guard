import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdGuardVpn, AppManagementInfo } from '../native/AdGuardVpnModule';

// Module-level in-memory cache to prevent repetitive full-system package scans
let cachedApps: AppManagementInfo[] = [];

export const AppManagementScreen: React.FC = () => {
  const [apps, setApps] = useState<AppManagementInfo[]>(cachedApps);
  const [search, setSearch] = useState('');
  const [showSystemApps, setShowSystemApps] = useState(false);
  const [isLoading, setIsLoading] = useState(cachedApps.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchApps = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else if (cachedApps.length === 0) {
      setIsLoading(true);
    }
    try {
      if (!AdGuardVpn) return;
      const data = await AdGuardVpn.getInstalledApps();
      if (data && data.length > 0) {
        cachedApps = data;
        setApps(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (cachedApps.length === 0) {
      fetchApps();
    }
  }, []);

  const handleToggleBypass = async (app: AppManagementInfo) => {
    const newBypass = !app.isVpnBypassed;
    try {
      await AdGuardVpn.setAppBypass(app.packageName, newBypass);
      const updater = (prev: AppManagementInfo[]) =>
        prev.map((item) =>
          item.packageName === app.packageName
            ? { ...item, isVpnBypassed: newBypass, isFiltered: !newBypass }
            : item
        );
      cachedApps = updater(cachedApps);
      setApps(updater);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update app routing');
    }
  };

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      if (!showSystemApps && app.isSystemApp) return false;
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        app.appName.toLowerCase().includes(query) ||
        app.packageName.toLowerCase().includes(query)
      );
    });
  }, [apps, search, showSystemApps]);

  const protectedCount = apps.filter((a) => !a.isVpnBypassed).length;

  const isAllSelected = useMemo(() => {
    if (filteredApps.length === 0) return false;
    return filteredApps.every((a) => !a.isVpnBypassed);
  }, [filteredApps]);

  const handleToggleSelectAll = async () => {
    const shouldProtectAll = !isAllSelected;
    const shouldBypass = !shouldProtectAll;

    try {
      const targetPackages = new Set(filteredApps.map((a) => a.packageName));

      // 1. Instant optimistic UI update
      const updater = (prev: AppManagementInfo[]) =>
        prev.map((item) =>
          targetPackages.has(item.packageName)
            ? { ...item, isVpnBypassed: shouldBypass, isFiltered: shouldProtectAll }
            : item
        );
      cachedApps = updater(cachedApps);
      setApps(updater);

      console.log(
        `[AppManagement] ${shouldProtectAll ? 'Protecting' : 'Bypassing'} ${filteredApps.length} apps`
      );

      // 2. Persist to native layer in background
      for (const app of filteredApps) {
        if (app.isVpnBypassed !== shouldBypass) {
          AdGuardVpn.setAppBypass(app.packageName, shouldBypass);
        }
      }
    } catch (e: any) {
      console.error('[AppManagement] Error updating all apps:', e);
      Alert.alert('Error', e.message || 'Failed to update apps');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>App Management</Text>
            <Text style={styles.subtitle}>
              Configure split-tunneling per application ({protectedCount} protected)
            </Text>
          </View>
          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => fetchApps(true)}
            activeOpacity={0.7}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <Text style={styles.rescanButtonText}>Rescan</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Privacy Scorecard Banner */}
      <View style={styles.scorecardBanner}>
        <View style={styles.scorecardLeft}>
          <Text style={styles.scorecardTitle}>App Privacy Scorecard</Text>
          <Text style={styles.scorecardSubtitle}>
            {apps.length - protectedCount === 0
              ? 'All applications safely routed through local DNS filter'
              : `${apps.length - protectedCount} app(s) currently bypass ad blocking`}
          </Text>
        </View>
        <View style={styles.scorecardPill}>
          <Text style={styles.scorecardRatio}>
            {apps.length > 0 ? Math.round((protectedCount / apps.length) * 100) : 100}%
          </Text>
          <Text style={styles.scorecardRating}>Protected</Text>
        </View>
      </View>

      {/* Search Input */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search apps by name or package..."
        placeholderTextColor="#9CA3AF"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Filter Options & Bulk Actions */}
      <View style={styles.filterRow}>
        <View style={styles.systemAppGroup}>
          <Text style={styles.filterLabel}>System Apps</Text>
          <Switch
            value={showSystemApps}
            onValueChange={setShowSystemApps}
            trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
            thumbColor={showSystemApps ? '#3B82F6' : '#F3F4F6'}
            style={styles.systemAppSwitch}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.bulkActionButton,
            isAllSelected ? styles.bulkActionButtonActive : styles.bulkActionButtonInactive,
          ]}
          onPress={handleToggleSelectAll}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.bulkActionText,
              isAllSelected ? styles.bulkActionTextActive : styles.bulkActionTextInactive,
            ]}
          >
            {isAllSelected ? '✓ Deselect All' : '◻ Select All'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* App List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Scanning installed applications...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredApps}
          keyExtractor={(item) => item.packageName}
          refreshing={isRefreshing}
          onRefresh={() => fetchApps(true)}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>No applications found matching query.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.appCard}>
              <View style={styles.appInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.appName} numberOfLines={1}>
                    {item.appName}
                  </Text>
                  {item.isSystemApp && (
                    <View style={styles.systemBadge}>
                      <Text style={styles.systemBadgeText}>SYSTEM</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.packageName} numberOfLines={1}>
                  {item.packageName}
                </Text>
                <Text
                  style={[
                    styles.statusTag,
                    { color: item.isVpnBypassed ? '#EF4444' : '#10B981' },
                  ]}
                >
                  {item.isVpnBypassed ? 'Traffic Bypasses VPN' : 'Traffic Filtered by AdGuard'}
                </Text>
              </View>

              <Switch
                value={!item.isVpnBypassed}
                onValueChange={() => handleToggleBypass(item)}
                trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
                thumbColor={!item.isVpnBypassed ? '#10B981' : '#F3F4F6'}
              />
            </View>
          )}
        />
      )}
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
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rescanButton: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  rescanButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  scorecardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  scorecardLeft: {
    flex: 1,
    marginRight: 10,
  },
  scorecardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  scorecardSubtitle: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  scorecardPill: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  scorecardRatio: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scorecardRating: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D1FAE5',
    textTransform: 'uppercase',
  },
  searchInput: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#111827',
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  systemAppGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  systemAppSwitch: {
    marginLeft: 8,
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  bulkActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  bulkActionButtonActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  bulkActionButtonInactive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  bulkActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bulkActionTextActive: {
    color: '#DC2626',
  },
  bulkActionTextInactive: {
    color: '#059669',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  appCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 1,
  },
  appInfo: {
    flex: 1,
    marginRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    maxWidth: '80%',
  },
  systemBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  systemBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
  },
  packageName: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  statusTag: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
