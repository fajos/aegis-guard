import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdGuardVpn, QueryLogRecord } from '../native/AdGuardVpnModule';

type FilterTab = 'ALL' | 'BLOCKED' | 'ALLOWED';

export const QueryLogScreen: React.FC = () => {
  const [logs, setLogs] = useState<QueryLogRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<QueryLogRecord | null>(null);

  const fetchLogs = async () => {
    try {
      if (!AdGuardVpn) return;
      const data = await AdGuardVpn.getQueryLogs();
      setLogs(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleClear = async () => {
    Alert.alert(
      'Clear Query Log',
      'Are you sure you want to delete all logged DNS requests?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await AdGuardVpn.clearQueryLogs();
            setLogs([]);
          },
        },
      ]
    );
  };

  const handleBlockDomain = async (domain: string) => {
    const rule = `||${domain}^`;
    try {
      await AdGuardVpn.addCustomRule(rule);
      setSelectedEntry(null);
      Alert.alert('Rule Added', `Blocked ${domain} using rule:\n${rule}`);
      fetchLogs();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add rule');
    }
  };

  const handleWhitelistDomain = async (domain: string) => {
    const rule = `@@||${domain}^`;
    try {
      await AdGuardVpn.addCustomRule(rule);
      setSelectedEntry(null);
      Alert.alert('Rule Added', `Whitelisted ${domain} using rule:\n${rule}`);
      fetchLogs();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add whitelist rule');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const matchesSearch =
        item.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.queryType.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'BLOCKED') return item.isBlocked;
      if (activeTab === 'ALLOWED') return !item.isBlocked;
      return true;
    });
  }, [logs, searchQuery, activeTab]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Search and Action Bar */}
      <View style={styles.searchBarRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by domain (e.g. google.com)..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['ALL', 'BLOCKED', 'ALLOWED'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === tab && styles.tabButtonTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Log List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={(item, index) => `${item.domain}-${item.timestamp}-${index}`}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No requests match the current filter.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => setSelectedEntry(item)}
          >
            <View style={styles.cardHeader}>
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
              <Text style={styles.qtypeBadge}>{item.queryType}</Text>
              <Text style={styles.timestampText}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
            </View>

            <Text style={styles.domainText} numberOfLines={1}>
              {item.domain}
            </Text>

            <View style={styles.cardFooter}>
              <Text style={styles.footerDetail}>
                {item.matchedRule ? `Rule: ${item.matchedRule}` : `DNS: ${item.upstream}`}
              </Text>
              <Text style={styles.durationText}>{item.durationMs.toFixed(1)} ms</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail / 1-Tap Action Modal */}
      <Modal
        visible={!!selectedEntry}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedEntry && (
              <>
                <Text style={styles.modalTitle}>Request Details</Text>
                <Text style={styles.modalDomain}>{selectedEntry.domain}</Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Status:</Text>
                  <Text
                    style={[
                      styles.metaValue,
                      { color: selectedEntry.isBlocked ? '#DC2626' : '#059669' },
                    ]}
                  >
                    {selectedEntry.isBlocked ? 'Blocked' : 'Allowed'}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Query Type:</Text>
                  <Text style={styles.metaValue}>{selectedEntry.queryType}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Latency:</Text>
                  <Text style={styles.metaValue}>{selectedEntry.durationMs.toFixed(1)} ms</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Upstream Server:</Text>
                  <Text style={styles.metaValue}>{selectedEntry.upstream}</Text>
                </View>

                {selectedEntry.matchedRule && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Matched Rule:</Text>
                    <Text style={[styles.metaValue, { color: '#B91C1C' }]}>
                      {selectedEntry.matchedRule}
                    </Text>
                  </View>
                )}

                {/* 1-Tap Quick Action Buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.blockBtn]}
                    onPress={() => handleBlockDomain(selectedEntry.domain)}
                  >
                    <Text style={styles.actionBtnText}>Block Domain (||{selectedEntry.domain}^)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.allowBtn]}
                    onPress={() => handleWhitelistDomain(selectedEntry.domain)}
                  >
                    <Text style={styles.actionBtnText}>Whitelist Domain (@@||{selectedEntry.domain}^)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.closeBtn]}
                    onPress={() => setSelectedEntry(null)}
                  >
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  searchBarRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    color: '#111827',
  },
  clearButton: {
    height: 42,
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  tabButtonTextActive: {
    color: '#111827',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  qtypeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    marginRight: 'auto',
  },
  timestampText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  domainText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerDetail: {
    fontSize: 11,
    color: '#6B7280',
    flex: 1,
  },
  durationText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalDomain: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
    marginTop: 4,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  metaLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  modalActions: {
    marginTop: 18,
    gap: 10,
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  blockBtn: {
    backgroundColor: '#EF4444',
  },
  allowBtn: {
    backgroundColor: '#10B981',
  },
  closeBtn: {
    backgroundColor: '#F3F4F6',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  closeBtnText: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 14,
  },
});
