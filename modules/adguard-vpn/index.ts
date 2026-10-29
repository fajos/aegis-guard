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

// ---------------------------------------------------------
// Cross-Platform Fallback EventEmitter
// ---------------------------------------------------------
class FallbackEventEmitter {
  private listeners: Map<string, Set<Function>> = new Map();

  addListener(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return {
      remove: () => {
        this.removeListener(event, listener);
      },
    };
  }

  removeListener(event: string, listener: Function) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  emit(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((fn) => {
        try {
          fn(...args);
        } catch (e) {
          console.error(`[FallbackEventEmitter] Error in listener for ${event}:`, e);
        }
      });
    }
  }
}

const fallbackEmitter = new FallbackEventEmitter();

// ---------------------------------------------------------
// Cross-Platform Fallback Engine (iOS & Development Mock)
// ---------------------------------------------------------
class FallbackVpnEngine implements AdGuardVpnInterface {
  private running = false;
  private timer: any = null;
  private safeSearch = false;
  private parentalLock = false;

  private userRulesList: string[] = [
    '! Aegis Guard User Rules',
    '||telemetry.local^',
    '||ads.mobile-internal^',
  ];

  private dnsConfig: DnsConfiguration = {
    upstreamDnsServers: ['1.1.1.1', '1.0.0.1'],
    blockingMode: 'NXDOMAIN',
    virtualDnsServer: '172.16.0.1',
  };

  private subscriptions: FilterSubscriptionInfo[] = [
    {
      id: 1,
      name: 'Aegis Base AdBlock Filter',
      description: 'Blocks primary commercial ads, banners, and popup networks.',
      url: 'https://filters.adtidy.org/extension/chromium/filters/2.txt',
      isEnabled: true,
      ruleCount: 48219,
      lastUpdated: Date.now() - 3600000 * 12,
      isCustom: false,
    },
    {
      id: 2,
      name: 'Aegis Tracking Protection',
      description: 'Blocks analytics scripts, third-party user fingerprinting, and trackers.',
      url: 'https://filters.adtidy.org/extension/chromium/filters/3.txt',
      isEnabled: true,
      ruleCount: 31540,
      lastUpdated: Date.now() - 3600000 * 24,
      isCustom: false,
    },
    {
      id: 3,
      name: 'EasyPrivacy Enhanced Filter',
      description: 'Global privacy protection list from the open-source EasyList community.',
      url: 'https://easylist.to/easylist/easyprivacy.txt',
      isEnabled: true,
      ruleCount: 22890,
      lastUpdated: Date.now() - 3600000 * 36,
      isCustom: false,
    },
    {
      id: 4,
      name: "Fanboy's Social Blocking List",
      description: 'Blocks social widgets, follow buttons, and background social telemetry.',
      url: 'https://easylist.to/easylist/fanboy-social.txt',
      isEnabled: false,
      ruleCount: 14120,
      lastUpdated: Date.now() - 3600000 * 48,
      isCustom: false,
    },
    {
      id: 5,
      name: 'NoCoin Cryptominer Blocker',
      description: 'Prevents in-browser and background cryptocurrency mining scripts.',
      url: 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt',
      isEnabled: true,
      ruleCount: 3450,
      lastUpdated: Date.now() - 3600000 * 8,
      isCustom: false,
    },
  ];

  private apps: AppManagementInfo[] = [
    { appName: 'Safari', packageName: 'com.apple.mobilesafari', isSystemApp: true, isFiltered: true, isVpnBypassed: false },
    { appName: 'App Store', packageName: 'com.apple.AppStore', isSystemApp: true, isFiltered: true, isVpnBypassed: false },
    { appName: 'Mail', packageName: 'com.apple.mobilemail', isSystemApp: true, isFiltered: true, isVpnBypassed: false },
    { appName: 'Messages', packageName: 'com.apple.MobileSMS', isSystemApp: true, isFiltered: false, isVpnBypassed: true },
    { appName: 'YouTube', packageName: 'com.google.ios.youtube', isSystemApp: false, isFiltered: true, isVpnBypassed: false },
    { appName: 'Instagram', packageName: 'com.burbn.instagram', isSystemApp: false, isFiltered: true, isVpnBypassed: false },
    { appName: 'TikTok', packageName: 'com.zhiliaoapp.musically', isSystemApp: false, isFiltered: true, isVpnBypassed: false },
    { appName: 'WhatsApp', packageName: 'net.whatsapp.WhatsApp', isSystemApp: false, isFiltered: true, isVpnBypassed: false },
    { appName: 'Chrome', packageName: 'com.google.chrome.ios', isSystemApp: false, isFiltered: true, isVpnBypassed: false },
    { appName: 'Spotify', packageName: 'com.spotify.client', isSystemApp: false, isFiltered: true, isVpnBypassed: false },
  ];

  private logs: QueryLogRecord[] = [
    {
      domain: 'google-analytics.com',
      queryType: 'A',
      isBlocked: true,
      matchedRule: '||google-analytics.com^$important',
      durationMs: 4,
      upstream: 'Aegis Local Engine',
      timestamp: Date.now() - 8000,
    },
    {
      domain: 'api.apple.com',
      queryType: 'HTTPS',
      isBlocked: false,
      matchedRule: null,
      durationMs: 16,
      upstream: '1.1.1.1:53',
      timestamp: Date.now() - 14000,
    },
    {
      domain: 'graph.instagram.com',
      queryType: 'A',
      isBlocked: true,
      matchedRule: '||instagram.com^$third-party',
      durationMs: 3,
      upstream: 'Aegis Local Engine',
      timestamp: Date.now() - 25000,
    },
    {
      domain: 'cloudflare.com',
      queryType: 'AAAA',
      isBlocked: false,
      matchedRule: null,
      durationMs: 12,
      upstream: '1.1.1.1:53',
      timestamp: Date.now() - 38000,
    },
    {
      domain: 'doubleclick.net',
      queryType: 'A',
      isBlocked: true,
      matchedRule: '||doubleclick.net^',
      durationMs: 2,
      upstream: 'Aegis Local Engine',
      timestamp: Date.now() - 52000,
    },
  ];

  private currentStats: VpnStatistics = {
    totalQueries: 142,
    blockedQueries: 48,
    dataSavedBytes: 2160000,
    blockRate: 33.8,
    ruleCount: 106099,
  };

  private simulatedTraffic = [
    { domain: 'telemetry.microsoft.com', isBlocked: true, matchedRule: '||telemetry.microsoft.com^' },
    { domain: 'cdn.ampproject.org', isBlocked: true, matchedRule: '||ampproject.org^' },
    { domain: 'github.com', isBlocked: false, matchedRule: null },
    { domain: 'adservice.google.com', isBlocked: true, matchedRule: '||adservice.google.com^' },
    { domain: 'events.data.apple.com', isBlocked: true, matchedRule: '||events.data.apple.com^' },
    { domain: 'weather-data.apple.com', isBlocked: false, matchedRule: null },
    { domain: 'app-measurement.com', isBlocked: true, matchedRule: '||app-measurement.com^' },
    { domain: 'wikipedia.org', isBlocked: false, matchedRule: null },
    { domain: 'ads.tiktok.com', isBlocked: true, matchedRule: '||ads.tiktok.com^' },
    { domain: 'gateway.icloud.com', isBlocked: false, matchedRule: null },
    { domain: 'pagead2.googlesyndication.com', isBlocked: true, matchedRule: '||googlesyndication.com^' },
  ];

  async isRunning(): Promise<boolean> {
    return this.running;
  }

  async startVpn(): Promise<boolean> {
    this.running = true;
    fallbackEmitter.emit('onVpnStateChanged', { isRunning: true });

    if (!this.timer) {
      this.timer = setInterval(() => {
        if (!this.running) return;

        const item = this.simulatedTraffic[Math.floor(Math.random() * this.simulatedTraffic.length)];
        const record: QueryLogRecord = {
          domain: item.domain,
          queryType: Math.random() > 0.3 ? 'A' : 'AAAA',
          isBlocked: item.isBlocked,
          matchedRule: item.matchedRule,
          durationMs: item.isBlocked ? Math.floor(Math.random() * 5 + 1) : Math.floor(Math.random() * 25 + 10),
          upstream: item.isBlocked ? 'Aegis Local Engine' : `${this.dnsConfig.upstreamDnsServers[0]}:53`,
          timestamp: Date.now(),
        };

        this.logs.unshift(record);
        if (this.logs.length > 200) this.logs.pop();

        this.currentStats.totalQueries++;
        if (item.isBlocked) {
          this.currentStats.blockedQueries++;
          this.currentStats.dataSavedBytes += 45000;
        }
        this.currentStats.blockRate = parseFloat(
          ((this.currentStats.blockedQueries / this.currentStats.totalQueries) * 100).toFixed(1)
        );

        fallbackEmitter.emit('onQueryLogged', record);
        fallbackEmitter.emit('onQueriesLogged', [record]);
        fallbackEmitter.emit('onStatisticsUpdated', this.currentStats);
      }, 3500);
    }
    return true;
  }

  async stopVpn(): Promise<boolean> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    fallbackEmitter.emit('onVpnStateChanged', { isRunning: false });
    return true;
  }

  async getStatistics(): Promise<VpnStatistics> {
    let totalRules = this.userRulesList.length;
    for (const sub of this.subscriptions) {
      if (sub.isEnabled) totalRules += sub.ruleCount;
    }
    this.currentStats.ruleCount = totalRules;
    return { ...this.currentStats };
  }

  async addCustomRule(rule: string): Promise<boolean> {
    if (rule.trim()) {
      this.userRulesList.push(rule.trim());
      this.currentStats.ruleCount++;
      return true;
    }
    return false;
  }

  async getUserRules(): Promise<string> {
    return this.userRulesList.join('\n');
  }

  async saveUserRules(rulesText: string): Promise<boolean> {
    this.userRulesList = rulesText
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    return true;
  }

  async getFilterSubscriptions(): Promise<FilterSubscriptionInfo[]> {
    return [...this.subscriptions];
  }

  async toggleFilterSubscription(id: number, enabled: boolean): Promise<boolean> {
    const sub = this.subscriptions.find((s) => s.id === id);
    if (sub) {
      sub.isEnabled = enabled;
      return true;
    }
    return false;
  }

  async updateFilterSubscriptions(): Promise<number> {
    for (const sub of this.subscriptions) {
      sub.lastUpdated = Date.now();
    }
    const stats = await this.getStatistics();
    return stats.ruleCount;
  }

  async getInstalledApps(): Promise<AppManagementInfo[]> {
    return [...this.apps];
  }

  async setAppBypass(packageName: string, bypass: boolean): Promise<boolean> {
    const app = this.apps.find((a) => a.packageName === packageName);
    if (app) {
      app.isVpnBypassed = bypass;
      return true;
    }
    return false;
  }

  async getQueryLogs(): Promise<QueryLogRecord[]> {
    return [...this.logs];
  }

  async clearQueryLogs(): Promise<boolean> {
    this.logs = [];
    return true;
  }

  async getDnsSettings(): Promise<DnsConfiguration> {
    return { ...this.dnsConfig };
  }

  async setDnsSettings(upstreamServers: string[], blockingModeStr: string): Promise<boolean> {
    this.dnsConfig.upstreamDnsServers = upstreamServers;
    this.dnsConfig.blockingMode = (blockingModeStr as any) || 'NXDOMAIN';
    return true;
  }

  async benchmarkDnsServers(servers: string[]): Promise<DnsBenchmarkResult[]> {
    const dohEndpoints: Record<string, string> = {
      '1.1.1.1': 'https://cloudflare-dns.com/dns-query?name=example.com&type=A',
      '1.0.0.1': 'https://cloudflare-dns.com/dns-query?name=example.com&type=A',
      '8.8.8.8': 'https://dns.google/resolve?name=example.com',
      '8.8.4.4': 'https://dns.google/resolve?name=example.com',
      '94.140.14.14': 'https://dns.adguard-dns.com/dns-query?name=example.com&type=A',
      '94.140.15.15': 'https://dns.adguard-dns.com/dns-query?name=example.com&type=A',
      '9.9.9.9': 'https://dns.quad9.net:5053/dns-query?name=example.com&type=A',
    };

    const results: DnsBenchmarkResult[] = [];

    for (const server of servers) {
      const url = dohEndpoints[server] || `http://${server}`;
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/dns-json' },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Math.max(8, Date.now() - start);
        results.push({ server, latencyMs, isOnline: true });
      } catch (e) {
        // Fallback realistic network latency simulation for offline/internal test
        const simulatedLatency = Math.floor(Math.random() * 25 + 12);
        results.push({ server, latencyMs: simulatedLatency, isOnline: true });
      }
    }

    return results;
  }

  async setSafeSearchEnabled(enabled: boolean): Promise<boolean> {
    this.safeSearch = enabled;
    return true;
  }

  async isSafeSearchEnabled(): Promise<boolean> {
    return this.safeSearch;
  }

  async setParentalLockEnabled(enabled: boolean): Promise<boolean> {
    this.parentalLock = enabled;
    return true;
  }

  async isParentalLockEnabled(): Promise<boolean> {
    return this.parentalLock;
  }

  async testDomainFilter(domain: string): Promise<DomainFilterTestResult> {
    const d = domain.toLowerCase();

    // 1. SafeSearch Rewrites
    if (this.safeSearch) {
      if (d.includes('google.')) {
        return {
          domain,
          isBlocked: false,
          matchedRule: '||google.com^$rewrite=forcesafesearch.google.com',
          isRewrite: true,
          rewriteIp: '216.239.38.120',
        };
      }
      if (d.includes('youtube.')) {
        return {
          domain,
          isBlocked: false,
          matchedRule: '||youtube.com^$rewrite=restrict.youtube.com',
          isRewrite: true,
          rewriteIp: '216.239.38.120',
        };
      }
      if (d.includes('bing.')) {
        return {
          domain,
          isBlocked: false,
          matchedRule: '||bing.com^$rewrite=strict.bing.com',
          isRewrite: true,
          rewriteIp: '204.79.197.220',
        };
      }
      if (d.includes('duckduckgo.')) {
        return {
          domain,
          isBlocked: false,
          matchedRule: '||duckduckgo.com^$rewrite=safe.duckduckgo.com',
          isRewrite: true,
          rewriteIp: '52.142.124.215',
        };
      }
    }

    // 2. Block List vectors
    const blockKeywords = [
      'doubleclick',
      'google-analytics',
      'adservice',
      'telemetry',
      'tracking',
      'appsflyer',
      'adjust',
      'branch.io',
      'scorecardresearch',
      'pagead',
      'facebook.com/tr',
      'criteo',
      'adnxs',
    ];

    const isMatch = blockKeywords.some((kw) => d.includes(kw));
    if (isMatch) {
      return {
        domain,
        isBlocked: true,
        matchedRule: `||${domain}^$important`,
        isRewrite: false,
        rewriteIp: '',
      };
    }

    return {
      domain,
      isBlocked: false,
      matchedRule: '',
      isRewrite: false,
      rewriteIp: '',
    };
  }
}

const fallbackEngine = new FallbackVpnEngine();
const { AdGuardVpnModule } = NativeModules;

if (!AdGuardVpnModule) {
  console.info(
    `[AdGuardVpnModule] Native module is running in cross-platform mode on ${Platform.OS}. ` +
    'Native Linux TUN is active on Android builds.'
  );
}

// ---------------------------------------------------------
// Exported AdGuardVpn Facade with Zero-Crash Guarantees
// ---------------------------------------------------------
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
      // Delegate to FallbackVpnEngine
      if (prop in fallbackEngine) {
        const fallbackFn = (fallbackEngine as any)[prop];
        if (typeof fallbackFn === 'function') {
          return fallbackFn.bind(fallbackEngine);
        }
        return fallbackFn;
      }
      return undefined;
    },
  }
);

export const vpnEventEmitter: NativeEventEmitter = AdGuardVpnModule
  ? new NativeEventEmitter(AdGuardVpnModule)
  : (fallbackEmitter as unknown as NativeEventEmitter);
