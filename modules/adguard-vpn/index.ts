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

export const AdGuardVpn: AdGuardVpnInterface = new Proxy(
  (AdGuardVpnModule || {}) as AdGuardVpnInterface,
  {
    get(target: any, prop: string) {
      const val = target[prop];
      if (typeof val === 'function') {
        return val.bind(target);
      }
      if (val !== undefined) {
        return val;
      }
      // Fallbacks if native module is running on an older build
      if (prop === 'benchmarkDnsServers') {
        return async () => {
          throw new Error('Rebuild Required: Please install the updated build to enable native UDP socket benchmarks.');
        };
      }
      if (prop === 'testDomainFilter') {
        return async () => {
          throw new Error('Rebuild Required: Please install the updated build to enable live diagnostic testing.');
        };
      }
      if (prop === 'isSafeSearchEnabled' || prop === 'isParentalLockEnabled') {
        return async () => false;
      }
      if (prop === 'setSafeSearchEnabled' || prop === 'setParentalLockEnabled') {
        return async () => false;
      }
      return undefined;
    },
  }
);

export const vpnEventEmitter: NativeEventEmitter = AdGuardVpnModule
  ? new NativeEventEmitter(AdGuardVpnModule)
  : ({
      addListener: () => ({ remove: () => {} }),
      removeListener: () => {},
      removeAllListeners: () => {},
    } as unknown as NativeEventEmitter);
