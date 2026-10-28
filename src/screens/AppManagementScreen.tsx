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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdGuardVpn, AppManagementInfo } from '../native/AdGuardVpnModule';

export const AppManagementScreen: React.FC = () => {
  const [apps, setApps] = useState<AppManagementInfo[]>([]);
  const [search, setSearch] = useState('');
  const [showSystemApps, setShowSystemApps] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApps = async () => {
    setIsLoading(true);
    try {
      if (!AdGuardVpn) return;
      const data = await AdGuardVpn.getInstalledApps();
      setApps(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleToggleBypass = async (app: AppManagementInfo) => {
    const newBypass = !app.isVpnBypassed;
    try {
      await AdGuardVpn.setAppBypass(app.packageName, newBypass);
      setApps((prev) =>
        prev.map((item) =>
          item.packageName === app.packageName
            ? { ...item, isVpnBypassed: newBypass, isFiltered: !newBypass }
            : item
        )
      );
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <Text style={styles.title}>App Management</Text>
        <Text style={styles.subtitle}>
          Configure split-tunneling per application ({protectedCount} protected)
        </Text>
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

      {/* Filter Options */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Show System Applications</Text>
        <Switch
          value={showSystemApps}
          onValueChange={setShowSystemApps}
          trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
          thumbColor={showSystemApps ? '#3B82F6' : '#F3F4F6'}
        />
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
