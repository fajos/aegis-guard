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

export const FiltersScreen: React.FC = () => {
  const [filters, setFilters] = useState<FilterSubscriptionInfo[]>([]);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const fetchFilters = async () => {
    try {
      if (!AdGuardVpn) return;
      const data = await AdGuardVpn.getFilterSubscriptions();
      setFilters(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  const handleToggle = async (filter: FilterSubscriptionInfo) => {
    const newStatus = !filter.isEnabled;
    try {
      await AdGuardVpn.toggleFilterSubscription(filter.id, newStatus);
      setFilters((prev) =>
        prev.map((f) => (f.id === filter.id ? { ...f, isEnabled: newStatus } : f))
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to toggle filter');
    }
  };

  const handleCheckUpdates = async () => {
    setIsUpdating(true);
    try {
      const updatedCount = await AdGuardVpn.updateFilterSubscriptions();
      Alert.alert(
        'Filters Updated',
        `Successfully downloaded and reloaded ${updatedCount} filter subscription(s).`
      );
      fetchFilters();
    } catch (e: any) {
      Alert.alert('Update Failed', e.message || 'Could not update filters');
    } finally {
      setIsUpdating(false);
    }
  };

  const totalActiveRules = filters
    .filter((f) => f.isEnabled)
    .reduce((sum, f) => sum + f.ruleCount, 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header & Update Button */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Filter Subscriptions</Text>
          <Text style={styles.subtitle}>
            {totalActiveRules.toLocaleString()} active blocking rules
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
                {item.ruleCount.toLocaleString()} rules
              </Text>
              <Text style={styles.lastUpdated}>
                Updated: {new Date(item.lastUpdated).toLocaleDateString()}
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
