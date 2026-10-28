import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdGuardVpn, FilterSubscriptionInfo } from '../native/AdGuardVpnModule';

// In-memory cache for instant filter subscriptions rendering across tab switches
let cachedFilters: FilterSubscriptionInfo[] = [];

export const FiltersScreen: React.FC = () => {
  const [filters, setFilters] = useState<FilterSubscriptionInfo[]>(cachedFilters);
  const [engineRuleCount, setEngineRuleCount] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const fetchFilters = async () => {
    try {
      console.log('[FiltersScreen] Fetching filter subscriptions from native module...');
      if (!AdGuardVpn) {
        console.warn('[FiltersScreen] AdGuardVpn native module is null / not linked');
        return;
      }

      const data = await AdGuardVpn.getFilterSubscriptions();
      console.log('[FiltersScreen] Received subscriptions:', JSON.stringify(data, null, 2));

      if (data && data.length > 0) {
        // Smart merge: Preserve known downloaded rule counts if bridge reports 0 on reload
        const merged = data.map((sub) => {
          const existing = cachedFilters.find((c) => c.id === sub.id);
          const preservedCount = sub.ruleCount > 0 ? sub.ruleCount : (existing?.ruleCount || 0);
          const preservedUpdated = sub.lastUpdated > 0 ? sub.lastUpdated : (existing?.lastUpdated || 0);
          return {
            ...sub,
            ruleCount: preservedCount,
            lastUpdated: preservedUpdated,
          };
        });
        cachedFilters = merged;
        setFilters(merged);
      } else {
        console.warn('[FiltersScreen] Bridge returned empty subscriptions array');
      }

      const stats = await AdGuardVpn.getStatistics();
      console.log('[FiltersScreen] Engine statistics:', stats);
      if (stats && stats.ruleCount) {
        setEngineRuleCount(stats.ruleCount);
      }
    } catch (e) {
      console.error('[FiltersScreen] Error in fetchFilters:', e);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  const handleToggle = async (filter: FilterSubscriptionInfo) => {
    const newStatus = !filter.isEnabled;
    console.log(`[FiltersScreen] Toggling subscription ${filter.id} (${filter.name}) -> ${newStatus}`);
    try {
      await AdGuardVpn.toggleFilterSubscription(filter.id, newStatus);
      const updater = (prev: FilterSubscriptionInfo[]) =>
        prev.map((f) => (f.id === filter.id ? { ...f, isEnabled: newStatus } : f));
      cachedFilters = updater(cachedFilters);
      setFilters(updater);
      console.log(`[FiltersScreen] Successfully toggled filter ${filter.id}`);
      fetchFilters();
    } catch (e: any) {
      console.error(`[FiltersScreen] Failed to toggle filter ${filter.id}:`, e);
      Alert.alert('Error', e.message || 'Failed to toggle filter');
    }
  };

  const handleCheckUpdates = async () => {
    console.log('[FiltersScreen] Starting filter subscriptions update...');
    setIsUpdating(true);
    try {
      const updatedCount = await AdGuardVpn.updateFilterSubscriptions();
      console.log(`[FiltersScreen] Downloaded and reloaded ${updatedCount} subscription(s)`);
      Alert.alert(
        'Filters Updated',
        `Successfully downloaded and reloaded ${updatedCount} filter subscription(s).`
      );
      await fetchFilters();
    } catch (e: any) {
      console.error('[FiltersScreen] Failed to update filters:', e);
      Alert.alert('Update Failed', e.message || 'Could not update filters');
    } finally {
      setIsUpdating(false);
    }
  };

  const calculatedRules = filters
    .filter((f) => f.isEnabled)
    .reduce((sum, f) => sum + f.ruleCount, 0);

  const totalActiveRules = Math.max(calculatedRules, engineRuleCount);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header & Update Button */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.title}>Filter Subscriptions</Text>
          <Text style={styles.subtitle}>
            {totalActiveRules > 0 ? `${totalActiveRules.toLocaleString()} active rules` : '0 active rules'}
            {engineRuleCount > 0 && calculatedRules > engineRuleCount
              ? ` (${engineRuleCount.toLocaleString()} unique in engine)`
              : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.updateButton, isUpdating && styles.updateButtonDisabled]}
          onPress={handleCheckUpdates}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.updateButtonText}>Check Updates</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Subscriptions List */}
      <FlatList
        data={filters}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.filterCard}>
            <View style={styles.cardHeader}>
              <View style={styles.titleArea}>
                <Text style={styles.filterName}>{item.name}</Text>
                {item.isCustom && (
                  <View style={styles.customTag}>
                    <Text style={styles.customTagText}>Custom</Text>
                  </View>
                )}
              </View>
              <Switch
                value={item.isEnabled}
                onValueChange={() => handleToggle(item)}
                trackColor={{ false: '#D1D5DB', true: '#6EE7B7' }}
                thumbColor={item.isEnabled ? '#10B981' : '#F3F4F6'}
              />
            </View>

            <Text style={styles.description}>{item.description}</Text>

            <View style={styles.footerRow}>
              <Text style={styles.ruleCount}>
                {item.ruleCount > 0
                  ? `${item.ruleCount.toLocaleString()} rules`
                  : item.isEnabled
                  ? 'Ready to sync'
                  : 'Disabled'}
              </Text>
              <Text style={styles.lastUpdated}>
                {item.lastUpdated > 0
                  ? `Updated: ${new Date(item.lastUpdated).toLocaleDateString()}`
                  : 'Tap Check Updates to sync'}
              </Text>
            </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  updateButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  updateButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  filterName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  customTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  customTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  description: {
    fontSize: 13,
    color: '#4B5563',
    marginVertical: 8,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#F3F4F6',
  },
  ruleCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  lastUpdated: {
    fontSize: 11,
    color: '#9CA3AF',
  },
});
