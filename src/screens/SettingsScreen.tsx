import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DnsSettingsScreen } from './DnsSettingsScreen';
import { UserRulesScreen } from './UserRulesScreen';
import { FamilySecuritySection } from '../components/FamilySecuritySection';

export type SettingsSubTab = 'dns' | 'rules' | 'security';

interface SettingsScreenProps {
  initialSubTab?: SettingsSubTab;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ initialSubTab = 'dns' }) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialSubTab);

  return (
    <View style={styles.container}>
      {/* Header with Segmented Switcher */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings & Protection</Text>
        <Text style={styles.headerSubtitle}>
          Configure upstream resolvers, custom syntax, and family safety
        </Text>

        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentButton, activeSubTab === 'dns' && styles.segmentButtonActive]}
            onPress={() => setActiveSubTab('dns')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, activeSubTab === 'dns' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              🌐 DNS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentButton, activeSubTab === 'rules' && styles.segmentButtonActive]}
            onPress={() => setActiveSubTab('rules')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, activeSubTab === 'rules' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              ✏️ Rules
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentButton, activeSubTab === 'security' && styles.segmentButtonActive]}
            onPress={() => setActiveSubTab('security')}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, activeSubTab === 'security' && styles.segmentTextActive]}
              numberOfLines={1}
            >
              👨‍👩‍👧 Family
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Nested Sub-Screen View */}
      <View style={styles.content}>
        {activeSubTab === 'dns' ? (
          <DnsSettingsScreen isNested />
        ) : activeSubTab === 'rules' ? (
          <UserRulesScreen isNested />
        ) : (
          <FamilySecuritySection />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    marginBottom: 12,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
