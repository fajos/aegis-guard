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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AdGuardVpn,
  AppManagementInfo,
  POPULAR_GAMES_CATALOG,
  GAMING_REWARDED_AD_DOMAINS,
  GOOGLE_ADMOB_DOMAINS,
  PopularGameCatalogItem,
} from '../native/AdGuardVpnModule';

// Module-level in-memory cache to prevent repetitive full-system package scans
let cachedApps: AppManagementInfo[] = [];

export const AppManagementScreen: React.FC = () => {
  const [apps, setApps] = useState<AppManagementInfo[]>(cachedApps);
  const [search, setSearch] = useState('');
  const [showSystemApps, setShowSystemApps] = useState(false);
  const [isLoading, setIsLoading] = useState(cachedApps.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGameAdsBypass, setIsGameAdsBypass] = useState(false);

  // Add custom app modal states
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isCatalogModalVisible, setIsCatalogModalVisible] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [newPackageName, setNewPackageName] = useState('');
  const [newCustomDomains, setNewCustomDomains] = useState('');
  const [newIsBypassed, setNewIsBypassed] = useState(true);

  const fetchApps = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else if (cachedApps.length === 0) {
      setIsLoading(true);
    }
    try {
      if (!AdGuardVpn) return;
      const [data, bypass] = await Promise.all([
        AdGuardVpn.getInstalledApps(),
        AdGuardVpn.isGameAdsBypassEnabled(),
      ]);
      if (data && data.length > 0) {
        cachedApps = data;
        setApps(data);
      }
      setIsGameAdsBypass(bypass);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleToggleGameAdsBypass = async (val: boolean) => {
    try {
      setIsGameAdsBypass(val);
      await AdGuardVpn.setGameAdsBypassEnabled(val);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update game ads setting');
    }
  };

  const handleAddFromCatalog = async (item: PopularGameCatalogItem) => {
    const newApp: AppManagementInfo = {
      appName: item.appName,
      packageName: item.packageName,
      isSystemApp: false,
      isFiltered: false,
      isVpnBypassed: true,
    };
    try {
      await AdGuardVpn.addCustomApp(newApp, item.domains);
      cachedApps = [newApp, ...cachedApps.filter((a) => a.packageName !== item.packageName)];
      setApps(cachedApps);
      Alert.alert('Game Excluded', `"${item.appName}" has been added and rewarded video ads are enabled!`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add game.');
    }
  };

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch) return POPULAR_GAMES_CATALOG;
    const q = catalogSearch.toLowerCase();
    return POPULAR_GAMES_CATALOG.filter(
      (g) => g.appName.toLowerCase().includes(q) || g.category.toLowerCase().includes(q)
    );
  }, [catalogSearch]);

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

  const handleAddCustomApp = async () => {
    const name = newAppName.trim();
    if (!name) {
      Alert.alert('Required', 'Please enter a name for the game or app.');
      return;
    }

    const pkg = newPackageName.trim() || `custom.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const domains = newCustomDomains
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);

    const newApp: AppManagementInfo = {
      appName: name,
      packageName: pkg,
      isSystemApp: false,
      isFiltered: !newIsBypassed,
      isVpnBypassed: newIsBypassed,
    };

    try {
      if (AdGuardVpn.addCustomApp) {
        await AdGuardVpn.addCustomApp(newApp, domains);
      } else {
        await AdGuardVpn.setAppBypass(pkg, newIsBypassed);
      }
      cachedApps = [newApp, ...cachedApps.filter((a) => a.packageName !== pkg)];
      setApps(cachedApps);
      setIsAddModalVisible(false);
      setNewAppName('');
      setNewPackageName('');
      setNewCustomDomains('');
      setNewIsBypassed(true);
      Alert.alert('App Added', `"${name}" has been added to your app list.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add custom app.');
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
            <Text style={styles.title}>Game & App Exclusions</Text>
            <Text style={styles.subtitle}>
              Configure split-tunneling & exclusions ({protectedCount} protected)
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.catalogButton}
              onPress={() => setIsCatalogModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.catalogButtonText}>🎮 Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setIsAddModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
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
      </View>

      {/* Universal Rewarded Ad Bypass Card */}
      <View style={styles.universalCard}>
        <View style={styles.universalLeft}>
          <Text style={styles.universalIcon}>🎮</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.universalTitle}>Allow Rewarded Ads in All Games</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>1-TAP FIX</Text>
              </View>
            </View>
            <Text style={styles.universalSubtitle}>
              Automatically allows Unity Ads, Supersonic, AppLovin, and Vungle across all games so free rewards work.
            </Text>
          </View>
        </View>
        <Switch
          value={isGameAdsBypass}
          onValueChange={handleToggleGameAdsBypass}
          trackColor={{ false: '#D1D5DB', true: '#FDE68A' }}
          thumbColor={isGameAdsBypass ? '#F59E0B' : '#F3F4F6'}
        />
      </View>

      {/* Guide Banner */}
      <View style={styles.guideBanner}>
        <Text style={styles.guideIcon}>🎮</Text>
        <View style={styles.guideTextContainer}>
          <Text style={styles.guideTitle}>Game & Rewarded Ad Exclusions Active</Text>
          <Text style={styles.guideSubtitle}>
            Excluded games (switch OFF) have their online servers and rewarded ads bypass DNS blocking.
            Protected apps (switch ON) have all video & popup ads eliminated.
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search games & apps by name or package..."
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
          <Text style={styles.loadingText}>Loading applications & game rules...</Text>
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
                  {item.isVpnBypassed && (
                    <View style={styles.excludedBadge}>
                      <Text style={styles.excludedBadgeText}>EXCLUDED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.packageName} numberOfLines={1}>
                  {item.packageName}
                </Text>
                <Text
                  style={[
                    styles.statusTag,
                    { color: item.isVpnBypassed ? '#D97706' : '#059669' },
                  ]}
                >
                  {item.isVpnBypassed
                    ? '⚡ Excluded from DNS Blocking (Rewarded Ads Active)'
                    : '🛡️ Protected by Aegis Guard (Ads Blocked)'}
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

      {/* Add Custom Game / App Modal */}
      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Game or App Exclusion</Text>
            <Text style={styles.modalSubtitle}>
              Exclude games so their online servers and rewarded video ads work without restriction.
            </Text>

            <Text style={styles.inputLabel}>Game / App Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Injustice 2, 8 Ball Pool, Roblox"
              placeholderTextColor="#9CA3AF"
              value={newAppName}
              onChangeText={setNewAppName}
            />

            <Text style={styles.inputLabel}>Bundle / Package ID (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. com.developer.game"
              placeholderTextColor="#9CA3AF"
              value={newPackageName}
              onChangeText={setNewPackageName}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Custom Domains to Bypass (Comma-separated)</Text>
            <View style={styles.quickPresetRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setNewCustomDomains(GAMING_REWARDED_AD_DOMAINS.slice(0, 8).join(', '))}
                activeOpacity={0.7}
              >
                <Text style={styles.presetChipText}>🎮 Game Ads</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setNewCustomDomains(GOOGLE_ADMOB_DOMAINS.join(', '))}
                activeOpacity={0.7}
              >
                <Text style={styles.presetChipText}>📢 Google Ads</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() =>
                  setNewCustomDomains(
                    [
                      ...GAMING_REWARDED_AD_DOMAINS.slice(0, 6),
                      ...GOOGLE_ADMOB_DOMAINS.slice(0, 2),
                    ].join(', ')
                  )
                }
                activeOpacity={0.7}
              >
                <Text style={styles.presetChipText}>⚡ All Networks</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. unityads.unity3d.com, applvr.com"
              placeholderTextColor="#9CA3AF"
              value={newCustomDomains}
              onChangeText={setNewCustomDomains}
              autoCapitalize="none"
            />

            <View style={styles.modalSwitchRow}>
              <Text style={styles.modalSwitchLabel}>Exclude from DNS Blocking</Text>
              <Switch
                value={newIsBypassed}
                onValueChange={setNewIsBypassed}
                trackColor={{ false: '#D1D5DB', true: '#FDE68A' }}
                thumbColor={newIsBypassed ? '#F59E0B' : '#F3F4F6'}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsAddModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddCustomApp}
              >
                <Text style={styles.saveButtonText}>Add Game</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Popular Games Library Modal */}
      <Modal
        visible={isCatalogModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCatalogModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '82%', height: '82%' }]}>
            <View style={styles.catalogModalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle}>Popular Games Library</Text>
                <Text style={styles.modalSubtitle}>
                  One-tap exclusion with pre-tuned ad mediation rules.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.catalogCloseButton}
                onPress={() => setIsCatalogModalVisible(false)}
              >
                <Text style={styles.catalogCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.catalogSearchInput}
              placeholder="Search games (e.g. 8 Ball, Injustice, Subway)..."
              placeholderTextColor="#9CA3AF"
              value={catalogSearch}
              onChangeText={setCatalogSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <FlatList
              data={filteredCatalog}
              keyExtractor={(item) => item.packageName}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isAlreadyAdded = apps.some((a) => a.packageName === item.packageName);
                return (
                  <View style={styles.catalogItemRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.catalogItemName}>{item.appName}</Text>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{item.category}</Text>
                        </View>
                      </View>
                      <Text style={styles.catalogItemSub} numberOfLines={1}>
                        {item.packageName}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.catalogAddButton,
                        isAlreadyAdded ? styles.catalogAddButtonDisabled : null,
                      ]}
                      onPress={() => !isAlreadyAdded && handleAddFromCatalog(item)}
                      disabled={isAlreadyAdded}
                    >
                      <Text
                        style={[
                          styles.catalogAddButtonText,
                          isAlreadyAdded ? styles.catalogAddButtonTextDisabled : null,
                        ]}
                      >
                        {isAlreadyAdded ? 'Added ✓' : '+ Exclude'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catalogButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  catalogButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  addButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
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
  universalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  universalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  universalIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  universalTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  universalSubtitle: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 15,
  },
  proBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  quickPresetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  presetChip: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  catalogModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  catalogCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogCloseButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  catalogSearchInput: {
    height: 40,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
    marginBottom: 12,
  },
  catalogItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  catalogItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  categoryBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
  },
  catalogItemSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  catalogAddButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  catalogAddButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  catalogAddButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  catalogAddButtonTextDisabled: {
    color: '#9CA3AF',
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
  guideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  guideIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  guideTextContainer: {
    flex: 1,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  guideSubtitle: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 15,
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
    maxWidth: '75%',
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
  excludedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  excludedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  modalInput: {
    height: 42,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
    marginBottom: 12,
  },
  modalSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    paddingVertical: 6,
  },
  modalSwitchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
