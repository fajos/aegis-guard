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

export interface DnsBenchmarkResult {
  server: string;
  latencyMs: number;
  isOnline: boolean;
}

export interface DomainFilterTestResult {
  domain: string;
  isBlocked: boolean;
  matchedRule: string;
  isRewrite: boolean;
  rewriteIp: string;
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
  benchmarkDnsServers(servers: string[]): Promise<DnsBenchmarkResult[]>;
  setSafeSearchEnabled(enabled: boolean): Promise<boolean>;
  isSafeSearchEnabled(): Promise<boolean>;
  setParentalLockEnabled(enabled: boolean): Promise<boolean>;
  isParentalLockEnabled(): Promise<boolean>;
  testDomainFilter(domain: string): Promise<DomainFilterTestResult>;
}

const { AdGuardVpnModule } = NativeModules;

if (!AdGuardVpnModule) {
  console.warn(
    `[AdGuardVpnModule] Native module is not linked on platform: ${Platform.OS}. ` +
    'Run "npx expo run:android" or "eas build" to compile native VPN services. ' +
    'Note: Standard Expo Go does not include custom native VpnServices.'
  );
}

export const AdGuardVpn: AdGuardVpnInterface = {
  ...(AdGuardVpnModule || {}),
  benchmarkDnsServers: async (servers: string[]): Promise<DnsBenchmarkResult[]> => {
    if (typeof AdGuardVpnModule?.benchmarkDnsServers === 'function') {
      return AdGuardVpnModule.benchmarkDnsServers(servers);
    }
    throw new Error('Rebuild Required: Please rebuild and install the new APK to enable native UDP socket benchmarks.');
  },
  testDomainFilter: async (domain: string): Promise<DomainFilterTestResult> => {
    if (typeof AdGuardVpnModule?.testDomainFilter === 'function') {
      return AdGuardVpnModule.testDomainFilter(domain);
    }
    throw new Error('Rebuild Required: Please rebuild and install the new APK to enable live diagnostic testing.');
  },
  setSafeSearchEnabled: async (enabled: boolean): Promise<boolean> => {
    if (typeof AdGuardVpnModule?.setSafeSearchEnabled === 'function') {
      return AdGuardVpnModule.setSafeSearchEnabled(enabled);
    }
    return false;
  },
  isSafeSearchEnabled: async (): Promise<boolean> => {
    if (typeof AdGuardVpnModule?.isSafeSearchEnabled === 'function') {
      return AdGuardVpnModule.isSafeSearchEnabled();
    }
    return false;
  },
  setParentalLockEnabled: async (enabled: boolean): Promise<boolean> => {
    if (typeof AdGuardVpnModule?.setParentalLockEnabled === 'function') {
      return AdGuardVpnModule.setParentalLockEnabled(enabled);
    }
    return false;
  },
  isParentalLockEnabled: async (): Promise<boolean> => {
    if (typeof AdGuardVpnModule?.isParentalLockEnabled === 'function') {
      return AdGuardVpnModule.isParentalLockEnabled();
    }
    return false;
  },
};

export const vpnEventEmitter: NativeEventEmitter = AdGuardVpnModule
  ? new NativeEventEmitter(AdGuardVpnModule)
  : ({
      addListener: () => ({ remove: () => {} }),
      removeListener: () => {},
      removeAllListeners: () => {},
    } as unknown as NativeEventEmitter);
