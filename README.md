# Complete AdGuard-Style Local VPN Ad-Blocker & Cross-Platform Filtering Platform (Expo SDK 54)

This project is a comprehensive reconstruction and implementation of the complete feature set found in **AdGuard for Android** (`com.adguard.android`), cross-compiled and structured as a production **Expo SDK 54** application supporting both **Android** and **iOS**:
`C:\Users\saintsbuilder\Documents\Projects\adguard`

---

## 📱 Cross-Platform Architecture Overview (Expo 54)

```
                                  +---------------------------------------+
                                  |     React Native / Expo UI (TSX)      |
                                  |  - DashboardScreen   - QueryLogScreen |
                                  |  - FiltersScreen     - DnsScreen      |
                                  |  - AppManagement     - UserRulesScreen|
                                  +-------------------+-------------------+
                                                      |
                                          useAdGuardVpn() hook
                                                      |
                                  modules/adguard-vpn (Expo Module Bridge)
                                                      |
                         +----------------------------+----------------------------+
                         |                                                         |
                         v                                                         v
             [ Android Native Layer ]                                    [ iOS Native Layer ]
        +---------------------------------+                         +---------------------------------+
        |  android.net.VpnService         |                         |  NetworkExtension.framework     |
        |  LocalVpnService.kt             |                         |  NEPacketTunnelProvider         |
        |  - IP: 10.0.0.2/32              |                         |  PacketTunnelProvider.swift     |
        |  - Virtual DNS: 198.18.53.53:53 |                         |  - IP: 10.0.0.2/32              |
        |  - TunPacketRouter.kt           |                         |  - Virtual DNS: 198.18.53.53:53 |
        |  - DnsFilterEngine.kt           |                         |  - DNS packet loop & sinkhole   |
        |  - AppManager (split-tunneling) |                         |  - App Groups shared defaults   |
        +---------------------------------+                         +---------------------------------+
```

---

## 🌟 Comprehensive Feature Matrix

| Feature | Source Implementation | AdGuard Equivalent | Description |
| :--- | :--- | :--- | :--- |
| **Expo 54 UI** | `App.tsx`, `src/screens/*.tsx` | AdGuard Mobile UI | Unified React Native dashboard with 6 tabs: Shield, Query Log, Filters, DNS, Apps, and User Rules. |
| **Expo Config Plugin** | `plugins/withAdguardVpn.js` | Config Plugin Architecture | Automatically injects `BIND_VPN_SERVICE`, foreground services, and NetworkExtension entitlements. |
| **Local Expo Module** | `modules/adguard-vpn/` | Expo Modules API | Local Expo Module (`expo-module.config.json`) autolinked across Android and iOS targets. |
| **Local VPN Interception** | `LocalVpnService.kt`, `PacketTunnelProvider.swift` | `LocalVpnService` / `NEPacketTunnelProvider` | Kernel TUN interface running on `10.0.0.2`, routing DNS to `198.18.53.53:53` with zero root requirement on Android and iOS. |
| **Packet Router Loop** | `TunPacketRouter.kt` & iOS packet loop | `DnsTunListener.class` & `NativeTcpIpStackImpl` | Processes raw IPv4/UDP packets, decodes DNS wire-format requests, and generates synthetic 0.0.0.0/NXDOMAIN replies. |
| **Advanced Rule Syntax** | `AdBlockRule.kt`, `RuleMatcher.kt` | `libadguard-dns.so` rule engine | Supports AdBlock (`||domain^`), Hosts (`0.0.0.0 domain`), Allowlist exceptions (`@@||domain^`), `$important` priority override, and Regex (`/pattern/`). |
| **DNS Rewrites** | `DnsFilterEngine.kt`, `DnsPacket.kt` | `FilteringLogAction` & `$dnsrewrite` | Supports `$dnsrewrite=1.2.3.4` and CNAME redirection to rewrite custom domains. |
| **Filter Subscriptions** | `FilterSubscription.kt`, `FilterRepository.kt` | Filters Manager | Predefined lists (AdGuard Base, Tracking, Mobile, DNS Filter) + custom remote URL subscriptions with automatic background updates. |
| **User Custom Rules** | `UserRulesScreen.tsx`, `UserRulesActivity.kt` | User Rules Editor | Direct multiline rule editor with syntax checking and live application. |
| **DNS Stamp Decoding** | `DnsStamp.kt` | `com.adguard.dnslibs.proxy.DnsStamp` | Complete RFC DNS Stamp (`sdns://...`) decoding for DoH, DoT, DNSCrypt, Plain, and DoQ. |
| **Parallel Upstream Resolution**| `ParallelDnsResolver.kt` | `isEnableParallelUpstreamQueries` | Concurrently races multiple DNS upstreams and returns the fastest response. |
| **Optimistic DNS Caching** | `DnsCache.kt` | `isOptimisticCache` & `dnsCacheSize` | LRU cache with TTL awareness + optimistic serving of slightly expired records while refreshing in background. |
| **ECH & H3/ALPN Blocking** | `DnsFilterEngine.kt` | `blockEch` & `blockH3Alpn` | Blocks SVCB/HTTPS query type 65 to prevent trackers and advertisers from bypassing local inspection via Encrypted Client Hello. |
| **Split Tunneling (Apps)** | `AppManagementScreen.tsx`, `AppManager.kt` | App Management (`addDisallowedApplication`) | Per-app filtering controls and VPN bypass list with installed application discovery. |
| **Live Query Log & One-Tap Rules**| `QueryLogScreen.tsx`, `FilteringLog.kt` | Filtering Log & Action Generator | Live query search, details dialog, and one-tap "Block domain" / "Unblock domain" rule generator. |
| **Aggregate Analytics** | `StatisticsManager.kt`, `DashboardScreen.tsx` | Protection Statistics | Computes total requests, ads blocked, block rate %, and estimated data saved in KB/MB. |

---

## 📁 Project Structure

```
adguard/
├── app.json                       # Expo 54 configuration & plugins declaration
├── package.json                   # Expo SDK 54 dependencies & scripts
├── tsconfig.json                  # TypeScript compiler configuration
├── babel.config.js                # Babel configuration (babel-preset-expo)
├── metro.config.js                # Metro configuration (expo/metro-config)
├── index.js                       # Expo registerRootComponent entry point
├── App.tsx                        # Main application with bottom tab navigation
│
├── plugins/                       # Expo Config Plugins
│   └── withAdguardVpn.js          # Injects VPN services & iOS entitlements
│
├── modules/adguard-vpn/           # Local Expo Module
│   ├── expo-module.config.json    # Expo module declaration & autolinking config
│   ├── package.json               # Module manifest
│   └── index.ts                   # Native API interface & event emitter
│
├── src/                           # Cross-Platform React Native Source
│   ├── native/
│   │   └── AdGuardVpnModule.ts    # Re-exports local Expo module
│   ├── hooks/
│   │   └── useAdGuardVpn.ts       # React state & lifecycle hook
│   └── screens/
│       ├── DashboardScreen.tsx    # Shield card, 4 metric cards, live stream
│       ├── QueryLogScreen.tsx     # Filter tabs, search, 1-tap block/unblock
│       ├── FiltersScreen.tsx      # Subscriptions list, toggle, auto-update
│       ├── DnsSettingsScreen.tsx  # Upstream DNS picker & blocking modes
│       ├── AppManagementScreen.tsx# Split-tunneling list & bypass switch
│       └── UserRulesScreen.tsx    # Custom rules multiline editor & cheat sheet
│
├── android/                       # Native Android Project
│   ├── build.gradle               # Root Gradle configuration
│   ├── settings.gradle            # Project settings
│   └── app/
│       ├── build.gradle           # App build config (React Native plugin)
│       └── src/main/
│           ├── AndroidManifest.xml# Permissions, LocalVpnService, Quick Tile
│           └── java/com/adguard/clone/
│               ├── MainActivity.kt        # ReactActivity host
│               ├── MainApplication.kt     # ReactApplication host
│               ├── bridge/
│               │   ├── AdGuardVpnModule.kt  # React Native Bridge implementation
│               │   └── AdGuardVpnPackage.kt # Bridge package registration
│               ├── vpn/           # LocalVpnService, TunPacketRouter, Watchdog
│               ├── filter/        # AdBlockRule, RuleMatcher, DnsFilterEngine
│               ├── dns/           # DnsPacket, ParallelDnsResolver, DnsStamp
│               ├── packet/        # IpPacket, UdpPacket, Checksum
│               ├── appmanagement/ # AppManager (split-tunneling)
│               └── stats/         # StatisticsManager
│
├── ios/                           # Native iOS Project
│   ├── Podfile                    # CocoaPods dependencies
│   ├── AdGuardApp/
│   │   ├── AppDelegate.h / .mm    # React Native iOS Application lifecycle
│   │   ├── AdGuardVpnBridge.m     # Obj-C bridge export
│   │   ├── AdGuardVpnModule.swift # NETunnelProviderManager bridge module
│   │   └── Info.plist             # iOS permissions & configurations
│   └── PacketTunnel/
│       ├── PacketTunnelProvider.swift # NEPacketTunnelProvider packet engine
│       ├── PacketTunnel.entitlements  # NetworkExtension entitlements
│       └── Info.plist                 # Extension point configuration
│
└── verify_feature.py              # Automated 7-feature verification test suite
```

---

## 🚀 Verification & Execution

### 1. Run Automated Engine Tests:
```bash
python verify_feature.py
```

### 2. Run with Expo 54:
```bash
# Start Expo development server:
npx expo start

# Run native development build on Android:
npx expo run:android

# Run native development build on iOS (macOS host with Xcode):
npx expo run:ios

# Regenerate native Android and iOS folders if needed:
npx expo prebuild
```
