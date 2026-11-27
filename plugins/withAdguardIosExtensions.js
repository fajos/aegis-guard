const fs = require('fs');
const path = require('path');

let withXcodeProject, withDangerousMod, withPodfile, IOSConfig, createRunOncePlugin;

try {
  const plugins = require('expo/config-plugins');
  withXcodeProject = plugins.withXcodeProject;
  withDangerousMod = plugins.withDangerousMod;
  withPodfile = plugins.withPodfile;
  IOSConfig = plugins.IOSConfig;
  createRunOncePlugin = plugins.createRunOncePlugin;
} catch (e) {
  createRunOncePlugin = (fn) => fn;
}

const APP_GROUP = 'group.com.fajostech.aegisguard';
const SAFARI_TARGET = 'AegisSafariBlocker';
const SAFARI_BUNDLE_ID = 'com.fajostech.aegisguard.SafariBlocker';
const WIDGET_TARGET = 'AegisWidget';
const WIDGET_BUNDLE_ID = 'com.fajostech.aegisguard.Widget';
const TUNNEL_TARGET = 'AegisPacketTunnel';
const TUNNEL_BUNDLE_ID = 'com.fajostech.aegisguard.PacketTunnel';
const SMS_TARGET = 'AegisSmsFilter';
const SMS_BUNDLE_ID = 'com.fajostech.aegisguard.SmsFilter';

const INITIAL_BLOCKER_LIST = [
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?doubleclick\\.net/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?googlesyndication\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?googleadservices\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?adservice\\.google\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?adserver\\.yahoo\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?ads\\.yahoo\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?m\\.yap\\.yahoo\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?gemini\\.yahoo\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?yads\\.zedo\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?taboola\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?outbrain\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: { 'url-filter': '^https?://([^/]+\\.)?criteo\\.com/' },
    action: { type: 'block' },
  },
  {
    trigger: {
      'url-filter': '.*',
      'if-domain': ['*youtube.com', '*m.youtube.com'],
    },
    action: {
      type: 'css-display-none',
      selector:
        'ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer, ytd-ad-slot-renderer, .ytp-ad-module, .ytp-ad-overlay-container, #player-ads, ytd-banner-promo-renderer',
    },
  },
  {
    trigger: {
      'url-filter': '.*',
      'if-domain': ['*yahoo.com', '*mail.yahoo.com'],
    },
    action: {
      type: 'css-display-none',
      selector:
        '[data-test-id="ad-banner"], [data-test-id="sponsored-ad"], [data-test-id="pencil-ad"], [data-test-id="infeed-ad"], .gemini-ad, .native-ad-card',
    },
  },
];

const SAFARI_HANDLER_SWIFT = `import Foundation

class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    private let appGroupId = "${APP_GROUP}"

    func beginRequest(with context: NSExtensionContext) {
        var attachment: NSItemProvider?

        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) {
            let dynamicURL = containerURL.appendingPathComponent("blockerList.json")
            if FileManager.default.fileExists(atPath: dynamicURL.path) {
                attachment = NSItemProvider(contentsOf: dynamicURL)
            }
        }

        if attachment == nil, let bundledURL = Bundle.main.url(forResource: "blockerList", withExtension: "json") {
            attachment = NSItemProvider(contentsOf: bundledURL)
        }

        let item = NSExtensionItem()
        if let attachment = attachment {
            item.attachments = [attachment]
        }
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
`;

const WIDGET_SWIFT = `import WidgetKit
import SwiftUI

struct AegisShieldEntry: TimelineEntry {
    let date: Date
    let isRunning: Bool
    let blockedQueries: Int
    let blockRate: Double
    let activeProfile: String
}

struct AegisShieldProvider: TimelineProvider {
    private let appGroupId = "${APP_GROUP}"

    func placeholder(in context: Context) -> AegisShieldEntry {
        AegisShieldEntry(date: Date(), isRunning: true, blockedQueries: 142, blockRate: 34.5, activeProfile: "Aegis Guard DNS")
    }

    func getSnapshot(in context: Context, completion: @escaping (AegisShieldEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AegisShieldEntry>) -> Void) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func loadEntry() -> AegisShieldEntry {
        let defaults = UserDefaults(suiteName: appGroupId)
        let isRunning = defaults?.bool(forKey: "widget_is_running") ?? false
        let blocked = defaults?.integer(forKey: "widget_blocked_queries") ?? 0
        let rate = defaults?.double(forKey: "widget_block_rate") ?? 0.0
        let profile = defaults?.string(forKey: "widget_active_profile") ?? "Aegis Guard DNS"
        return AegisShieldEntry(
            date: Date(),
            isRunning: isRunning,
            blockedQueries: blocked,
            blockRate: rate,
            activeProfile: profile
        )
    }
}

struct AegisWidgetBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) {
                Color(red: 0.01, green: 0.04, blue: 0.13)
            }
        } else {
            content.background(Color(red: 0.01, green: 0.04, blue: 0.13))
        }
    }
}

struct AegisShieldWidgetView: View {
    @Environment(\\.widgetFamily) var family
    let entry: AegisShieldEntry

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color(red: 0.01, green: 0.04, blue: 0.13), Color(red: 0.05, green: 0.11, blue: 0.24)]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: entry.isRunning ? "checkmark.shield.fill" : "shield.slash.fill")
                        .foregroundColor(entry.isRunning ? Color.green : Color.orange)
                        .font(.title3)
                    Spacer()
                    Text(entry.isRunning ? "ACTIVE" : "PAUSED")
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background((entry.isRunning ? Color.green : Color.orange).opacity(0.2))
                        .foregroundColor(entry.isRunning ? Color.green : Color.orange)
                        .cornerRadius(6)
                }

                Spacer()

                Text("\\(entry.blockedQueries)")
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                Text("Ads & Trackers Blocked")
                    .font(.caption2)
                    .foregroundColor(Color.white.opacity(0.75))

                if family != .systemSmall {
                    Text(entry.activeProfile)
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(Color.green.opacity(0.9))
                        .lineLimit(1)
                }
            }
            .padding(14)
        }
        .modifier(AegisWidgetBackgroundModifier())
    }
}

@main
struct AegisWidgetBundle: WidgetBundle {
    var body: some Widget {
        AegisShieldWidget()
    }
}

struct AegisShieldWidget: Widget {
    let kind: String = "AegisShieldWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AegisShieldProvider()) { entry in
            AegisShieldWidgetView(entry: entry)
        }
        .configurationDisplayName("Aegis Guard Shield")
        .description("View encrypted DNS status and blocked trackers at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
`;

const SHORTCUTS_SWIFT = `import Foundation
import NetworkExtension
#if canImport(AppIntents)
import AppIntents

@available(iOS 16.0, *)
struct EnableAegisShieldIntent: AppIntent {
    static var title: LocalizedStringResource = "Enable Aegis Guard Shield"
    static var description = IntentDescription("Activates system-wide local VPN & encrypted DNS ad & tracker protection.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let mode = UserDefaults(suiteName: "${APP_GROUP}")?.string(forKey: "aegis_ios_dns_mode") ?? "tunnel"
        if mode != "native" {
            let managers = try await NETunnelProviderManager.loadAllFromPreferences()
            if let manager = managers.first {
                manager.isEnabled = true
                try await manager.saveToPreferences()
                try await manager.loadFromPreferences()
                try manager.connection.startVPNTunnel()
                return .result(dialog: "Aegis Guard local VPN protection is now enabled.")
            }
        }

        let dnsManager = NEDNSSettingsManager.shared()
        try await dnsManager.loadFromPreferences()
        dnsManager.onDemandRules = nil
        try await dnsManager.saveToPreferences()
        return .result(dialog: "Aegis Guard encrypted DNS protection is now enabled.")
    }
}

@available(iOS 16.0, *)
struct PauseAegisShieldIntent: AppIntent {
    static var title: LocalizedStringResource = "Pause Aegis Guard Shield"
    static var description = IntentDescription("Temporarily suspends local VPN DNS filtering so game rewarded ads can load.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let mode = UserDefaults(suiteName: "${APP_GROUP}")?.string(forKey: "aegis_ios_dns_mode") ?? "tunnel"
        if mode != "native" {
            let managers = try await NETunnelProviderManager.loadAllFromPreferences()
            if let manager = managers.first {
                manager.connection.stopVPNTunnel()
                return .result(dialog: "Aegis Guard local VPN protection has been paused.")
            }
        }

        let dnsManager = NEDNSSettingsManager.shared()
        try await dnsManager.loadFromPreferences()
        let disconnectRule = NEOnDemandRuleDisconnect()
        disconnectRule.interfaceTypeMatch = .any
        dnsManager.onDemandRules = [disconnectRule]
        try await dnsManager.saveToPreferences()
        return .result(dialog: "Aegis Guard protection has been paused.")
    }
}

@available(iOS 16.0, *)
struct AegisShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: EnableAegisShieldIntent(),
            phrases: ["Enable \\(.applicationName)", "Turn on \\(.applicationName)"],
            shortTitle: "Enable Shield",
            systemImageName: "checkmark.shield.fill"
        )
        AppShortcut(
            intent: PauseAegisShieldIntent(),
            phrases: ["Pause \\(.applicationName)", "Snooze \\(.applicationName)"],
            shortTitle: "Pause Shield",
            systemImageName: "shield.slash.fill"
        )
    }
}
#endif
`;

const PACKET_TUNNEL_SWIFT = `import Foundation
import NetworkExtension
import Network
import Security
import Tun2SocksKit
import UserNotifications
import Darwin
#if canImport(WidgetKit)
import WidgetKit
#endif

class PacketTunnelProvider: NEPacketTunnelProvider {
    private let appGroupId = "${APP_GROUP}"
    private let tunnelRemoteAddress = "198.18.0.1"
    private let tunnelAddress = "198.18.0.2"
    private let virtualDnsAddress = "198.18.53.53"
    private let tunnelAddress6 = "fd00:198:18::2"
    private let virtualDnsAddress6 = "fd00:198:18::53"

    private let stateQueue = DispatchQueue(label: "com.fajostech.aegisguard.tunnel.state")
    private let statsQueue = DispatchQueue(label: "com.fajostech.aegisguard.tunnel.stats")

    private var socksServer: LocalSocks5Server?
    private let dnsCacheLock = NSLock()
    private var dnsCache: [String: (data: Data, expiresAt: TimeInterval, upstreamBlocked: Bool, transport: String)] = [:]
    private var isStopping: Bool = false

    // Runtime configuration loaded from shared App Group
    private var isPremium: Bool = true
    private var blockingMode: String = "ADDRESS"
    private var safeSearchEnabled: Bool = false
    private var familyProtectionEnabled: Bool = false
    private var threatAlertsEnabled: Bool = true
    private var upstreamDohUrl: String = "https://dns.adguard-dns.com/dns-query"
    private var upstreamBootstrapIp: String = "94.140.14.14"
    private var upstreamProfileName: String = "Aegis Guard DNS (Default)"

    private var categoryDomains: Set<String> = []
    private var downloadedAdDomains: Set<String> = []
    private var excludedDomains: Set<String> = []
    private var allowRules: Set<String> = []
    private var blockRules: Set<String> = []
    private var rewriteRules: [String: String] = [:]

    // Scheduled Bedtime window
    private var scheduleEnabled: Bool = false
    private var scheduleStartHour: Int = 21
    private var scheduleEndHour: Int = 7
    private var scheduledDomains: Set<String> = []

    // Counters & logs
    private var totalQueries: Int = 0
    private var blockedQueries: Int = 0
    private var dataSavedBytes: Double = 0
    private var recentLogs: [[String: Any]] = []
    private var threatCooldown: [String: TimeInterval] = [:]
    private var pendingStatsFlush: Bool = false
    private var isTunnelActive: Bool = false

    private let builtInAdDomains: Set<String> = [
        "doubleclick.net",
        "ad.doubleclick.net",
        "stats.g.doubleclick.net",
        "cm.g.doubleclick.net",
        "googleads.g.doubleclick.net",
        "pubads.g.doubleclick.net",
        "pagead.l.doubleclick.net",
        "pagead2.googlesyndication.com",
        "tpc.googlesyndication.com",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "adtrafficquality.google",
        "ep1.adtrafficquality.google",
        "ep2.adtrafficquality.google",
        "fundingchoicesmessages.google.com",
        "app-measurement.com",
        "google-analytics.com",
        "googletagmanager.com",
        "admob.com",
        "iadsdk.apple.com",
        "iadcontent.apple.com",
        "ads.facebook.com",
        "an.facebook.com",
        "ads.yahoo.com",
        "adserver.yahoo.com",
        "m.yap.yahoo.com",
        "gemini.yahoo.com",
        "b.gemini.yahoo.com",
        "beap.gemini.yahoo.com",
        "pr.comet.yahoo.com",
        "ups.analytics.yahoo.com",
        "analytics.query.yahoo.com",
        "opus.analytics.yahoo.com",
        "sp.analytics.yahoo.com",
        "cmp.yahoo.com",
        "yads.zedo.com",
        "yads.c.oath.com",
        "taboola.com",
        "outbrain.com",
        "criteo.com",
        "criteo.net",
        "adnxs.com",
        "pubmatic.com",
        "rubiconproject.com",
        "openx.net",
        "amazon-adsystem.com",
        "moatads.com",
        "scorecardresearch.com",
        "quantserve.com",
        "ads.tiktok.com",
        "analytics.tiktok.com",
        "pixel.facebook.com",
        "applovin.com",
        "al-sdk.applovin.com",
        "applvr.com",
        "vungle.com",
        "unityads.unity3d.com",
        "ironsrc.com",
        "supersonicads.com",
        "supersonic.com",
        "mintegral.com",
        "rayjump.com",
        "chartboost.com",
        "inmobi.com",
        "tapjoy.com",
        "tapjoyads.com",
        "fyber.com",
        "smaato.net",
        "adcolony.com",
        "mopub.com",
        "startappservice.com",
        "startapp.com",
        "pangle.io",
        "bidmachine.io",
        "coinhive.com",
        "crypto-loot.com",
        "appsflyer.com",
        "appsflyersdk.com",
        "adjust.com",
        "adjust.io",
        "app.adjust.com",
        "branch.io",
        "api2.branch.io",
        "mixpanel.com",
        "amplitude.com",
        "flurry.com",
        "imasdk.googleapis.com",
        "s0.2mdn.net",
        "2mdn.net",
        "mediavisor.doubleclick.net",
        "adx.g.doubleclick.net",
        "bid.g.doubleclick.net",
        "adclick.g.doubleclick.net",
        "partnerad.l.doubleclick.net",
        "securepubads.g.doubleclick.net",
        "pagead.googlesyndication.com",
        "video-ad-stats.googlesyndication.com",
        "firebaselogging-pa.googleapis.com",
        "app-analytics-services.com",
        "ads.pubmatic.com",
        "gads.pubmatic.com",
        "ads.inmobi.com",
        "api.vungle.com",
        "ads.api.vungle.com",
        "d.applovin.com",
        "rt.applovin.com",
        "ms.applovin.com",
        "prod-mediation-events.applovin.com",
        "outcome-ssp.supersonicads.com",
        "init.supersonicads.com",
        "logs.ironsrc.mobi",
        "ad.smaato.net",
        "c.amazon-adsystem.com",
        "aax-us-east.amazon-adsystem.com",
        "aax-eu.amazon-adsystem.com",
        "mads.amazon-adsystem.com",
        "ads-api.twitter.com",
        "ads.pinterest.com",
        "tr.snapchat.com",
        "sc-analytics.snapchat.com",
        "graph.instagram.com",
        "connect.facebook.net",
        "analytics.twitter.com",
        "adserver.adtech.de",
        "adservice.google.co.uk",
        "adservice.google.de",
        "adservice.google.ca",
        "adservice.google.com.ng",
        "crashlyticsreports-pa.googleapis.com"
    ]

    private let phishingTokens: [String] = [
        "verify-account", "login-update", "secure-billing", "wallet-connect",
        "free-nitro", "claim-prize", "appleid-support", "paypal-confirm",
        "account-suspended", "seed-phrase", "recovery-wallet", "signin-verify"
    ]
    private let phishingBrands: [String] = [
        "paypal", "apple", "google", "microsoft", "amazon", "bank",
        "chase", "coinbase", "binance", "metamask", "wallet", "login", "verify", "secure"
    ]
    private let cryptoMinerDomains: Set<String> = [
        "coinhive.com", "crypto-loot.com", "authedmine.com",
        "minero.cc", "webminepool.com", "jsecoin.com", "monerominer.rocks"
    ]

    private let adultKeywords: [String] = [
        "porn", "xxx", "xvideos", "pornhub", "redtube", "youporn",
        "chaturbate", "cam4", "onlyfans", "xhamster", "spankbang", "stripchat"
    ]

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        isStopping = false
        reloadConfigFromAppGroup()
        loadInitialStats()

        let server = LocalSocks5Server(provider: self)
        self.socksServer = server
        server.start { [weak self] boundPort in
            guard let self = self else {
                completionHandler(nil)
                return
            }
            guard let port = boundPort, port > 0 else {
                self.setProxyStatus("failed:socks_bind")
                let err = NSError(
                    domain: "com.fajostech.aegisguard.tunnel",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to start local SOCKS5 server"]
                )
                completionHandler(err)
                return
            }

            let networkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: self.tunnelRemoteAddress)
            networkSettings.mtu = NSNumber(value: 1500)

            let ipv4Settings = NEIPv4Settings(addresses: [self.tunnelAddress], subnetMasks: ["255.255.255.0"])
            ipv4Settings.includedRoutes = [NEIPv4Route.default()]
            ipv4Settings.excludedRoutes = [
                NEIPv4Route(destinationAddress: "127.0.0.0", subnetMask: "255.0.0.0"),
                NEIPv4Route(destinationAddress: "10.0.0.0", subnetMask: "255.0.0.0"),
                NEIPv4Route(destinationAddress: "172.16.0.0", subnetMask: "255.240.0.0"),
                NEIPv4Route(destinationAddress: "192.168.0.0", subnetMask: "255.255.0.0"),
                NEIPv4Route(destinationAddress: "169.254.0.0", subnetMask: "255.255.0.0"),
                NEIPv4Route(destinationAddress: "224.0.0.0", subnetMask: "240.0.0.0"),
                NEIPv4Route(destinationAddress: "255.255.255.255", subnetMask: "255.255.255.255")
            ]
            networkSettings.ipv4Settings = ipv4Settings

            let ipv6Settings = NEIPv6Settings(addresses: [self.tunnelAddress6], networkPrefixLengths: [64])
            ipv6Settings.includedRoutes = [NEIPv6Route.default()]
            ipv6Settings.excludedRoutes = [
                NEIPv6Route(destinationAddress: "::1", networkPrefixLength: 128),
                NEIPv6Route(destinationAddress: "fe80::", networkPrefixLength: 10),
                NEIPv6Route(destinationAddress: "ff00::", networkPrefixLength: 8)
            ]
            networkSettings.ipv6Settings = ipv6Settings

            let dnsSettings = NEDNSSettings(servers: [self.virtualDnsAddress, self.virtualDnsAddress6])
            dnsSettings.matchDomains = [""]
            dnsSettings.matchDomainsNoSearch = true
            networkSettings.dnsSettings = dnsSettings

            self.setTunnelNetworkSettings(networkSettings) { [weak self] error in
                if let error = error {
                    self?.socksServer?.stop()
                    self?.socksServer = nil
                    self?.setProxyStatus("failed:settings")
                    completionHandler(error)
                    return
                }
                guard let self = self else {
                    completionHandler(nil)
                    return
                }
                self.isTunnelActive = true
                self.setProxyStatus("full-tunnel:socks5:\\(port)")
                self.updateWidgetRunningState(true)
                self.startHevSocks5Tunnel(socksPort: port)
                completionHandler(nil)
            }
        }
    }

    private func startHevSocks5Tunnel(socksPort: UInt16) {
        let yamlConfig = """
        tunnel:
          mtu: 1500
        socks5:
          port: \\(socksPort)
          address: 127.0.0.1
          udp: 'tcp'
        misc:
          task-stack-size: 24576
          tcp-buffer-size: 8192
          max-session-count: 512
          connect-timeout: 5000
          tcp-read-write-timeout: 120000
          udp-read-write-timeout: 30000
          log-file: stderr
          log-level: error
          limit-nofile: 65535
        """

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            for attempt in 0..<20 {
                if self.isStopping || !self.isTunnelActive { return }
                let code = Socks5Tunnel.run(withConfig: .string(content: yamlConfig))
                if code != -1 || attempt == 19 {
                    if code != 0 && self.isTunnelActive && !self.isStopping {
                        self.setProxyStatus("tunnel-exit:\\(code)")
                    }
                    return
                }
                Thread.sleep(forTimeInterval: 0.05)
            }
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        isTunnelActive = false
        isStopping = true
        Socks5Tunnel.quit()
        socksServer?.stop()
        socksServer = nil
        setProxyStatus("stopped")
        flushStatsSynchronously()
        updateWidgetRunningState(false)
        completionHandler()
    }

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        if let msg = String(data: messageData, encoding: .utf8), msg == "reload" {
            reloadConfigFromAppGroup()
        } else if let msg = String(data: messageData, encoding: .utf8), msg == "clear_logs" {
            statsQueue.async {
                self.recentLogs = []
                self.totalQueries = 0
                self.blockedQueries = 0
                self.dataSavedBytes = 0
                self.flushStatsSynchronously()
            }
        }
        completionHandler?(Data("ok".utf8))
    }

    // MARK: - Config Sync from Shared App Group

    private func reloadConfigFromAppGroup() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }

        stateQueue.sync {
            if defaults.object(forKey: "aegis_is_premium") != nil {
                self.isPremium = defaults.bool(forKey: "aegis_is_premium")
            } else {
                self.isPremium = true
            }

            self.blockingMode = defaults.string(forKey: "aegis_blocking_mode") ?? "ADDRESS"
            self.safeSearchEnabled = defaults.bool(forKey: "aegis_safe_search")
            self.familyProtectionEnabled = defaults.bool(forKey: "aegis_family_protection")
            if defaults.object(forKey: "aegis_threat_alerts") != nil {
                self.threatAlertsEnabled = defaults.bool(forKey: "aegis_threat_alerts")
            } else {
                self.threatAlertsEnabled = true
            }

            let servers = defaults.stringArray(forKey: "aegis_selected_dns_servers") ?? []
            if !self.isPremium {
                self.upstreamDohUrl = "https://cloudflare-dns.com/dns-query"
                self.upstreamBootstrapIp = "1.1.1.1"
                self.upstreamProfileName = "Aegis Guard Basic Privacy"
            } else {
                let resolved = self.resolveUpstream(servers: servers, isFamily: self.familyProtectionEnabled)
                self.upstreamDohUrl = resolved.dohUrl
                self.upstreamBootstrapIp = resolved.bootstrapIp
                self.upstreamProfileName = resolved.description
            }

            let cats = defaults.stringArray(forKey: "aegis_category_domains") ?? []
            self.categoryDomains = Set(cats.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty })

            if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupId) {
                let domainsFile = containerURL.appendingPathComponent("aegis_downloaded_domains.txt")
                if let rawList = try? String(contentsOf: domainsFile, encoding: .utf8), !rawList.isEmpty {
                    var dlSet = Set<String>()
                    dlSet.reserveCapacity(min(13000, rawList.count / 16))
                    rawList.enumerateLines { line, stop in
                        let clean = line.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                        if !clean.isEmpty {
                            dlSet.insert(clean)
                            if dlSet.count >= 12000 {
                                stop = true
                            }
                        }
                    }
                    self.downloadedAdDomains = dlSet
                }
            }

            let excl = defaults.stringArray(forKey: "aegis_excluded_domains") ?? []
            self.excludedDomains = Set(excl.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty })

            self.scheduleEnabled = defaults.bool(forKey: "aegis_schedule_enabled")
            self.scheduleStartHour = defaults.object(forKey: "aegis_schedule_start_hour") as? Int ?? 21
            self.scheduleEndHour = defaults.object(forKey: "aegis_schedule_end_hour") as? Int ?? 7
            let schedDoms = defaults.stringArray(forKey: "aegis_schedule_domains") ?? []
            self.scheduledDomains = Set(schedDoms.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty })

            let rawRules = defaults.string(forKey: "aegis_user_rules") ?? ""
            var parsedAllow = Set<String>()
            var parsedBlock = Set<String>()
            var parsedRewrite = [String: String]()

            for rawLine in rawRules.components(separatedBy: .newlines) {
                let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
                if line.isEmpty || line.hasPrefix("!") || line.hasPrefix("#") { continue }

                if line.hasPrefix("@@||") {
                    let clean = self.stripRuleModifiers(String(line.dropFirst(4)))
                    if !clean.isEmpty { parsedAllow.insert(clean) }
                } else if line.hasPrefix("||") {
                    if let rewriteRange = line.range(of: "$dnsrewrite=") {
                        let ip = String(line[rewriteRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                        let clean = self.stripRuleModifiers(String(line[line.index(line.startIndex, offsetBy: 2)..<rewriteRange.lowerBound]))
                        if !clean.isEmpty && !ip.isEmpty {
                            parsedRewrite[clean] = ip
                        }
                    } else {
                        let clean = self.stripRuleModifiers(String(line.dropFirst(2)))
                        if !clean.isEmpty { parsedBlock.insert(clean) }
                    }
                } else {
                    let clean = line.lowercased()
                    if !clean.contains(" ") && clean.contains(".") {
                        parsedBlock.insert(clean)
                    }
                }
            }

            self.allowRules = parsedAllow
            self.blockRules = parsedBlock
            self.rewriteRules = parsedRewrite
        }
        dnsCacheLock.lock()
        self.dnsCache.removeAll()
        dnsCacheLock.unlock()
    }

    private func stripRuleModifiers(_ raw: String) -> String {
        var s = raw.lowercased()
        if let idx = s.firstIndex(of: "^") { s = String(s[..<idx]) }
        if let idx = s.firstIndex(of: "$") { s = String(s[..<idx]) }
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func resolveUpstream(servers: [String], isFamily: Bool) -> (dohUrl: String, bootstrapIp: String, description: String) {
        if let primary = servers.first, !primary.isEmpty {
            if primary == "94.140.14.15" || primary == "94.140.15.16" {
                return ("https://dns-family.adguard-dns.com/dns-query", "94.140.14.15", "Aegis Guard Family Shield")
            } else if primary == "1.1.1.1" || primary == "1.0.0.1" {
                return ("https://cloudflare-dns.com/dns-query", "1.1.1.1", "Aegis Guard - Cloudflare DNS")
            } else if primary == "1.1.1.3" || primary == "1.0.0.3" {
                return ("https://family.cloudflare-dns.com/dns-query", "1.1.1.3", "Aegis Guard - Cloudflare Family")
            } else if primary == "8.8.8.8" || primary == "8.8.4.4" {
                return ("https://dns.google/dns-query", "8.8.8.8", "Aegis Guard - Google DNS")
            } else if primary == "9.9.9.9" || primary == "149.112.112.112" {
                return ("https://dns.quad9.net/dns-query", "9.9.9.9", "Aegis Guard - Quad9 DNS")
            } else if primary == "94.140.14.14" || primary == "94.140.15.15" {
                return ("https://dns.adguard-dns.com/dns-query", "94.140.14.14", "Aegis Guard DNS (Default)")
            } else {
                let doh = primary.hasPrefix("https://") ? primary : "https://\\(primary)/dns-query"
                let ipOnly = servers.first { !$0.contains("://") && !$0.contains("/") && $0.contains(".") }
                let lower = doh.lowercased()
                if lower.contains("nextdns.io") {
                    return (doh, ipOnly ?? "45.90.28.0", "Aegis Guard - NextDNS")
                } else if lower.contains("controld.com") {
                    return (doh, ipOnly ?? "76.76.2.0", "Aegis Guard - Control D")
                }
                return (doh, ipOnly ?? "94.140.14.14", "Aegis Guard - Private DNS")
            }
        }
        if isFamily {
            return ("https://dns-family.adguard-dns.com/dns-query", "94.140.14.15", "Aegis Guard Family Shield")
        }
        return ("https://dns.adguard-dns.com/dns-query", "94.140.14.14", "Aegis Guard DNS (Default)")
    }

    // MARK: - DNS Interception & Bypass-Safe Parameters

    func makeBypassParameters(tcp: Bool, tls: Bool = false) -> Network.NWParameters {
        let params: Network.NWParameters
        if tcp {
            if tls {
                params = Network.NWParameters.tls
            } else {
                params = Network.NWParameters.tcp
            }
            if let tcpOpts = params.defaultProtocolStack.transportProtocol as? Network.NWProtocolTCP.Options {
                tcpOpts.enableKeepalive = true
                tcpOpts.noDelay = true
            }
        } else {
            params = Network.NWParameters.udp
        }
        params.prohibitedInterfaceTypes = [.other, .loopback]
        params.preferNoProxies = true
        return params
    }

    func processDnsQuery(dnsQuery: Data, writeReply: @escaping (Data) -> Void) {
        guard let parsed = parseDnsQuestion(dnsQuery) else {
            writeReply(buildServFailResponse(query: dnsQuery))
            return
        }
        let startTime = CFAbsoluteTimeGetCurrent()
        let qname = parsed.qname.lowercased()
        let qtype = parsed.qtype
        let qtypeStr = qtype == 28 ? "AAAA" : (qtype == 65 ? "HTTPS" : (qtype == 64 ? "SVCB" : "A"))

        // Block DDR (_dns.resolver.arpa) & browser DoH canary (use-application-dns.net) so iOS/browsers don't bypass the tunnel
        if qname == "_dns.resolver.arpa" || qname.hasSuffix("._dns.resolver.arpa") {
            let nodata = buildBlockedDnsResponse(query: dnsQuery, qtype: qtype, mode: "NODATA", rewriteIp: nil)
            writeReply(nodata)
            return
        }
        if qname == "use-application-dns.net" || qname.hasSuffix(".use-application-dns.net") {
            let nx = buildBlockedDnsResponse(query: dnsQuery, qtype: qtype, mode: "NXDOMAIN", rewriteIp: nil)
            writeReply(nx)
            return
        }

        // Fast bootstrap for upstream DoH hostnames over physical interface
        let dohHost = URL(string: stateQueue.sync { upstreamDohUrl })?.host?.lowercased() ?? ""
        if !dohHost.isEmpty && (qname == dohHost || qname.hasSuffix("." + dohHost)) {
            if let cachedIp = knownDohBootstrapIp(for: qname) {
                let dnsResp = buildBlockedDnsResponse(query: dnsQuery, qtype: qtype, mode: qtype == 1 ? "REWRITE" : "NODATA", rewriteIp: qtype == 1 ? cachedIp : nil)
                writeReply(dnsResp)
                return
            }
            let bootIp = stateQueue.sync { upstreamBootstrapIp }
            forwardViaDirectUdp(dnsQuery: dnsQuery, upstreamIp: bootIp) { [weak self] responseData, _ in
                if let resp = responseData {
                    writeReply(resp)
                } else if let self = self {
                    writeReply(self.buildServFailResponse(query: dnsQuery))
                }
            }
            return
        }

        let decision = evaluateDomain(qname, qtype: qtype)
        if decision.isBlocked {
            let latency = max(1, Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000))
            let dnsResp = buildBlockedDnsResponse(
                query: dnsQuery,
                qtype: qtype,
                mode: decision.rewriteIp != nil ? "REWRITE" : decision.blockingMode,
                rewriteIp: decision.rewriteIp
            )
            writeReply(dnsResp)
            if decision.isThreatAlert {
                postThreatNotification(domain: qname, rule: decision.rule ?? "Phishing Shield")
            }
            recordQuery(domain: qname, qtype: qtypeStr, isBlocked: decision.countsAsBlock, rule: decision.rule, durationMs: latency, upstream: "Aegis Local Tunnel")
            return
        }

        let snapshot = stateQueue.sync { (upstreamDohUrl, upstreamBootstrapIp, upstreamProfileName) }
        let cacheKey = "\\(qname)|\\(qtype)"
        let now = CFAbsoluteTimeGetCurrent()

        dnsCacheLock.lock()
        let cachedEntry = dnsCache[cacheKey]
        dnsCacheLock.unlock()

        if let entry = cachedEntry, now < entry.expiresAt, entry.data.count >= 12 {
            var patched = [UInt8](entry.data)
            let qBytes = [UInt8](dnsQuery)
            if qBytes.count >= 2 {
                patched[0] = qBytes[0]
                patched[1] = qBytes[1]
            }
            writeReply(Data(patched))
            recordQuery(
                domain: qname,
                qtype: qtypeStr,
                isBlocked: entry.upstreamBlocked,
                rule: entry.upstreamBlocked ? "Upstream \\(entry.transport) Block" : nil,
                durationMs: 1,
                upstream: "\\(snapshot.2) [\\(entry.transport)/Cache]"
            )
            return
        }

        // Allowed locally -> forward over Direct-IP DoH / DoT / UDP fallback (bound off utun)
        forwardViaDoh(dnsQuery: dnsQuery, dohUrl: snapshot.0, bootstrapIp: snapshot.1) { [weak self] responseData, transport in
            guard let self = self else { return }
            let latency = max(1, Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000))
            guard let resp = responseData else {
                writeReply(self.buildServFailResponse(query: dnsQuery))
                return
            }

            let upstreamBlocked = self.didUpstreamBlock(resp)
            let ttl = self.extractDnsMinTtl(resp)
            if ttl > 0 {
                self.dnsCacheLock.lock()
                if self.dnsCache.count >= 1024 {
                    self.dnsCache.removeAll()
                }
                self.dnsCache[cacheKey] = (
                    data: Data(resp),
                    expiresAt: CFAbsoluteTimeGetCurrent() + ttl,
                    upstreamBlocked: upstreamBlocked,
                    transport: transport
                )
                self.dnsCacheLock.unlock()
            }

            writeReply(resp)
            self.recordQuery(
                domain: qname,
                qtype: qtypeStr,
                isBlocked: upstreamBlocked,
                rule: upstreamBlocked ? "Upstream \\(transport) Block" : nil,
                durationMs: latency,
                upstream: "\\(snapshot.2) [\\(transport)]"
            )
        }
    }

    private func knownDohBootstrapIp(for host: String) -> String? {
        if host == "dns.adguard-dns.com" { return "94.140.14.14" }
        if host == "dns-family.adguard-dns.com" { return "94.140.14.15" }
        if host == "cloudflare-dns.com" { return "1.1.1.1" }
        if host == "family.cloudflare-dns.com" { return "1.1.1.3" }
        if host == "dns.google" { return "8.8.8.8" }
        if host == "dns.quad9.net" { return "9.9.9.9" }
        if host.hasSuffix("dns.nextdns.io") { return "45.90.28.0" }
        if host == "freedns.controld.com" || host.hasSuffix(".controld.com") { return "76.76.2.0" }
        return nil
    }

    // MARK: - Domain Filter Evaluation

    private struct EvalDecision {
        let isBlocked: Bool
        let countsAsBlock: Bool
        let blockingMode: String
        let rewriteIp: String?
        let rule: String?
        let isThreatAlert: Bool

        init(isBlocked: Bool, countsAsBlock: Bool, blockingMode: String, rewriteIp: String?, rule: String?, isThreatAlert: Bool = false) {
            self.isBlocked = isBlocked
            self.countsAsBlock = countsAsBlock
            self.blockingMode = blockingMode
            self.rewriteIp = rewriteIp
            self.rule = rule
            self.isThreatAlert = isThreatAlert
        }
    }

    private func checkPhishingThreat(_ domain: String) -> String? {
        if domain.contains("xn--") && phishingBrands.contains(where: { domain.contains($0) }) {
            return "||\\(domain)^$phishing-homograph"
        }
        if phishingTokens.contains(where: { domain.contains($0) }) {
            return "||\\(domain)^$phishing-shield"
        }
        if matchesDomainSet(domain, set: cryptoMinerDomains) != nil {
            return "||\\(domain)^$cryptominer-threat"
        }
        return nil
    }

    private func postThreatNotification(domain: String, rule: String) {
        let shouldPost = stateQueue.sync { () -> Bool in
            guard threatAlertsEnabled else { return false }
            let now = Date().timeIntervalSince1970
            if let last = threatCooldown[domain], (now - last) < 600 {
                return false
            }
            threatCooldown[domain] = now
            return true
        }
        guard shouldPost else { return }

        let content = UNMutableNotificationContent()
        content.title = "Phishing / Threat Blocked"
        content.body = "AegisGuard blocked dangerous domain: \\(domain)"
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.2, repeats: false)
        let req = UNNotificationRequest(identifier: "aegis-threat-\\(domain)", content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    private func isScheduleActiveNow() -> Bool {
        guard scheduleEnabled else { return false }
        let hour = Calendar.current.component(.hour, from: Date())
        if scheduleStartHour == scheduleEndHour { return true }
        if scheduleStartHour < scheduleEndHour {
            return hour >= scheduleStartHour && hour < scheduleEndHour
        }
        return hour >= scheduleStartHour || hour < scheduleEndHour
    }

    private func matchesDomainSet(_ domain: String, set: Set<String>) -> String? {
        if set.contains(domain) { return domain }
        var remaining = domain
        while let dotIdx = remaining.firstIndex(of: ".") {
            let parent = String(remaining[remaining.index(after: dotIdx)...])
            if set.contains(parent) {
                return parent
            }
            remaining = parent
        }
        return nil
    }

    private func evaluateDomain(_ domain: String, qtype: UInt16) -> EvalDecision {
        return stateQueue.sync {
            // Basic Mode (Trial Expired & Not Purchased): all Pro filters & Family controls disabled
            if !isPremium {
                return EvalDecision(isBlocked: false, countsAsBlock: false, blockingMode: blockingMode, rewriteIp: nil, rule: nil)
            }

            // 1. SafeSearch enforcement (Pro)
            if safeSearchEnabled || familyProtectionEnabled {
                if domain.contains("google.") && (domain == "google.com" || domain.hasPrefix("www.google.")) {
                    return EvalDecision(isBlocked: true, countsAsBlock: false, blockingMode: "REWRITE", rewriteIp: "216.239.38.120", rule: "||google.com^$safesearch")
                }
                if domain == "youtube.com" || domain == "www.youtube.com" || domain == "m.youtube.com" {
                    return EvalDecision(isBlocked: true, countsAsBlock: false, blockingMode: "REWRITE", rewriteIp: "216.239.38.120", rule: "||youtube.com^$safesearch")
                }
                if domain == "bing.com" || domain == "www.bing.com" {
                    return EvalDecision(isBlocked: true, countsAsBlock: false, blockingMode: "REWRITE", rewriteIp: "204.79.197.220", rule: "||bing.com^$safesearch")
                }
                if domain == "duckduckgo.com" || domain == "www.duckduckgo.com" {
                    return EvalDecision(isBlocked: true, countsAsBlock: false, blockingMode: "REWRITE", rewriteIp: "52.142.124.215", rule: "||duckduckgo.com^$safesearch")
                }
            }

            // 2. Explicit User Whitelist (@@||domain^)
            if let allowed = matchesDomainSet(domain, set: allowRules) {
                return EvalDecision(isBlocked: false, countsAsBlock: false, blockingMode: blockingMode, rewriteIp: nil, rule: "@@||\\(allowed)^")
            }

            // 3. Explicit DNS Rewrites
            if let rewriteHit = rewriteRules[domain] {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: "REWRITE", rewriteIp: rewriteHit, rule: "||\\(domain)^$dnsrewrite=\\(rewriteHit)")
            }

            // 4. Explicit User Block Rules (||domain^)
            if let userBlocked = matchesDomainSet(domain, set: blockRules) {
                let isThreat = checkPhishingThreat(domain) != nil
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: "||\\(userBlocked)^$user-rule", isThreatAlert: isThreat)
            }

            // 4b. On-Device Phishing / Homograph / Cryptomining Shield
            if let threatRule = checkPhishingThreat(domain) {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: threatRule, isThreatAlert: true)
            }

            // 5. Category Blockers + Active Bedtime Schedule (always enforced when enabled)
            if let catMatch = matchesDomainSet(domain, set: categoryDomains) {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: "||\\(catMatch)^$category")
            }
            if isScheduleActiveNow(), let schedMatch = matchesDomainSet(domain, set: scheduledDomains) {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: "||\\(schedMatch)^$bedtime-schedule")
            }

            // 6. Family Shield explicit keyword check
            if familyProtectionEnabled && adultKeywords.contains(where: { domain.contains($0) }) {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: "||\\(domain)^$family-shield")
            }

            // 7. Excluded Game / App domains
            if matchesDomainSet(domain, set: excludedDomains) != nil {
                return EvalDecision(isBlocked: false, countsAsBlock: false, blockingMode: blockingMode, rewriteIp: nil, rule: nil)
            }

            // 8. Built-in Ad & Tracker Domains + Synced AdGuard Filter Lists
            if let adMatch = matchesDomainSet(domain, set: builtInAdDomains) {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: "||\\(adMatch)^$important")
            }
            if !downloadedAdDomains.isEmpty, let dlMatch = matchesDomainSet(domain, set: downloadedAdDomains) {
                return EvalDecision(isBlocked: true, countsAsBlock: true, blockingMode: blockingMode, rewriteIp: nil, rule: "||\\(dlMatch)^$adguard-filter")
            }

            return EvalDecision(isBlocked: false, countsAsBlock: false, blockingMode: blockingMode, rewriteIp: nil, rule: nil)
        }
    }

    // MARK: - DNS Wire Parsing & Response Synthesis

    private func parseDnsQuestion(_ data: Data) -> (qname: String, qtype: UInt16)? {
        let bytes = [UInt8](data)
        guard bytes.count >= 17 else { return nil }
        let qdCount = (UInt16(bytes[4]) << 8) | UInt16(bytes[5])
        guard qdCount >= 1 else { return nil }

        var idx = 12
        var labels: [String] = []
        while idx < bytes.count {
            let len = Int(bytes[idx])
            idx += 1
            if len == 0 { break }
            if (len & 0xC0) != 0 || idx + len > bytes.count || len > 63 {
                return nil
            }
            if let part = String(bytes: bytes[idx..<(idx + len)], encoding: .utf8) {
                labels.append(part)
            }
            idx += len
        }
        guard !labels.isEmpty, idx + 4 <= bytes.count else { return nil }
        let qtype = (UInt16(bytes[idx]) << 8) | UInt16(bytes[idx + 1])
        return (labels.joined(separator: "."), qtype)
    }

    private func buildBlockedDnsResponse(query: Data, qtype: UInt16, mode: String, rewriteIp: String?) -> Data {
        let qBytes = [UInt8](query)
        // Find end of Question section
        var idx = 12
        while idx < qBytes.count {
            let len = Int(qBytes[idx])
            idx += 1
            if len == 0 { break }
            idx += len
        }
        let questionEnd = min(idx + 4, qBytes.count)

        var resp = [UInt8]()
        // Transaction ID
        resp.append(qBytes[0])
        resp.append(qBytes[1])

        // Header Flags: QR=1, AA=0, TC=0, RD=QueryRD, RA=1
        let rdBit: UInt8 = (qBytes[2] & 0x01)
        resp.append(0x80 | rdBit)

        let upperMode = mode.uppercased()
        if upperMode == "NXDOMAIN" {
            resp.append(0x83) // RCODE = 3 (NXDOMAIN)
            resp.append(contentsOf: [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            resp.append(contentsOf: qBytes[12..<questionEnd])
            return Data(resp)
        } else if upperMode == "REFUSED" {
            resp.append(0x85) // RCODE = 5 (REFUSED)
            resp.append(contentsOf: [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            resp.append(contentsOf: qBytes[12..<questionEnd])
            return Data(resp)
        }

        // ADDRESS / REWRITE mode
        if qtype == 1 {
            let ipParts = (rewriteIp ?? "0.0.0.0").split(separator: ".").compactMap { UInt8($0) }
            let aBytes: [UInt8] = ipParts.count == 4 ? ipParts : [0, 0, 0, 0]
            resp.append(0x80) // NOERROR
            resp.append(contentsOf: [0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])
            resp.append(contentsOf: qBytes[12..<questionEnd])
            // Answer pointer 0xC00C, TYPE A, CLASS IN, TTL 300s, RDLENGTH 4
            resp.append(contentsOf: [0xC0, 0x0C, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x01, 0x2C, 0x00, 0x04])
            resp.append(contentsOf: aBytes)
            return Data(resp)
        } else if qtype == 28 && rewriteIp == nil && upperMode != "NODATA" {
            resp.append(0x80) // NOERROR
            resp.append(contentsOf: [0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])
            resp.append(contentsOf: qBytes[12..<questionEnd])
            // Answer pointer 0xC00C, TYPE AAAA, CLASS IN, TTL 300s, RDLENGTH 16 (::)
            resp.append(contentsOf: [0xC0, 0x0C, 0x00, 0x1C, 0x00, 0x01, 0x00, 0x00, 0x01, 0x2C, 0x00, 0x10])
            resp.append(contentsOf: [UInt8](repeating: 0, count: 16))
            return Data(resp)
        } else {
            // NODATA for HTTPS/SVCB or unsupported record types so client falls back cleanly
            resp.append(0x80)
            resp.append(contentsOf: [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            resp.append(contentsOf: qBytes[12..<questionEnd])
            return Data(resp)
        }
    }

    private func skipDnsName(in bytes: [UInt8], from offset: Int) -> Int? {
        var idx = offset
        var steps = 0
        while idx < bytes.count && steps < 128 {
            steps += 1
            let len = bytes[idx]
            if len == 0 {
                return idx + 1
            }
            if (len & 0xC0) == 0xC0 {
                return idx + 2 <= bytes.count ? idx + 2 : nil
            }
            idx += 1 + Int(len)
        }
        return nil
    }

    private func didUpstreamBlock(_ dnsResp: Data) -> Bool {
        let bytes = [UInt8](dnsResp)
        guard bytes.count >= 12 else { return false }
        let rcode = bytes[3] & 0x0F
        if rcode == 3 || rcode == 5 { return true }

        let qdCount = Int((UInt16(bytes[4]) << 8) | UInt16(bytes[5]))
        let anCount = Int((UInt16(bytes[6]) << 8) | UInt16(bytes[7]))
        guard anCount > 0 else { return false }

        var idx = 12
        for _ in 0..<qdCount {
            guard let nextIdx = skipDnsName(in: bytes, from: idx), nextIdx + 4 <= bytes.count else {
                return false
            }
            idx = nextIdx + 4
        }

        for _ in 0..<anCount {
            guard let afterName = skipDnsName(in: bytes, from: idx), afterName + 10 <= bytes.count else {
                break
            }
            let rrType = (UInt16(bytes[afterName]) << 8) | UInt16(bytes[afterName + 1])
            let rdLen = Int((UInt16(bytes[afterName + 8]) << 8) | UInt16(bytes[afterName + 9]))
            let rdataStart = afterName + 10
            guard rdataStart + rdLen <= bytes.count else { break }

            // Check A = 0.0.0.0, 127.0.0.1, or 94.140.14.35 (AdGuard Family block), AAAA = :: (all zeros)
            if rrType == 1 && rdLen == 4 {
                if (bytes[rdataStart] == 0 && bytes[rdataStart + 1] == 0 && bytes[rdataStart + 2] == 0 && bytes[rdataStart + 3] == 0) ||
                   (bytes[rdataStart] == 127 && bytes[rdataStart + 1] == 0 && bytes[rdataStart + 2] == 0 && bytes[rdataStart + 3] == 1) ||
                   (bytes[rdataStart] == 94 && bytes[rdataStart + 1] == 140 && bytes[rdataStart + 2] == 14 && bytes[rdataStart + 3] == 35) {
                    return true
                }
            } else if rrType == 28 && rdLen == 16 {
                if bytes[rdataStart..<(rdataStart + 16)].allSatisfy({ $0 == 0 }) {
                    return true
                }
            }
            idx = rdataStart + rdLen
        }
        return false
    }

    // MARK: - Direct-IP DoH, Encrypted DoT (853), UDP Fallback & DNS Cache

    private func buildServFailResponse(query: Data) -> Data {
        let qBytes = [UInt8](query)
        guard qBytes.count >= 12 else { return Data() }
        var idx = 12
        while idx < qBytes.count {
            let len = Int(qBytes[idx])
            idx += 1
            if len == 0 { break }
            if (len & 0xC0) != 0 {
                idx += 1
                break
            }
            idx += len
        }
        let questionEnd = min(idx + 4, qBytes.count)
        let hasQuestion = questionEnd > 12 && questionEnd <= qBytes.count
        var resp: [UInt8] = [
            qBytes[0], qBytes[1],
            0x80 | (qBytes[2] & 0x01),
            0x82, // SERVFAIL
            0x00, hasQuestion ? 0x01 : 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]
        if hasQuestion {
            resp.append(contentsOf: qBytes[12..<questionEnd])
        }
        return Data(resp)
    }

    private func extractDnsMinTtl(_ dnsResp: Data) -> TimeInterval {
        let bytes = [UInt8](dnsResp)
        guard bytes.count >= 12 else { return 0 }
        let rcode = bytes[3] & 0x0F
        if rcode == 3 { return 30.0 } // Brief negative cache for NXDOMAIN
        guard rcode == 0 else { return 0 }

        let qdCount = Int((UInt16(bytes[4]) << 8) | UInt16(bytes[5]))
        let anCount = Int((UInt16(bytes[6]) << 8) | UInt16(bytes[7]))
        guard anCount > 0 else { return 30.0 } // Brief cache for NODATA/empty answer

        var idx = 12
        for _ in 0..<qdCount {
            guard let nextIdx = skipDnsName(in: bytes, from: idx), nextIdx + 4 <= bytes.count else {
                return 60.0
            }
            idx = nextIdx + 4
        }

        var minTtl: UInt32 = 300
        var found = false
        for _ in 0..<anCount {
            guard let afterName = skipDnsName(in: bytes, from: idx), afterName + 10 <= bytes.count else {
                break
            }
            let ttl = (UInt32(bytes[afterName + 4]) << 24)
                | (UInt32(bytes[afterName + 5]) << 16)
                | (UInt32(bytes[afterName + 6]) << 8)
                | UInt32(bytes[afterName + 7])
            let rdLen = Int((UInt16(bytes[afterName + 8]) << 8) | UInt16(bytes[afterName + 9]))
            let rdataStart = afterName + 10
            guard rdataStart + rdLen <= bytes.count else { break }
            if ttl < minTtl {
                minTtl = ttl
            }
            found = true
            idx = rdataStart + rdLen
        }
        guard found else { return 60.0 }
        return min(300.0, max(15.0, Double(minTtl)))
    }

    private func supportsDirectIpDoh(_ bootstrapIp: String, dohUrl: String) -> String? {
        let lower = dohUrl.lowercased()
        let directIps: Set<String> = ["94.140.14.14", "94.140.14.15", "1.1.1.1", "1.1.1.3", "8.8.8.8"]
        if directIps.contains(bootstrapIp) && (lower.contains("dns.adguard-dns.com") || lower.contains("dns-family.adguard-dns.com") || lower.contains("cloudflare-dns.com") || lower.contains("dns.google")) {
            return "https://\\(bootstrapIp)/dns-query"
        }
        return nil
    }

    private func decodeChunkedHttpBody(_ raw: Data) -> (body: Data, isFinished: Bool)? {
        let bytes = [UInt8](raw)
        var offset = 0
        var decoded = Data()
        while offset < bytes.count {
            var lineEnd: Int? = nil
            var i = offset
            while i + 1 < bytes.count {
                if bytes[i] == 13 && bytes[i + 1] == 10 {
                    lineEnd = i
                    break
                }
                i += 1
            }
            guard let crlf = lineEnd else {
                return (decoded, false)
            }
            let sizeStr = String(bytes: bytes[offset..<crlf], encoding: .ascii)?
                .split(separator: ";").first?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard let chunkSize = Int(sizeStr, radix: 16), chunkSize >= 0 else {
                return nil
            }
            offset = crlf + 2
            if chunkSize == 0 {
                return (decoded, true)
            }
            guard offset + chunkSize + 2 <= bytes.count else {
                return (decoded, false)
            }
            decoded.append(contentsOf: bytes[offset..<(offset + chunkSize)])
            offset += chunkSize + 2
        }
        return (decoded, false)
    }

    private func parseHttpDohResponse(accumulated: Data, isComplete: Bool) -> (done: Bool, dnsBody: Data?) {
        let sep = Data([13, 10, 13, 10])
        guard let sepRange = accumulated.range(of: sep) else {
            return isComplete ? (true, nil) : (false, nil)
        }
        let headerBytes = Data(accumulated[..<sepRange.lowerBound])
        let bodyData = Data(accumulated[sepRange.upperBound...])
        guard let headerText = String(data: headerBytes, encoding: .utf8) ?? String(data: headerBytes, encoding: .ascii) else {
            return (true, nil)
        }
        let lines = headerText.components(separatedBy: "\\r\\n")
        guard let statusLine = lines.first else { return (true, nil) }
        let statusParts = statusLine.split(separator: " ", omittingEmptySubsequences: true)
        guard statusParts.count >= 2, let code = Int(statusParts[1]), (200...299).contains(code) else {
            return (true, nil)
        }

        var contentLength: Int? = nil
        var isChunked = false
        for line in lines.dropFirst() {
            let low = line.lowercased()
            if low.hasPrefix("content-length:") {
                let val = line.dropFirst(15).trimmingCharacters(in: .whitespacesAndNewlines)
                contentLength = Int(val)
            } else if low.hasPrefix("transfer-encoding:") && low.contains("chunked") {
                isChunked = true
            }
        }

        if let expectedLen = contentLength {
            if bodyData.count >= expectedLen {
                let clipped = Data(bodyData.prefix(expectedLen))
                return (true, clipped.count >= 12 ? clipped : nil)
            }
            return isComplete ? (true, nil) : (false, nil)
        }
        if isChunked {
            if let chunked = decodeChunkedHttpBody(bodyData) {
                if chunked.isFinished {
                    return (true, chunked.body.count >= 12 ? chunked.body : nil)
                }
                return isComplete ? (true, chunked.body.count >= 12 ? chunked.body : nil) : (false, nil)
            }
            return (true, nil)
        }
        if isComplete {
            return (true, bodyData.count >= 12 ? bodyData : nil)
        }
        return (false, nil)
    }

    private func forwardViaDoh(dnsQuery: Data, dohUrl: String, bootstrapIp: String, completion: @escaping (Data?, String) -> Void) {
        let sniHost = URL(string: dohUrl)?.host ?? "dns.adguard-dns.com"
        let effectiveUrlStr = supportsDirectIpDoh(bootstrapIp, dohUrl: dohUrl) ?? dohUrl
        guard let comps = URLComponents(string: effectiveUrlStr),
              let connectHost = comps.host, !connectHost.isEmpty,
              let dohPort = Network.NWEndpoint.Port(rawValue: UInt16(comps.port ?? 443)) else {
            forwardViaDot(dnsQuery: dnsQuery, upstreamIp: bootstrapIp, sniHost: sniHost, completion: completion)
            return
        }

        let path = comps.percentEncodedPath.isEmpty ? "/dns-query" : comps.percentEncodedPath
        let queryPart = comps.percentEncodedQuery.map { "?\\($0)" } ?? ""
        let reqTarget = "\\(path)\\(queryPart)"

        let tlsOpts = Network.NWProtocolTLS.Options()
        sec_protocol_options_set_tls_server_name(tlsOpts.securityProtocolOptions, sniHost)
        sec_protocol_options_add_tls_application_protocol(tlsOpts.securityProtocolOptions, "http/1.1")
        let tcpOpts = Network.NWProtocolTCP.Options()
        tcpOpts.noDelay = true
        let params = Network.NWParameters(tls: tlsOpts, tcp: tcpOpts)
        params.prohibitedInterfaceTypes = [.other, .loopback]
        params.preferNoProxies = true

        let conn = Network.NWConnection(host: Network.NWEndpoint.Host(connectHost), port: dohPort, using: params)
        let queue = DispatchQueue(label: "com.fajostech.aegisguard.doh")
        var finished = false
        var accumulated = Data()

        func finish(_ result: Data?) {
            guard !finished else { return }
            finished = true
            conn.cancel()
            if let data = result, data.count >= 12 {
                completion(data, "DoH")
            } else {
                self.forwardViaDot(dnsQuery: dnsQuery, upstreamIp: bootstrapIp, sniHost: sniHost, completion: completion)
            }
        }

        func readHttpChunks() {
            conn.receive(minimumIncompleteLength: 1, maximumLength: 16384) { (chunk: Data?, _ctx: Network.NWConnection.ContentContext?, isComplete: Bool, recvErr: Network.NWError?) in
                guard !finished else { return }
                if let chunk = chunk, !chunk.isEmpty {
                    accumulated.append(chunk)
                    if accumulated.count > 65536 {
                        finish(nil)
                        return
                    }
                }
                let parsed = self.parseHttpDohResponse(accumulated: accumulated, isComplete: isComplete || recvErr != nil)
                if parsed.done {
                    finish(parsed.dnsBody)
                } else {
                    readHttpChunks()
                }
            }
        }

        queue.asyncAfter(deadline: .now() + 2.5) {
            finish(nil)
        }

        conn.stateUpdateHandler = { (state: Network.NWConnection.State) in
            guard !finished else { return }
            switch state {
            case .ready:
                let hdr = "POST \\(reqTarget) HTTP/1.1\\r\\nHost: \\(sniHost)\\r\\nUser-Agent: AegisGuard/1.0\\r\\nContent-Type: application/dns-message\\r\\nAccept: application/dns-message\\r\\nContent-Length: \\(dnsQuery.count)\\r\\nConnection: close\\r\\n\\r\\n"
                var payload = Data(hdr.utf8)
                payload.append(dnsQuery)
                conn.send(content: payload, completion: .contentProcessed { (sendErr: Network.NWError?) in
                    if sendErr != nil {
                        finish(nil)
                        return
                    }
                    readHttpChunks()
                })
            case .failed(_), .cancelled:
                finish(nil)
            default:
                break
            }
        }
        conn.start(queue: queue)
    }

    private func forwardViaDot(dnsQuery: Data, upstreamIp: String, sniHost: String, completion: @escaping (Data?, String) -> Void) {
        let tlsOpts = Network.NWProtocolTLS.Options()
        sec_protocol_options_set_tls_server_name(tlsOpts.securityProtocolOptions, sniHost)
        let tcpOpts = Network.NWProtocolTCP.Options()
        tcpOpts.noDelay = true
        let params = Network.NWParameters(tls: tlsOpts, tcp: tcpOpts)
        params.prohibitedInterfaceTypes = [.other, .loopback]
        params.preferNoProxies = true

        let dotPort = Network.NWEndpoint.Port(rawValue: 853)!
        let conn = Network.NWConnection(host: Network.NWEndpoint.Host(upstreamIp), port: dotPort, using: params)
        let queue = DispatchQueue(label: "com.fajostech.aegisguard.dot")
        var finished = false

        func finish(_ result: Data?) {
            guard !finished else { return }
            finished = true
            conn.cancel()
            if let data = result, data.count >= 12 {
                completion(data, "DoT")
            } else {
                self.forwardViaDirectUdp(dnsQuery: dnsQuery, upstreamIp: upstreamIp, completion: completion)
            }
        }

        queue.asyncAfter(deadline: .now() + 2.5) {
            finish(nil)
        }

        conn.stateUpdateHandler = { (state: Network.NWConnection.State) in
            guard !finished else { return }
            switch state {
            case .ready:
                let len = UInt16(dnsQuery.count)
                var framed = Data([UInt8(len >> 8), UInt8(len & 0xFF)])
                framed.append(dnsQuery)
                conn.send(content: framed, completion: .contentProcessed { (sendErr: Network.NWError?) in
                    if sendErr != nil {
                        finish(nil)
                        return
                    }
                    conn.receive(minimumIncompleteLength: 2, maximumLength: 2) { (lenData: Data?, _ctx: Network.NWConnection.ContentContext?, _isComplete: Bool, recvErr: Network.NWError?) in
                        guard recvErr == nil, let lenData = lenData, lenData.count == 2 else {
                            finish(nil)
                            return
                        }
                        let lenBytes = [UInt8](lenData)
                        let msgLen = (Int(lenBytes[0]) << 8) | Int(lenBytes[1])
                        guard msgLen >= 12 && msgLen <= 4096 else {
                            finish(nil)
                            return
                        }
                        conn.receive(minimumIncompleteLength: msgLen, maximumLength: msgLen) { (body: Data?, _ctx2: Network.NWConnection.ContentContext?, _isComplete2: Bool, bodyErr: Network.NWError?) in
                            if bodyErr == nil, let body = body, body.count >= 12 {
                                finish(body)
                            } else {
                                finish(nil)
                            }
                        }
                    }
                })
            case .failed(_), .cancelled:
                finish(nil)
            default:
                break
            }
        }
        conn.start(queue: queue)
    }

    func setProxyStatus(_ status: String) {
        if let defaults = UserDefaults(suiteName: appGroupId) {
            defaults.set(status, forKey: "aegis_proxy_status")
            defaults.synchronize()
        }
    }

    private func forwardViaDirectUdp(dnsQuery: Data, upstreamIp: String, completion: @escaping (Data?, String) -> Void) {
        let params = makeBypassParameters(tcp: false)
        guard let port53 = Network.NWEndpoint.Port(rawValue: 53) else {
            completion(nil, "UDP53_Err")
            return
        }
        let conn = Network.NWConnection(host: Network.NWEndpoint.Host(upstreamIp), port: port53, using: params)
        let queue = DispatchQueue(label: "com.fajostech.aegisguard.udp53")
        var finished = false

        func finish(_ result: Data?, _ tag: String) {
            guard !finished else { return }
            finished = true
            conn.cancel()
            completion(result, tag)
        }

        queue.asyncAfter(deadline: .now() + 2.0) {
            finish(nil, "UDP53_Timeout")
        }

        conn.stateUpdateHandler = { (state: Network.NWConnection.State) in
            guard !finished else { return }
            switch state {
            case .ready:
                conn.send(content: dnsQuery, completion: .contentProcessed { (sendErr: Network.NWError?) in
                    if sendErr != nil {
                        finish(nil, "UDP53_Err")
                        return
                    }
                    conn.receiveMessage { (data: Data?, _ctx: Network.NWConnection.ContentContext?, _isComplete: Bool, recvErr: Network.NWError?) in
                        if recvErr == nil, let data = data, data.count >= 12 {
                            finish(data, "UDP53")
                        } else {
                            finish(nil, "UDP53_Err")
                        }
                    }
                })
            case .failed(_), .cancelled:
                finish(nil, "UDP53_Err")
            default:
                break
            }
        }
        conn.start(queue: queue)
    }

    // MARK: - Shared App Group Telemetry

    private func loadInitialStats() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        statsQueue.sync {
            self.totalQueries = defaults.integer(forKey: "widget_total_queries")
            self.blockedQueries = defaults.integer(forKey: "widget_blocked_queries")
            self.dataSavedBytes = defaults.double(forKey: "widget_data_saved_bytes")
            if let data = defaults.data(forKey: "aegis_query_logs"),
               let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                self.recentLogs = decoded
            }
        }
    }

    private func recordQuery(domain: String, qtype: String, isBlocked: Bool, rule: String?, durationMs: Int, upstream: String) {
        let entry: [String: Any] = [
            "domain": domain,
            "queryType": qtype,
            "isBlocked": isBlocked,
            "matchedRule": rule ?? NSNull(),
            "durationMs": durationMs,
            "upstream": upstream,
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
        ]

        statsQueue.async {
            self.totalQueries += 1
            if isBlocked {
                self.blockedQueries += 1
                self.dataSavedBytes += 45000
            }
            self.recentLogs.insert(entry, at: 0)
            if self.recentLogs.count > 200 {
                self.recentLogs.removeLast(self.recentLogs.count - 200)
            }

            if self.totalQueries <= 5 {
                self.flushStatsSynchronously()
            } else if !self.pendingStatsFlush {
                self.pendingStatsFlush = true
                self.statsQueue.asyncAfter(deadline: .now() + 0.5) {
                    self.pendingStatsFlush = false
                    self.flushStatsSynchronously()
                }
            }
        }
    }

    private func flushStatsSynchronously() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        let total = self.totalQueries
        let blocked = self.blockedQueries
        let saved = self.dataSavedBytes
        let rate = total > 0 ? ((Double(blocked) / Double(total)) * 1000.0).rounded() / 10.0 : 0.0

        defaults.set(total, forKey: "widget_total_queries")
        defaults.set(blocked, forKey: "widget_blocked_queries")
        defaults.set(saved, forKey: "widget_data_saved_bytes")
        defaults.set(rate, forKey: "widget_block_rate")
        defaults.set(stateQueue.sync { self.upstreamProfileName }, forKey: "widget_active_profile")

        if let logData = try? JSONSerialization.data(withJSONObject: self.recentLogs) {
            defaults.set(logData, forKey: "aegis_query_logs")
        }
        defaults.synchronize()

        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        #endif
    }

    private func updateWidgetRunningState(_ running: Bool) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.set(running, forKey: "widget_is_running")
        defaults.synchronize()
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        #endif
    }
}

private final class LocalSocks5Server {
    private weak var provider: PacketTunnelProvider?
    private let queue = DispatchQueue(label: "com.fajostech.aegisguard.socks5.server")
    private var listener: Network.NWListener?
    private var sessions: [UUID: Socks5Session] = [:]

    init(provider: PacketTunnelProvider) {
        self.provider = provider
    }

    func start(completion: @escaping (UInt16?) -> Void) {
        listen(preferredPort: 10808, allowFallbackToAny: true, completion: completion)
    }

    private func listen(preferredPort: UInt16?, allowFallbackToAny: Bool, completion: @escaping (UInt16?) -> Void) {
        let params = Network.NWParameters.tcp
        params.allowLocalEndpointReuse = true

        do {
            let newListener: Network.NWListener
            if let p = preferredPort, let nwPort = Network.NWEndpoint.Port(rawValue: p) {
                newListener = try Network.NWListener(using: params, on: nwPort)
            } else {
                newListener = try Network.NWListener(using: params, on: .any)
            }
            self.listener = newListener

            var finished = false
            func finish(_ port: UInt16?) {
                guard !finished else { return }
                finished = true
                completion(port)
            }

            newListener.stateUpdateHandler = { [weak self] (state: Network.NWListener.State) in
                guard let self = self else {
                    finish(nil)
                    return
                }
                switch state {
                case .ready:
                    let bound = newListener.port?.rawValue ?? preferredPort ?? 10808
                    finish(bound)
                case .failed(_):
                    newListener.cancel()
                    if !finished && allowFallbackToAny && preferredPort != nil {
                        finished = true
                        self.listen(preferredPort: nil, allowFallbackToAny: false, completion: completion)
                    } else {
                        finish(nil)
                    }
                case .cancelled:
                    finish(nil)
                default:
                    break
                }
            }

            newListener.newConnectionHandler = { [weak self] (conn: Network.NWConnection) in
                guard let self = self else {
                    conn.cancel()
                    return
                }
                guard self.isLoopbackConnection(conn) else {
                    conn.cancel()
                    return
                }
                let session = Socks5Session(client: conn, provider: self.provider) { [weak self] sessionId in
                    self?.queue.async {
                        self?.sessions.removeValue(forKey: sessionId)
                    }
                }
                self.sessions[session.id] = session
                session.start()
            }

            queue.asyncAfter(deadline: .now() + 2.0) {
                if !finished {
                    finish(nil)
                }
            }
            newListener.start(queue: queue)
        } catch {
            if allowFallbackToAny && preferredPort != nil {
                listen(preferredPort: nil, allowFallbackToAny: false, completion: completion)
            } else {
                completion(nil)
            }
        }
    }

    private func isLoopbackConnection(_ conn: Network.NWConnection) -> Bool {
        if case .hostPort(let host, _) = conn.endpoint {
            let raw = "\\(host)".lowercased()
            let base = raw.split(separator: "%", maxSplits: 1).first.map(String.init) ?? raw
            return base == "127.0.0.1" || base == "::1" || base == "::ffff:127.0.0.1" || base == "localhost"
        }
        return true
    }

    func stop() {
        queue.async {
            self.listener?.cancel()
            self.listener = nil
            let active = Array(self.sessions.values)
            self.sessions.removeAll()
            for session in active {
                session.close()
            }
        }
    }
}

private final class Socks5Session {
    let id = UUID()
    private let client: Network.NWConnection
    private weak var provider: PacketTunnelProvider?
    private let queue: DispatchQueue
    private let onClose: (UUID) -> Void

    private enum Phase {
        case greeting
        case request
        case tcpConnecting
        case tcpStreaming
        case dnsTcp
        case udpOverTcp
        case closed
    }

    private struct UdpPeerState {
        let conn: Network.NWConnection
        var isReady: Bool
        var pending: [Data]
        let addrBytes: Data
    }

    private var phase: Phase = .greeting
    private var buffer = Data()
    private var remoteTcp: Network.NWConnection?
    private var clientWriteEnded = false
    private var remoteWriteEnded = false
    private var udpPeers: [String: UdpPeerState] = [:]

    init(client: Network.NWConnection, provider: PacketTunnelProvider?, onClose: @escaping (UUID) -> Void) {
        self.client = client
        self.provider = provider
        self.queue = DispatchQueue(label: "com.fajostech.aegisguard.socks5.session.\\(UUID().uuidString)")
        self.onClose = onClose
    }

    func start() {
        client.stateUpdateHandler = { [weak self] (state: Network.NWConnection.State) in
            guard let self = self else { return }
            switch state {
            case .ready:
                self.pumpClient()
            case .failed(_), .cancelled:
                self.close()
            default:
                break
            }
        }
        client.start(queue: queue)
    }

    func close() {
        queue.async { [weak self] in
            self?.closeOnQueue()
        }
    }

    private func closeOnQueue() {
        guard phase != .closed else { return }
        phase = .closed
        client.cancel()
        remoteTcp?.cancel()
        remoteTcp = nil
        for (_, peer) in udpPeers {
            peer.conn.cancel()
        }
        udpPeers.removeAll()
        buffer = Data()
        onClose(id)
    }

    private func pumpClient() {
        guard phase != .closed && phase != .tcpConnecting else { return }
        client.receive(minimumIncompleteLength: 1, maximumLength: 32768) { [weak self] (data: Data?, _ctx: Network.NWConnection.ContentContext?, isComplete: Bool, error: Network.NWError?) in
            guard let self = self, self.phase != .closed else { return }
            if let error = error {
                _ = error
                self.closeOnQueue()
                return
            }

            if self.phase == .tcpStreaming {
                guard let remote = self.remoteTcp else {
                    self.closeOnQueue()
                    return
                }
                if let data = data, !data.isEmpty {
                    remote.send(content: data, completion: .contentProcessed { [weak self] (sendErr: Network.NWError?) in
                        guard let self = self, self.phase != .closed else { return }
                        if sendErr != nil {
                            self.closeOnQueue()
                        } else if isComplete {
                            self.handleClientEof()
                        } else {
                            self.pumpClient()
                        }
                    })
                } else if isComplete {
                    self.handleClientEof()
                } else {
                    self.pumpClient()
                }
                return
            }

            if let data = data, !data.isEmpty {
                self.buffer.append(data)
            }
            self.processBuffer()
            if self.phase == .closed { return }
            if isComplete {
                self.closeOnQueue()
                return
            }
            if self.phase != .tcpConnecting {
                self.pumpClient()
            }
        }
    }

    private func handleClientEof() {
        clientWriteEnded = true
        remoteTcp?.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] (_: Network.NWError?) in
            guard let self = self else { return }
            if self.remoteWriteEnded {
                self.closeOnQueue()
            }
        })
    }

    private func handleRemoteEof() {
        remoteWriteEnded = true
        client.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] (_: Network.NWError?) in
            guard let self = self else { return }
            if self.clientWriteEnded {
                self.closeOnQueue()
            }
        })
    }

    private func processBuffer() {
        while phase != .closed {
            switch phase {
            case .greeting:
                let bytes = [UInt8](buffer)
                guard bytes.count >= 2 else { return }
                guard bytes[0] == 0x05 else {
                    closeOnQueue()
                    return
                }
                let nMethods = Int(bytes[1])
                let totalLen = 2 + nMethods
                guard bytes.count >= totalLen else { return }
                buffer = Data(bytes.dropFirst(totalLen))
                sendClientRaw(Data([0x05, 0x00]))
                phase = .request

            case .request:
                let bytes = [UInt8](buffer)
                guard bytes.count >= 4 else { return }
                guard bytes[0] == 0x05 else {
                    closeOnQueue()
                    return
                }
                let cmd = bytes[1]
                let atyp = bytes[3]
                guard let parsed = Self.parseSocksAddress(bytes: bytes, offset: 3) else {
                    if atyp != 0x01 && atyp != 0x03 && atyp != 0x04 {
                        sendSocksReply(rep: 0x08) { [weak self] in
                            self?.closeOnQueue()
                        }
                    }
                    return
                }
                let totalReqLen = 3 + parsed.consumed
                guard bytes.count >= totalReqLen else { return }
                buffer = Data(bytes.dropFirst(totalReqLen))
                handleCommand(cmd: cmd, host: parsed.host, port: parsed.port)
                if phase == .tcpConnecting || phase == .tcpStreaming {
                    return
                }

            case .dnsTcp:
                let bytes = [UInt8](buffer)
                guard bytes.count >= 2 else { return }
                let msgLen = (Int(bytes[0]) << 8) | Int(bytes[1])
                guard msgLen >= 12 && msgLen <= 4096 else {
                    closeOnQueue()
                    return
                }
                guard bytes.count >= 2 + msgLen else { return }
                let dnsQuery = Data(bytes[2..<(2 + msgLen)])
                buffer = Data(bytes.dropFirst(2 + msgLen))
                provider?.processDnsQuery(dnsQuery: dnsQuery) { [weak self] (respDns: Data) in
                    guard let self = self else { return }
                    self.queue.async {
                        guard self.phase == .dnsTcp else { return }
                        let len = UInt16(respDns.count)
                        var out = Data([UInt8(len >> 8), UInt8(len & 0xFF)])
                        out.append(respDns)
                        self.sendClientRaw(out)
                    }
                }

            case .udpOverTcp:
                let bytes = [UInt8](buffer)
                guard bytes.count >= 4 else { return }
                let datLen = (Int(bytes[0]) << 8) | Int(bytes[1])
                let hdrLen = Int(bytes[2])
                guard hdrLen >= 7, datLen <= 65535 else {
                    closeOnQueue()
                    return
                }
                let totalLen = hdrLen + datLen
                guard bytes.count >= totalLen else { return }
                let addrBytes = Data(bytes[3..<hdrLen])
                let payload = Data(bytes[hdrLen..<totalLen])
                buffer = Data(bytes.dropFirst(totalLen))
                handleUdpFrame(addrBytes: addrBytes, payload: payload)

            case .tcpConnecting, .tcpStreaming, .closed:
                return
            }
        }
    }

    private func handleCommand(cmd: UInt8, host: String, port: UInt16) {
        if cmd == 0x05 {
            // HevSocks5Tunnel UDP-in-TCP mode
            phase = .udpOverTcp
            sendSocksReply(rep: 0x00)
            return
        }

        guard cmd == 0x01 else {
            sendSocksReply(rep: 0x07) { [weak self] in
                self?.closeOnQueue()
            }
            return
        }

        // Prevent DNS-over-TLS / DoQ bypasses outside tunnel filtering
        if port == 853 || port == 8853 {
            sendSocksReply(rep: 0x02) { [weak self] in
                self?.closeOnQueue()
            }
            return
        }

        // Intercept DNS-over-TCP (port 53)
        if port == 53 {
            phase = .dnsTcp
            sendSocksReply(rep: 0x00)
            return
        }

        guard let nwPort = Network.NWEndpoint.Port(rawValue: port), port > 0,
              let provider = self.provider else {
            sendSocksReply(rep: 0x04) { [weak self] in
                self?.closeOnQueue()
            }
            return
        }

        let params = provider.makeBypassParameters(tcp: true)
        let remote = Network.NWConnection(host: Network.NWEndpoint.Host(host), port: nwPort, using: params)
        self.remoteTcp = remote
        self.phase = .tcpConnecting

        queue.asyncAfter(deadline: .now() + 12.0) { [weak self] in
            guard let self = self, self.phase == .tcpConnecting else { return }
            self.sendSocksReply(rep: 0x04) { [weak self] in
                self?.closeOnQueue()
            }
        }

        remote.stateUpdateHandler = { [weak self] (state: Network.NWConnection.State) in
            guard let self = self, self.phase != .closed else { return }
            switch state {
            case .ready:
                guard self.phase == .tcpConnecting else { return }
                self.phase = .tcpStreaming
                self.client.send(
                    content: Data([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]),
                    completion: .contentProcessed { [weak self] (err: Network.NWError?) in
                        guard let self = self, self.phase == .tcpStreaming else { return }
                        if err != nil {
                            self.closeOnQueue()
                            return
                        }
                        if !self.buffer.isEmpty {
                            let initial = self.buffer
                            self.buffer = Data()
                            remote.send(content: initial, completion: .contentProcessed { [weak self] (sendErr: Network.NWError?) in
                                guard let self = self, self.phase == .tcpStreaming else { return }
                                if sendErr != nil {
                                    self.closeOnQueue()
                                } else {
                                    self.pumpClient()
                                    self.pumpRemoteTcp()
                                }
                            })
                        } else {
                            self.pumpClient()
                            self.pumpRemoteTcp()
                        }
                    }
                )
            case .failed(_), .cancelled:
                if self.phase == .tcpConnecting {
                    self.sendSocksReply(rep: 0x04) { [weak self] in
                        self?.closeOnQueue()
                    }
                } else {
                    self.closeOnQueue()
                }
            default:
                break
            }
        }
        remote.start(queue: queue)
    }

    private func pumpRemoteTcp() {
        guard phase == .tcpStreaming, let remote = remoteTcp else { return }
        remote.receive(minimumIncompleteLength: 1, maximumLength: 32768) { [weak self] (data: Data?, _ctx: Network.NWConnection.ContentContext?, isComplete: Bool, error: Network.NWError?) in
            guard let self = self, self.phase == .tcpStreaming else { return }
            if let data = data, !data.isEmpty {
                self.client.send(content: data, completion: .contentProcessed { [weak self] (sendErr: Network.NWError?) in
                    guard let self = self, self.phase == .tcpStreaming else { return }
                    if sendErr != nil {
                        self.closeOnQueue()
                    } else if isComplete {
                        self.handleRemoteEof()
                    } else {
                        self.pumpRemoteTcp()
                    }
                })
            } else if isComplete {
                self.handleRemoteEof()
            } else if error != nil {
                self.closeOnQueue()
            } else {
                self.pumpRemoteTcp()
            }
        }
    }

    private func handleUdpFrame(addrBytes: Data, payload: Data) {
        let ab = [UInt8](addrBytes)
        guard let parsed = Self.parseSocksAddress(bytes: ab, offset: 0) else { return }
        let dstHost = parsed.host
        let dstPort = parsed.port

        // Intercept ALL UDP DNS (port 53), regardless of target DNS IP (198.18.53.53, 8.8.8.8, 1.1.1.1, etc.)
        if dstPort == 53 {
            provider?.processDnsQuery(dnsQuery: payload) { [weak self] (respDns: Data) in
                guard let self = self else { return }
                self.queue.async {
                    guard self.phase == .udpOverTcp else { return }
                    self.sendUdpFrameToClient(addrBytes: addrBytes, payload: respDns)
                }
            }
            return
        }

        // Drop external DoT / DoQ probes on UDP 853 / 8853
        if dstPort == 853 || dstPort == 8853 {
            return
        }

        guard let nwPort = Network.NWEndpoint.Port(rawValue: dstPort), dstPort > 0,
              let provider = self.provider else {
            return
        }

        let peerKey = "\\(dstHost):\\(dstPort)"
        if var existing = udpPeers[peerKey] {
            if existing.isReady {
                existing.conn.send(content: payload, completion: .contentProcessed { (_: Network.NWError?) in })
            } else if existing.pending.count < 32 {
                existing.pending.append(payload)
                udpPeers[peerKey] = existing
            }
            return
        }

        guard udpPeers.count < 32 else { return }
        let params = provider.makeBypassParameters(tcp: false)
        let udpConn = Network.NWConnection(host: Network.NWEndpoint.Host(dstHost), port: nwPort, using: params)
        udpPeers[peerKey] = UdpPeerState(conn: udpConn, isReady: false, pending: [payload], addrBytes: addrBytes)

        udpConn.stateUpdateHandler = { [weak self] (state: Network.NWConnection.State) in
            guard let self = self, self.phase == .udpOverTcp else {
                udpConn.cancel()
                return
            }
            switch state {
            case .ready:
                guard var st = self.udpPeers[peerKey] else { return }
                st.isReady = true
                let queued = st.pending
                st.pending.removeAll()
                self.udpPeers[peerKey] = st
                for pkt in queued {
                    udpConn.send(content: pkt, completion: .contentProcessed { (_: Network.NWError?) in })
                }
                self.pumpUdpPeer(peerKey: peerKey, conn: udpConn, addrBytes: addrBytes)
            case .failed(_), .cancelled:
                self.udpPeers.removeValue(forKey: peerKey)
            default:
                break
            }
        }
        udpConn.start(queue: queue)
    }

    private func pumpUdpPeer(peerKey: String, conn: Network.NWConnection, addrBytes: Data) {
        guard phase == .udpOverTcp, udpPeers[peerKey] != nil else { return }
        conn.receiveMessage { [weak self] (data: Data?, _ctx: Network.NWConnection.ContentContext?, _isComplete: Bool, error: Network.NWError?) in
            guard let self = self, self.phase == .udpOverTcp, self.udpPeers[peerKey] != nil else { return }
            if let data = data, !data.isEmpty {
                self.sendUdpFrameToClient(addrBytes: addrBytes, payload: data)
            }
            if let error = error {
                _ = error
                self.udpPeers[peerKey]?.conn.cancel()
                self.udpPeers.removeValue(forKey: peerKey)
                return
            }
            self.pumpUdpPeer(peerKey: peerKey, conn: conn, addrBytes: addrBytes)
        }
    }

    private func sendUdpFrameToClient(addrBytes: Data, payload: Data) {
        guard payload.count <= 65535, addrBytes.count + 3 <= 255 else { return }
        let dlen = UInt16(payload.count)
        let hdrLen = UInt8(3 + addrBytes.count)
        var frame = Data(capacity: 3 + addrBytes.count + payload.count)
        frame.append(UInt8(dlen >> 8))
        frame.append(UInt8(dlen & 0xFF))
        frame.append(hdrLen)
        frame.append(addrBytes)
        frame.append(payload)
        sendClientRaw(frame)
    }

    private func sendSocksReply(rep: UInt8, completion: (() -> Void)? = nil) {
        let reply = Data([0x05, rep, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        client.send(content: reply, completion: .contentProcessed { _ in
            completion?()
        })
    }

    private func sendClientRaw(_ data: Data) {
        guard phase != .closed else { return }
        client.send(content: data, completion: .contentProcessed { [weak self] (err: Network.NWError?) in
            if err != nil {
                self?.closeOnQueue()
            }
        })
    }

    private static func parseSocksAddress(bytes: [UInt8], offset: Int) -> (host: String, port: UInt16, consumed: Int)? {
        guard offset < bytes.count else { return nil }
        let atyp = bytes[offset]
        switch atyp {
        case 0x01:
            guard offset + 7 <= bytes.count else { return nil }
            let host = "\\(bytes[offset + 1]).\\(bytes[offset + 2]).\\(bytes[offset + 3]).\\(bytes[offset + 4])"
            let port = (UInt16(bytes[offset + 5]) << 8) | UInt16(bytes[offset + 6])
            return (host, port, 7)
        case 0x03:
            guard offset + 2 <= bytes.count else { return nil }
            let dlen = Int(bytes[offset + 1])
            guard offset + 2 + dlen + 2 <= bytes.count else { return nil }
            guard let host = String(bytes: bytes[(offset + 2)..<(offset + 2 + dlen)], encoding: .utf8) else {
                return nil
            }
            let port = (UInt16(bytes[offset + 2 + dlen]) << 8) | UInt16(bytes[offset + 2 + dlen + 1])
            return (host, port, 2 + dlen + 2)
        case 0x04:
            guard offset + 19 <= bytes.count else { return nil }
            guard let host = formatIPv6(Array(bytes[(offset + 1)..<(offset + 17)])) else { return nil }
            let port = (UInt16(bytes[offset + 17]) << 8) | UInt16(bytes[offset + 18])
            return (host, port, 19)
        default:
            return nil
        }
    }

    private static func formatIPv6(_ bytes: [UInt8]) -> String? {
        guard bytes.count == 16 else { return nil }
        var addr = in6_addr()
        withUnsafeMutableBytes(of: &addr) { dst in
            bytes.withUnsafeBytes { src in
                dst.copyMemory(from: src)
            }
        }
        var buf = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
        return withUnsafePointer(to: &addr) { ptr in
            guard let cstr = inet_ntop(AF_INET6, ptr, &buf, socklen_t(INET6_ADDRSTRLEN)) else {
                return nil
            }
            return String(cString: cstr)
        }
    }
}
`;

const SMS_FILTER_SWIFT = `import IdentityLookup
import Foundation

final class MessageFilterExtension: ILMessageFilterExtension {}

extension MessageFilterExtension: ILMessageFilterQueryHandling {
    private static let appGroupId = "${APP_GROUP}"

    private static let phishingTokens: [String] = [
        "verify-account", "login-update", "secure-billing", "wallet-connect",
        "free-nitro", "claim-prize", "appleid-support", "paypal-confirm",
        "account-suspended", "seed-phrase", "recovery-wallet", "signin-verify"
    ]

    private static let riskyTlds: [String] = [
        ".xyz", ".top", ".click", ".tk", ".ml", ".ga", ".cf", ".gq", ".loan", ".zip", ".mov", ".icu", ".cfd"
    ]

    private static let urlShorteners: [String] = [
        "bit.ly", "tinyurl.com", "rb.gy", "cutt.ly", "shorturl.at", "rebrand.ly"
    ]

    private static let scamPhrases: [String] = [
        "account has been suspended",
        "verify your identity immediately",
        "unpaid toll",
        "package delivery failed",
        "confirm your bank",
        "unauthorized login attempt",
        "claim your reward",
        "within 24 hours"
    ]

    func handle(
        _ queryRequest: ILMessageFilterQueryRequest,
        context: ILMessageFilterExtensionContext,
        completion: @escaping (ILMessageFilterQueryResponse) -> Void
    ) {
        let response = ILMessageFilterQueryResponse()
        let body = (queryRequest.messageBody ?? "").lowercased()
        let sender = (queryRequest.sender ?? "").lowercased()
        let combined = "\\(sender) \\(body)"

        response.action = evaluateOfflineAction(text: combined)
        completion(response)
    }

    private func evaluateOfflineAction(text: String) -> ILMessageFilterAction {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .none
        }

        // Extract candidate URLs / domains offline using NSDataDetector
        var domains: [String] = []
        if let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) {
            let range = NSRange(location: 0, length: (text as NSString).length)
            for match in detector.matches(in: text, options: [], range: range) {
                if let host = match.url?.host?.lowercased() {
                    domains.append(host)
                }
            }
        }

        let defaults = UserDefaults(suiteName: Self.appGroupId)
        let customRules = defaults?.string(forKey: "aegis_user_rules") ?? ""
        var userBlocked = Set<String>()
        var userAllowed = Set<String>()
        for raw in customRules.components(separatedBy: .newlines) {
            let t = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if t.hasPrefix("@@||") {
                let d = t.dropFirst(4).split(separator: "^").first.map(String.init) ?? ""
                if !d.isEmpty { userAllowed.insert(d) }
            } else if t.hasPrefix("||") {
                let d = t.dropFirst(2).split(separator: "^").first.map(String.init) ?? ""
                if !d.isEmpty { userBlocked.insert(d) }
            }
        }

        for domain in domains {
            if userAllowed.contains(where: { domain == $0 || domain.hasSuffix("." + $0) }) {
                return .none
            }
            if userBlocked.contains(where: { domain == $0 || domain.hasSuffix("." + $0) }) {
                return .junk
            }
            if domain.contains("xn--") {
                return .junk
            }
            if Self.phishingTokens.contains(where: { domain.contains($0) }) {
                return .junk
            }
        }

        let hasLink = !domains.isEmpty
        let hasScamPhrase = Self.scamPhrases.contains(where: { text.contains($0) })
        let hasRiskyDomain = domains.contains { d in
            Self.riskyTlds.contains(where: { d.hasSuffix($0) }) ||
            Self.urlShorteners.contains(where: { d == $0 || d.hasSuffix("." + $0) })
        }

        if hasLink && (hasScamPhrase || hasRiskyDomain) {
            return .junk
        }

        return .none
    }
}
`;

function createEntitlementsPlist(extraKeysXml = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>${extraKeysXml}
\t<key>com.apple.security.application-groups</key>
\t<array>
\t\t<string>${APP_GROUP}</string>
\t</array>
</dict>
</plist>
`;
}

function createInfoPlist(extensionPoint, principalClass) {
  const principalXml = principalClass
    ? `\n\t\t<key>NSExtensionPrincipalClass</key>\n\t\t<string>${principalClass}</string>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>$(DEVELOPMENT_LANGUAGE)</string>
\t<key>CFBundleDisplayName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>${extensionPoint}</string>${principalXml}
\t</dict>
</dict>
</plist>
`;
}

function writeExtensionFiles(iosDir) {
  const safariDir = path.join(iosDir, SAFARI_TARGET);
  fs.mkdirSync(safariDir, { recursive: true });
  fs.writeFileSync(path.join(safariDir, 'ContentBlockerRequestHandler.swift'), SAFARI_HANDLER_SWIFT);
  fs.writeFileSync(path.join(safariDir, 'blockerList.json'), JSON.stringify(INITIAL_BLOCKER_LIST, null, 2));
  fs.writeFileSync(
    path.join(safariDir, `${SAFARI_TARGET}-Info.plist`),
    createInfoPlist('com.apple.Safari.content-blocker', '$(PRODUCT_MODULE_NAME).ContentBlockerRequestHandler')
  );
  fs.writeFileSync(path.join(safariDir, `${SAFARI_TARGET}.entitlements`), createEntitlementsPlist());

  const widgetDir = path.join(iosDir, WIDGET_TARGET);
  fs.mkdirSync(widgetDir, { recursive: true });
  fs.writeFileSync(path.join(widgetDir, 'AegisWidget.swift'), WIDGET_SWIFT);
  fs.writeFileSync(
    path.join(widgetDir, `${WIDGET_TARGET}-Info.plist`),
    createInfoPlist('com.apple.widgetkit-extension', null)
  );
  fs.writeFileSync(path.join(widgetDir, `${WIDGET_TARGET}.entitlements`), createEntitlementsPlist());

  const tunnelDir = path.join(iosDir, TUNNEL_TARGET);
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'PacketTunnelProvider.swift'), PACKET_TUNNEL_SWIFT);
  fs.writeFileSync(
    path.join(tunnelDir, `${TUNNEL_TARGET}-Info.plist`),
    createInfoPlist('com.apple.networkextension.packet-tunnel', '$(PRODUCT_MODULE_NAME).PacketTunnelProvider')
  );
  fs.writeFileSync(
    path.join(tunnelDir, `${TUNNEL_TARGET}.entitlements`),
    createEntitlementsPlist(
      `\n\t<key>com.apple.developer.networking.networkextension</key>\n\t<array>\n\t\t<string>packet-tunnel-provider</string>\n\t</array>`
    )
  );

  const smsDir = path.join(iosDir, SMS_TARGET);
  fs.mkdirSync(smsDir, { recursive: true });
  fs.writeFileSync(path.join(smsDir, 'MessageFilterExtension.swift'), SMS_FILTER_SWIFT);
  fs.writeFileSync(
    path.join(smsDir, `${SMS_TARGET}-Info.plist`),
    createInfoPlist('com.apple.identitylookup.message-filter', '$(PRODUCT_MODULE_NAME).MessageFilterExtension')
  );
  fs.writeFileSync(path.join(smsDir, `${SMS_TARGET}.entitlements`), createEntitlementsPlist());
}

function ensureExtensionTarget(proj, options) {
  const { targetName, bundleId, swiftFiles, resourceFiles, entitlementsPath } = options;
  const existingTargets = proj.pbxNativeTargetSection();
  const alreadyExists = Object.values(existingTargets).some(
    (t) => t && typeof t === 'object' && (t.name === targetName || t.name === `"${targetName}"`)
  );
  if (alreadyExists) return;

  if (!proj.hash.project.objects['PBXTargetDependency']) {
    proj.hash.project.objects['PBXTargetDependency'] = {};
  }
  if (!proj.hash.project.objects['PBXContainerItemProxy']) {
    proj.hash.project.objects['PBXContainerItemProxy'] = {};
  }

  const target = proj.addTarget(targetName, 'app_extension', targetName, bundleId);
  const group = proj.addPbxGroup([], targetName, targetName);

  const rootProject = proj.getFirstProject();
  const mainGroupUuid = rootProject.firstProject.mainGroup;
  const pbxGroupSection = proj.hash.project.objects['PBXGroup'];
  if (pbxGroupSection[mainGroupUuid] && pbxGroupSection[mainGroupUuid].children) {
    pbxGroupSection[mainGroupUuid].children.push({ value: group.uuid, comment: targetName });
  }

  proj.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  if (resourceFiles.length > 0) {
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
  }
  proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

  for (const sf of swiftFiles) {
    proj.addSourceFile(sf, { target: target.uuid }, group.uuid);
  }
  for (const rf of resourceFiles) {
    proj.addResourceFile(rf, { target: target.uuid }, group.uuid);
  }
  proj.addFile(`${targetName}-Info.plist`, group.uuid);
  proj.addFile(`${targetName}.entitlements`, group.uuid);

  const configList = proj.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
  if (configList && configList.buildConfigurations) {
    const buildConfigs = proj.pbxXCBuildConfigurationSection();
    for (const ref of configList.buildConfigurations) {
      const cfg = buildConfigs[ref.value];
      if (cfg && cfg.buildSettings) {
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${entitlementsPath}"`;
        cfg.buildSettings.SWIFT_VERSION = '5.9';
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.4';
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        cfg.buildSettings.MARKETING_VERSION = '1.0.0';
        cfg.buildSettings.CURRENT_PROJECT_VERSION = '1';
        cfg.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
        cfg.buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
        cfg.buildSettings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = 'NO';
        cfg.buildSettings.CLANG_ENABLE_MODULES = 'YES';
        cfg.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
  }
}

const TUN2SOCKSKIT_PODSPEC = `Pod::Spec.new do |s|
  s.name             = 'Tun2SocksKit'
  s.version          = '5.20.0'
  s.summary          = 'Wrapper for hev-socks5-tunnel.'
  s.homepage         = 'https://github.com/EbrahimTahernejad/Tun2SocksKit'
  s.license          = { :type => 'MIT', :file => 'LICENSE' }
  s.author           = { 'Ebrahim Tahernejad' => 'ebrahimtahernejad@gmail.com' }
  s.source           = { :http => 'https://github.com/EbrahimTahernejad/Tun2SocksKit/releases/download/5.20.0/CocoapodsSource.zip' }
  s.static_framework = true

  s.ios.deployment_target = '12.0'
  s.osx.deployment_target = '12.0'
  s.requires_arc = true
  s.swift_versions = ['5.7', '5.8', '5.9']

  s.default_subspec = 'Core'

  s.subspec 'HevSocks5Tunnel' do |hs|
    hs.vendored_frameworks = 'HevSocks5Tunnel.xcframework'
  end

  s.subspec 'Core' do |ss|
    ss.source_files  = 'Sources/Tun2SocksKit/**/*.{swift,h}'
    ss.public_header_files = 'Sources/Tun2SocksKit/Tun2SocksKitC.h'
    ss.dependency 'Tun2SocksKit/HevSocks5Tunnel'
    ss.pod_target_xcconfig = {
      'DEFINES_MODULE' => 'YES'
    }
  end
end
`;

function withAdguardIosFiles(config) {
  if (!withDangerousMod) return config;
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
      const appDir = path.join(iosDir, projectName);
      if (fs.existsSync(appDir)) {
        fs.writeFileSync(path.join(appDir, 'AegisShortcuts.swift'), SHORTCUTS_SWIFT);
      }
      fs.writeFileSync(path.join(iosDir, 'Tun2SocksKit.podspec'), TUN2SOCKSKIT_PODSPEC);
      writeExtensionFiles(iosDir);
      return config;
    },
  ]);
}

function withAdguardIosPodfile(config) {
  if (!withPodfile) return config;
  return withPodfile(config, (config) => {
    const podfileDir = config.modResults.path ? path.dirname(config.modResults.path) : path.join(config.modRequest.platformProjectRoot || '');
    if (podfileDir && fs.existsSync(podfileDir)) {
      fs.writeFileSync(path.join(podfileDir, 'Tun2SocksKit.podspec'), TUN2SOCKSKIT_PODSPEC);
    }

    let contents = config.modResults.contents || '';
    const blockRegex = /\n?# >>> AegisPacketTunnel Tun2SocksKit begin[\s\S]*?# <<< AegisPacketTunnel Tun2SocksKit end\n?/g;
    contents = contents.replace(blockRegex, '').trimEnd();

    const podBlock = [
      '# >>> AegisPacketTunnel Tun2SocksKit begin',
      `target '${TUNNEL_TARGET}' do`,
      '  use_modular_headers!',
      "  pod 'Tun2SocksKit', :podspec => File.join(__dir__, 'Tun2SocksKit.podspec'), :modular_headers => true",
      'end',
      '# <<< AegisPacketTunnel Tun2SocksKit end',
    ].join('\n');

    config.modResults.contents = `${contents}\n\n${podBlock}\n`;
    return config;
  });
}

function withAdguardIosXcode(config) {
  if (!withXcodeProject) return config;
  return withXcodeProject(config, (config) => {
    const proj = config.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);

    try {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/AegisShortcuts.swift`,
        groupName: projectName,
        project: proj,
      });
    } catch (e) {
      // Safe fallback if already added
    }

    ensureExtensionTarget(proj, {
      targetName: SAFARI_TARGET,
      bundleId: SAFARI_BUNDLE_ID,
      swiftFiles: ['ContentBlockerRequestHandler.swift'],
      resourceFiles: ['blockerList.json'],
      entitlementsPath: `${SAFARI_TARGET}/${SAFARI_TARGET}.entitlements`,
    });

    ensureExtensionTarget(proj, {
      targetName: WIDGET_TARGET,
      bundleId: WIDGET_BUNDLE_ID,
      swiftFiles: ['AegisWidget.swift'],
      resourceFiles: [],
      entitlementsPath: `${WIDGET_TARGET}/${WIDGET_TARGET}.entitlements`,
    });

    ensureExtensionTarget(proj, {
      targetName: TUNNEL_TARGET,
      bundleId: TUNNEL_BUNDLE_ID,
      swiftFiles: ['PacketTunnelProvider.swift'],
      resourceFiles: [],
      entitlementsPath: `${TUNNEL_TARGET}/${TUNNEL_TARGET}.entitlements`,
    });

    ensureExtensionTarget(proj, {
      targetName: SMS_TARGET,
      bundleId: SMS_BUNDLE_ID,
      swiftFiles: ['MessageFilterExtension.swift'],
      resourceFiles: [],
      entitlementsPath: `${SMS_TARGET}/${SMS_TARGET}.entitlements`,
    });

    return config;
  });
}

function withAdguardIosExtensions(config) {
  config = withAdguardIosFiles(config);
  config = withAdguardIosXcode(config);
  config = withAdguardIosPodfile(config);
  return config;
}

module.exports = createRunOncePlugin(withAdguardIosExtensions, 'withAdguardIosExtensions', '1.0.0');
