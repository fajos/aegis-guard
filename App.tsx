import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { QueryLogScreen } from './src/screens/QueryLogScreen';
import { FiltersScreen } from './src/screens/FiltersScreen';
import { AppManagementScreen } from './src/screens/AppManagementScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type Tab = 'dashboard' | 'queryLog' | 'filters' | 'apps' | 'settings';

interface TabItem {
  id: Tab;
  title: string;
  icon: string;
}

const TABS: TabItem[] = [
  { id: 'dashboard', title: 'Shield', icon: '🛡️' },
  { id: 'queryLog', title: 'Log', icon: '📋' },
  { id: 'filters', title: 'Filters', icon: '⚡' },
  { id: 'apps', title: 'Apps', icon: '📱' },
  { id: 'settings', title: 'Settings', icon: '⚙️' },
];

function MainNavigator(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const insets = useSafeAreaInsets();

  // Ensure bottom padding respects Android edge-to-edge navigation bar / gesture bar
  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* Screen Body - Persistent Screen Instances across Tabs */}
      <View style={styles.screenContainer}>
        <View style={[styles.screenWrapper, activeTab !== 'dashboard' && styles.hidden]}>
          <DashboardScreen isActive={activeTab === 'dashboard'} />
        </View>
        <View style={[styles.screenWrapper, activeTab !== 'queryLog' && styles.hidden]}>
          <QueryLogScreen isActive={activeTab === 'queryLog'} />
        </View>
        <View style={[styles.screenWrapper, activeTab !== 'filters' && styles.hidden]}>
          <FiltersScreen />
        </View>
        <View style={[styles.screenWrapper, activeTab !== 'apps' && styles.hidden]}>
          <AppManagementScreen />
        </View>
        <View style={[styles.screenWrapper, activeTab !== 'settings' && styles.hidden]}>
          <SettingsScreen />
        </View>
      </View>

      {/* Bottom Navigation Tab Bar with Safe Area Inset Protection */}
      <View style={[styles.tabBar, { paddingBottom: bottomPadding }]}>
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
                numberOfLines={1}
              >
                {tab.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <MainNavigator />
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
  screenWrapper: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
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
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  tabButtonSelected: {
    backgroundColor: '#F0FDF4',
  },
  tabIcon: {
    fontSize: 19,
    marginBottom: 3,
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
