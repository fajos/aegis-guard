const fs = require('fs');
const path = require('path');

let withXcodeProject, withDangerousMod, IOSConfig, createRunOncePlugin;

try {
  const plugins = require('expo/config-plugins');
  withXcodeProject = plugins.withXcodeProject;
  withDangerousMod = plugins.withDangerousMod;
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
import UserNotifications
import Darwin
#if canImport(WidgetKit)
import WidgetKit
#endif

class PacketTunnelProvider: NEPacketTunnelProvider {
    private let appGroupId = "${APP_GROUP}"
    // Keep tunnelRemoteAddress distinct from virtualDnsAddress so iOS does not exclude DNS from utun
    private let tunnelRemoteAddress = "198.18.0.1"
    private let tunnelAddress = "198.18.0.2"
    private let virtualDnsAddress = "198.18.53.53"
    private let tunnelAddress6 = "fd00:198:18::2"
    private let virtualDnsAddress6 = "fd00:198:18::53"

    private let stateQueue = DispatchQueue(label: "com.fajostech.aegisguard.tunnel.state")
    private let statsQueue = DispatchQueue(label: "com.fajostech.aegisguard.tunnel.stats")

    private lazy var dohSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 2.5
        config.timeoutIntervalForResource = 3.0
        config.httpMaximumConnectionsPerHost = 12
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

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
        reloadConfigFromAppGroup()
        loadInitialStats()

        let networkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: tunnelRemoteAddress)
        networkSettings.mtu = NSNumber(value: 1500)

        let ipv4Settings = NEIPv4Settings(addresses: [tunnelAddress], subnetMasks: ["255.255.255.255"])
        // Route ONLY the virtual DNS IP (distinct from tunnelRemoteAddress) so normal traffic bypasses userspace
        ipv4Settings.includedRoutes = [
            NEIPv4Route(destinationAddress: virtualDnsAddress, subnetMask: "255.255.255.255")
        ]
        networkSettings.ipv4Settings = ipv4Settings

        let ipv6Settings = NEIPv6Settings(addresses: [tunnelAddress6], networkPrefixLengths: [128])
        ipv6Settings.includedRoutes = [
            NEIPv6Route(destinationAddress: virtualDnsAddress6, networkPrefixLength: 128)
        ]
        networkSettings.ipv6Settings = ipv6Settings

        let dnsSettings = NEDNSSettings(servers: [virtualDnsAddress, virtualDnsAddress6])
        dnsSettings.matchDomains = [""]
        dnsSettings.matchDomainsNoSearch = true
        networkSettings.dnsSettings = dnsSettings

        setTunnelNetworkSettings(networkSettings) { [weak self] error in
            if let error = error {
                completionHandler(error)
                return
            }
            guard let self = self else {
                completionHandler(nil)
                return
            }
            self.isTunnelActive = true
            self.updateWidgetRunningState(true)
            self.startPacketLoop()
            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        isTunnelActive = false
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
                    dlSet.reserveCapacity(min(26000, rawList.count / 16))
                    rawList.enumerateLines { line, stop in
                        let clean = line.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                        if !clean.isEmpty {
                            dlSet.insert(clean)
                            if dlSet.count >= 25000 {
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

    // MARK: - Packet Loop & DNS Interception

    private func startPacketLoop() {
        packetFlow.readPackets { [weak self] packets, protocols in
            guard let self = self, self.isTunnelActive else { return }

            for i in 0..<packets.count {
                let packet = packets[i]
                let proto = protocols[i].intValue
                if proto == Int(AF_INET) {
                    self.handleIPv4Packet(packet)
                } else if proto == Int(AF_INET6) {
                    self.handleIPv6Packet(packet)
                }
            }

            if self.isTunnelActive {
                self.startPacketLoop()
            }
        }
    }

    private func handleIPv4Packet(_ packet: Data) {
        let bytes = [UInt8](packet)
        guard bytes.count >= 28 else { return }
        let version = bytes[0] >> 4
        guard version == 4 else { return }
        let ihl = Int(bytes[0] & 0x0F) * 4
        guard ihl >= 20, bytes.count >= ihl + 8 else { return }
        guard bytes[9] == 17 else { return } // UDP only

        let srcIP = Array(bytes[12..<16])
        let dstIP = Array(bytes[16..<20])
        let srcPort = (UInt16(bytes[ihl]) << 8) | UInt16(bytes[ihl + 1])
        let dstPort = (UInt16(bytes[ihl + 2]) << 8) | UInt16(bytes[ihl + 3])

        guard dstPort == 53 else { return }

        let dnsOffset = ihl + 8
        guard bytes.count >= dnsOffset + 12 else { return }
        let dnsQuery = Data(bytes[dnsOffset...])

        processDnsQuery(dnsQuery: dnsQuery) { responseDns in
            let reply = self.buildIPv4UdpPacket(srcIP: dstIP, dstIP: srcIP, srcPort: dstPort, dstPort: srcPort, payload: responseDns)
            self.packetFlow.writePackets([reply], withProtocols: [NSNumber(value: AF_INET)])
        }
    }

    private func handleIPv6Packet(_ packet: Data) {
        let bytes = [UInt8](packet)
        guard bytes.count >= 48 else { return }
        let version = bytes[0] >> 4
        guard version == 6 else { return }
        guard bytes[6] == 17 else { return } // UDP only (no extension headers)

        let srcIP = Array(bytes[8..<24])
        let dstIP = Array(bytes[24..<40])
        let srcPort = (UInt16(bytes[40]) << 8) | UInt16(bytes[41])
        let dstPort = (UInt16(bytes[42]) << 8) | UInt16(bytes[43])

        guard dstPort == 53 else { return }

        let dnsOffset = 48
        guard bytes.count >= dnsOffset + 12 else { return }
        let dnsQuery = Data(bytes[dnsOffset...])

        processDnsQuery(dnsQuery: dnsQuery) { responseDns in
            let reply = self.buildIPv6UdpPacket(srcIP: dstIP, dstIP: srcIP, srcPort: dstPort, dstPort: srcPort, payload: responseDns)
            self.packetFlow.writePackets([reply], withProtocols: [NSNumber(value: AF_INET6)])
        }
    }

    private func processDnsQuery(dnsQuery: Data, writeReply: @escaping (Data) -> Void) {
        guard let parsed = parseDnsQuestion(dnsQuery) else { return }
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

        // Instant zero-network bootstrap for DoH server hostnames to eliminate UDP-53 / NAT64 deadlocks
        let dohHost = URL(string: stateQueue.sync { upstreamDohUrl })?.host?.lowercased() ?? ""
        if !dohHost.isEmpty && (qname == dohHost || qname.hasSuffix("." + dohHost)) {
            if let cachedIp = knownDohBootstrapIp(for: qname) {
                let dnsResp = buildBlockedDnsResponse(query: dnsQuery, qtype: qtype, mode: qtype == 1 ? "REWRITE" : "NODATA", rewriteIp: qtype == 1 ? cachedIp : nil)
                writeReply(dnsResp)
                return
            }
            let bootIp = stateQueue.sync { upstreamBootstrapIp }
            forwardViaDirectUdp(dnsQuery: dnsQuery, upstreamIp: bootIp) { responseData in
                if let resp = responseData {
                    writeReply(resp)
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

        // Allowed locally -> forward over DoH (with UDP bootstrap fallback)
        let snapshot = stateQueue.sync { (upstreamDohUrl, upstreamBootstrapIp, upstreamProfileName) }
        forwardViaDoh(dnsQuery: dnsQuery, dohUrl: snapshot.0, bootstrapIp: snapshot.1) { responseData in
            let latency = max(1, Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000))
            guard let resp = responseData else { return }

            let upstreamBlocked = self.didUpstreamBlock(resp)
            writeReply(resp)
            self.recordQuery(
                domain: qname,
                qtype: qtypeStr,
                isBlocked: upstreamBlocked,
                rule: upstreamBlocked ? "Upstream DoH Block" : nil,
                durationMs: latency,
                upstream: snapshot.2
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

    // MARK: - Direct-IP DoH, Encrypted DoT (853) & Bootstrap UDP Forwarding

    private func supportsDirectIpDoh(_ bootstrapIp: String, dohUrl: String) -> String? {
        let lower = dohUrl.lowercased()
        let directIps: Set<String> = ["94.140.14.14", "94.140.14.15", "1.1.1.1", "1.1.1.3", "8.8.8.8"]
        if directIps.contains(bootstrapIp) && (lower.contains("dns.adguard-dns.com") || lower.contains("dns-family.adguard-dns.com") || lower.contains("cloudflare-dns.com") || lower.contains("dns.google")) {
            return "https://\\(bootstrapIp)/dns-query"
        }
        return nil
    }

    private func forwardViaDoh(dnsQuery: Data, dohUrl: String, bootstrapIp: String, completion: @escaping (Data?) -> Void) {
        let sniHost = URL(string: dohUrl)?.host ?? "dns.adguard-dns.com"
        // Use Direct-IP HTTPS URL whenever cert SAN supports IP to eliminate mDNSResponder bootstrap loops & latency spikes
        let effectiveUrlStr = supportsDirectIpDoh(bootstrapIp, dohUrl: dohUrl) ?? dohUrl
        guard let url = URL(string: effectiveUrlStr) else {
            forwardViaDot(dnsQuery: dnsQuery, upstreamIp: bootstrapIp, sniHost: sniHost, completion: completion)
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = dnsQuery
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.setValue("application/dns-message", forHTTPHeaderField: "Accept")

        dohSession.dataTask(with: request) { [weak self] data, response, error in
            if let data = data, error == nil,
               let httpResp = response as? HTTPURLResponse,
               (200...299).contains(httpResp.statusCode),
               data.count >= 12 {
                completion(data)
                return
            }
            // Fallback 1: Encrypted DNS-over-TLS (port 853) directly to bootstrap IP (immune to UDP:53 hijacking)
            self?.forwardViaDot(dnsQuery: dnsQuery, upstreamIp: bootstrapIp, sniHost: sniHost, completion: completion)
        }.resume()
    }

    private func forwardViaDot(dnsQuery: Data, upstreamIp: String, sniHost: String, completion: @escaping (Data?) -> Void) {
        let tlsOpts = Network.NWProtocolTLS.Options()
        sec_protocol_options_set_tls_server_name(tlsOpts.securityProtocolOptions, sniHost)
        let params = Network.NWParameters(tls: tlsOpts)
        let dotPort: Network.NWEndpoint.Port = 853
        let conn = Network.NWConnection(host: Network.NWEndpoint.Host(upstreamIp), port: dotPort, using: params)
        let queue = DispatchQueue(label: "com.fajostech.aegisguard.dot")
        var finished = false
        let lock = NSLock()

        func finish(_ result: Data?) {
            lock.lock()
            let already = finished
            finished = true
            lock.unlock()
            guard !already else { return }
            conn.cancel()
            if let data = result {
                completion(data)
            } else {
                // Final fallback: direct UDP:53 only if both DoH and DoT failed
                DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                    self?.forwardViaDirectUdp(dnsQuery: dnsQuery, upstreamIp: upstreamIp, completion: completion)
                }
            }
        }

        queue.asyncAfter(deadline: .now() + 2.5) {
            finish(nil)
        }

        conn.stateUpdateHandler = { (state: Network.NWConnection.State) in
            switch state {
            case .ready:
                let len = UInt16(dnsQuery.count)
                var framed = Data([UInt8(len >> 8), UInt8(len & 0xFF)])
                framed.append(dnsQuery)
                conn.send(content: framed, completion: .contentProcessed { sendErr in
                    if sendErr != nil {
                        finish(nil)
                        return
                    }
                    conn.receive(minimumIncompleteLength: 2, maximumLength: 2) { lenData, _, _, recvErr in
                        guard recvErr == nil, let lenData = lenData, lenData.count == 2 else {
                            finish(nil)
                            return
                        }
                        let msgLen = (Int(lenData[0]) << 8) | Int(lenData[1])
                        guard msgLen >= 12 && msgLen <= 4096 else {
                            finish(nil)
                            return
                        }
                        conn.receive(minimumIncompleteLength: msgLen, maximumLength: msgLen) { body, _, _, bodyErr in
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

    private func forwardViaDirectUdp(dnsQuery: Data, upstreamIp: String, completion: @escaping (Data?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let sock = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
            guard sock >= 0 else {
                completion(nil)
                return
            }
            defer { Darwin.close(sock) }

            var timeout = timeval(tv_sec: 2, tv_usec: 0)
            setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

            var addr = sockaddr_in()
            addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = in_port_t(53).bigEndian
            guard inet_pton(AF_INET, upstreamIp, &addr.sin_addr) == 1 else {
                completion(nil)
                return
            }

            let sent = dnsQuery.withUnsafeBytes { rawBuf -> Int in
                guard let base = rawBuf.baseAddress else { return -1 }
                return withUnsafePointer(to: &addr) {
                    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                        Darwin.sendto(sock, base, dnsQuery.count, 0, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
                    }
                }
            }
            guard sent > 0 else {
                completion(nil)
                return
            }

            var recvBuf = [UInt8](repeating: 0, count: 4096)
            let n = Darwin.recv(sock, &recvBuf, recvBuf.count, 0)
            if n >= 12 {
                completion(Data(recvBuf[0..<n]))
            } else {
                completion(nil)
            }
        }
    }

    private func buildIPv4UdpPacket(srcIP: [UInt8], dstIP: [UInt8], srcPort: UInt16, dstPort: UInt16, payload: Data) -> Data {
        let udpLen = UInt16(8 + payload.count)
        let totalLen = UInt16(20 + Int(udpLen))

        var ip = [UInt8](repeating: 0, count: 20)
        ip[0] = 0x45 // IPv4, IHL = 5
        ip[1] = 0x00
        ip[2] = UInt8(totalLen >> 8)
        ip[3] = UInt8(totalLen & 0xFF)
        ip[4] = 0x00
        ip[5] = 0x01
        ip[6] = 0x40 // Don't fragment
        ip[7] = 0x00
        ip[8] = 64   // TTL
        ip[9] = 17   // UDP
        ip[12] = srcIP[0]; ip[13] = srcIP[1]; ip[14] = srcIP[2]; ip[15] = srcIP[3]
        ip[16] = dstIP[0]; ip[17] = dstIP[1]; ip[18] = dstIP[2]; ip[19] = dstIP[3]

        // IPv4 header checksum
        let ipSum = computeChecksum(ip)
        ip[10] = UInt8(ipSum >> 8)
        ip[11] = UInt8(ipSum & 0xFF)

        var udp = [UInt8](repeating: 0, count: 8)
        udp[0] = UInt8(srcPort >> 8)
        udp[1] = UInt8(srcPort & 0xFF)
        udp[2] = UInt8(dstPort >> 8)
        udp[3] = UInt8(dstPort & 0xFF)
        udp[4] = UInt8(udpLen >> 8)
        udp[5] = UInt8(udpLen & 0xFF)

        // UDP pseudo-header checksum
        var pseudo = [UInt8]()
        pseudo.append(contentsOf: srcIP)
        pseudo.append(contentsOf: dstIP)
        pseudo.append(0x00)
        pseudo.append(17)
        pseudo.append(udp[4])
        pseudo.append(udp[5])
        pseudo.append(contentsOf: udp)
        pseudo.append(contentsOf: payload)
        let udpSum = computeChecksum(pseudo)
        udp[6] = UInt8(udpSum >> 8)
        udp[7] = UInt8(udpSum & 0xFF)

        var packet = Data(capacity: Int(totalLen))
        packet.append(contentsOf: ip)
        packet.append(contentsOf: udp)
        packet.append(payload)
        return packet
    }

    private func buildIPv6UdpPacket(srcIP: [UInt8], dstIP: [UInt8], srcPort: UInt16, dstPort: UInt16, payload: Data) -> Data {
        let udpLen = UInt16(8 + payload.count)
        var ip6 = [UInt8](repeating: 0, count: 40)
        ip6[0] = 0x60 // IPv6
        ip6[4] = UInt8(udpLen >> 8)
        ip6[5] = UInt8(udpLen & 0xFF)
        ip6[6] = 17   // UDP
        ip6[7] = 64   // Hop Limit
        for idx in 0..<16 {
            ip6[8 + idx] = srcIP[idx]
            ip6[24 + idx] = dstIP[idx]
        }

        var udp = [UInt8](repeating: 0, count: 8)
        udp[0] = UInt8(srcPort >> 8)
        udp[1] = UInt8(srcPort & 0xFF)
        udp[2] = UInt8(dstPort >> 8)
        udp[3] = UInt8(dstPort & 0xFF)
        udp[4] = UInt8(udpLen >> 8)
        udp[5] = UInt8(udpLen & 0xFF)

        var pseudo = [UInt8]()
        pseudo.append(contentsOf: srcIP)
        pseudo.append(contentsOf: dstIP)
        pseudo.append(contentsOf: [0x00, 0x00, udp[4], udp[5]])
        pseudo.append(contentsOf: [0x00, 0x00, 0x00, 17])
        pseudo.append(contentsOf: udp)
        pseudo.append(contentsOf: payload)
        let udpSum = computeChecksum(pseudo)
        udp[6] = UInt8(udpSum >> 8)
        udp[7] = UInt8(udpSum & 0xFF)

        var packet = Data(capacity: 40 + Int(udpLen))
        packet.append(contentsOf: ip6)
        packet.append(contentsOf: udp)
        packet.append(payload)
        return packet
    }

    private func computeChecksum(_ data: [UInt8]) -> UInt16 {
        var sum: UInt32 = 0
        var idx = 0
        while idx + 1 < data.count {
            sum += (UInt32(data[idx]) << 8) | UInt32(data[idx + 1])
            idx += 2
        }
        if idx < data.count {
            sum += UInt32(data[idx]) << 8
        }
        while (sum >> 16) != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16)
        }
        let inverted = ~UInt16(sum & 0xFFFF)
        return inverted == 0 ? 0xFFFF : inverted
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
      }
    }
  }
}

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
      writeExtensionFiles(iosDir);
      return config;
    },
  ]);
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
  return config;
}

module.exports = createRunOncePlugin(withAdguardIosExtensions, 'withAdguardIosExtensions', '1.0.0');
