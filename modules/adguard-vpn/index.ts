import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

export interface VpnStatistics {
  totalQueries: number;
  blockedQueries: number;
  dataSavedBytes: number;
  blockRate: number;
  ruleCount: number;
}

export interface QueryLogRecord {
  domain: string;
  queryType: string;
  isBlocked: boolean;
  matchedRule: string | null;
  durationMs: number;
  upstream: string;
  timestamp: number;
}

export interface FilterSubscriptionInfo {
  id: number;
  name: string;
  description: string;
  url: string;
  isEnabled: boolean;
  ruleCount: number;
  lastUpdated: number;
  isCustom: boolean;
}

export interface AppManagementInfo {
  appName: string;
  packageName: string;
  isSystemApp: boolean;
  isFiltered: boolean;
  isVpnBypassed: boolean;
}

export interface DnsConfiguration {
  upstreamDnsServers: string[];
  blockingMode: 'ADDRESS' | 'NXDOMAIN' | 'REFUSED';
  virtualDnsServer: string;
}

export interface AdGuardVpnInterface {
  isRunning(): Promise<boolean>;
  startVpn(): Promise<boolean>;
  stopVpn(): Promise<boolean>;
  getStatistics(): Promise<VpnStatistics>;
  addCustomRule(rule: string): Promise<boolean>;
  getUserRules(): Promise<string>;
  saveUserRules(rulesText: string): Promise<boolean>;
  getFilterSubscriptions(): Promise<FilterSubscriptionInfo[]>;
  toggleFilterSubscription(id: number, enabled: boolean): Promise<boolean>;
  updateFilterSubscriptions(): Promise<number>;
  getInstalledApps(): Promise<AppManagementInfo[]>;
  setAppBypass(packageName: string, bypass: boolean): Promise<boolean>;
  getQueryLogs(): Promise<QueryLogRecord[]>;
  clearQueryLogs(): Promise<boolean>;
  getDnsSettings(): Promise<DnsConfiguration>;
  setDnsSettings(upstreamServers: string[], blockingModeStr: string): Promise<boolean>;
}

const { AdGuardVpnModule } = NativeModules;

if (!AdGuardVpnModule) {
  console.warn(
    `[AdGuardVpnModule] Native module is not linked on platform: ${Platform.OS}. ` +
    'Run "npx expo run:android" or "eas build" to compile native VPN services. ' +
    'Note: Standard Expo Go does not include custom native VpnServices.'
  );
}

export const AdGuardVpn = AdGuardVpnModule as AdGuardVpnInterface;

export const vpnEventEmitter: NativeEventEmitter = AdGuardVpnModule
  ? new NativeEventEmitter(AdGuardVpnModule)
  : ({
      addListener: () => ({ remove: () => {} }),
      removeListener: () => {},
      removeAllListeners: () => {},
    } as unknown as NativeEventEmitter);
