import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { QueryLogScreen } from './src/screens/QueryLogScreen';
import { FiltersScreen } from './src/screens/FiltersScreen';
import { DnsSettingsScreen } from './src/screens/DnsSettingsScreen';
import { AppManagementScreen } from './src/screens/AppManagementScreen';
import { UserRulesScreen } from './src/screens/UserRulesScreen';

type Tab = 'dashboard' | 'queryLog' | 'filters' | 'dns' | 'apps' | 'rules';

interface TabItem {
  id: Tab;
  title: string;
  icon: string;
}

const TABS: TabItem[] = [
  { id: 'dashboard', title: 'Shield', icon: '🛡️' },
  { id: 'queryLog', title: 'Log', icon: '📋' },
  { id: 'filters', title: 'Filters', icon: '⚡' },
  { id: 'dns', title: 'DNS', icon: '🌐' },
  { id: 'apps', title: 'Apps', icon: '📱' },
  { id: 'rules', title: 'Rules', icon: '✏️' },
];

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen />;
      case 'queryLog':
        return <QueryLogScreen />;
      case 'filters':
        return <FiltersScreen />;
      case 'dns':
        return <DnsSettingsScreen />;
      case 'apps':
        return <AppManagementScreen />;
      case 'rules':
        return <UserRulesScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />

        {/* Screen Body */}
        <View style={styles.screenContainer}>{renderScreen()}</View>

        {/* Bottom Navigation Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabButton, isSelected && styles.tabButtonSelected]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.tabIcon}>{tab.icon}</Text>
                <Text
                  style={[
                    styles.tabLabel,
                    isSelected && styles.tabLabelSelected,
                  ]}
                >
                  {tab.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 6,
    paddingHorizontal: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  tabButtonSelected: {
    backgroundColor: '#F0FDF4',
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabLabelSelected: {
    color: '#10B981',
    fontWeight: '700',
  },
});
