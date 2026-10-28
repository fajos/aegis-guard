import Foundation
import NetworkExtension
import React

@objc(AdGuardVpnModule)
class AdGuardVpnModule: RCTEventEmitter {

    private var tunnelManager: NETunnelProviderManager?
    private var hasListeners = false

    override init() {
        super.init()
        self.loadTunnelManager(completion: nil)
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(vpnStatusDidChange),
            name: .NEVPNStatusDidChange,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return ["onQueryLogged", "onVpnStateChanged"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc private func vpnStatusDidChange(notification: Notification) {
        guard hasListeners else { return }
        let running = isVpnConnected()
        sendEvent(withName: "onVpnStateChanged", body: ["isRunning": running])
    }

    private func isVpnConnected() -> Bool {
        guard let manager = tunnelManager else { return false }
        return manager.connection.status == .connected
    }

    private func loadTunnelManager(completion: ((NETunnelProviderManager?) -> Void)?) {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            if let manager = managers?.first {
                self?.tunnelManager = manager
                completion?(manager)
            } else {
                let newManager = NETunnelProviderManager()
                let proto = NETunnelProviderProtocol()
                proto.providerBundleIdentifier = "com.fajostech.aegisguard.PacketTunnel"
                proto.serverAddress = "10.0.0.1"
                newManager.protocolConfiguration = proto
                newManager.localizedDescription = "Aegis Guard DNS Protection"
                newManager.isEnabled = true
                newManager.saveToPreferences { error in
                    if error == nil {
                        self?.tunnelManager = newManager
                        completion?(newManager)
                    } else {
                        completion?(nil)
                    }
                }
            }
        }
    }

    @objc(isRunning:rejecter:)
    func isRunning(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        if let manager = tunnelManager {
            resolve(manager.connection.status == .connected)
        } else {
            loadTunnelManager { manager in
                resolve(manager?.connection.status == .connected)
            }
        }
    }

    @objc(startVpn:rejecter:)
    func startVpn(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        loadTunnelManager { [weak self] manager in
            guard let manager = manager else {
                rejecter("LOAD_ERROR", "Failed to load tunnel manager", nil)
                return
            }

            manager.loadFromPreferences { error in
                if let error = error {
                    rejecter("PREF_ERROR", error.localizedDescription, error)
                    return
                }

                manager.isEnabled = true
                manager.saveToPreferences { error in
                    if let error = error {
                        rejecter("SAVE_ERROR", error.localizedDescription, error)
                        return
                    }

                    do {
                        try manager.connection.startVPNTunnel()
                        resolve(true)
                    } catch {
                        rejecter("START_ERROR", error.localizedDescription, error)
                    }
                }
            }
        }
    }

    @objc(stopVpn:rejecter:)
    func stopVpn(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let manager = tunnelManager else {
            resolve(true)
            return
        }
        manager.connection.stopVPNTunnel()
        resolve(true)
    }

    @objc(getStatistics:rejecter:)
    func getStatistics(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        let total = userDefaults?.integer(forKey: "stats_total") ?? 0
        let blocked = userDefaults?.integer(forKey: "stats_blocked") ?? 0
        let ruleCount = userDefaults?.integer(forKey: "stats_rule_count") ?? 125430
        let savedBytes = blocked * 32768
        let rate = total > 0 ? (Double(blocked) / Double(total)) * 100.0 : 0.0

        let stats: [String: Any] = [
            "totalQueries": total,
            "blockedQueries": blocked,
            "dataSavedBytes": savedBytes,
            "blockRate": rate,
            "ruleCount": ruleCount
        ]
        resolve(stats)
    }

    @objc(addCustomRule:resolver:rejecter:)
    func addCustomRule(rule: String, resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        var current = userDefaults?.string(forKey: "user_rules") ?? ""
        current += "\n" + rule
        userDefaults?.set(current, forKey: "user_rules")
        resolve(true)
    }

    @objc(getUserRules:rejecter:)
    func getUserRules(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        let current = userDefaults?.string(forKey: "user_rules") ?? "||doubleclick.net^\n||google-analytics.com^\n@@||allowed-example.com^"
        resolve(current)
    }

    @objc(saveUserRules:resolver:rejecter:)
    func saveUserRules(rulesText: String, resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        userDefaults?.set(rulesText, forKey: "user_rules")
        resolve(true)
    }

    @objc(getFilterSubscriptions:rejecter:)
    func getFilterSubscriptions(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let filters: [[String: Any]] = [
            [
                "id": 1,
                "name": "AdGuard Base Filter",
                "description": "Comprehensive ad-blocking rules for popular web applications",
                "url": "https://filters.adtidy.org/extension/chromium/filters/2.txt",
                "isEnabled": true,
                "ruleCount": 68420,
                "lastUpdated": Double(Date().timeIntervalSince1970 * 1000),
                "isCustom": false
            ],
            [
                "id": 2,
                "name": "AdGuard Tracking Protection",
                "description": "Blocks telemetry, analytics, trackers and user profiling scripts",
                "url": "https://filters.adtidy.org/extension/chromium/filters/3.txt",
                "isEnabled": true,
                "ruleCount": 42100,
                "lastUpdated": Double(Date().timeIntervalSince1970 * 1000),
                "isCustom": false
            ],
            [
                "id": 3,
                "name": "AdGuard Mobile Ads Filter",
                "description": "Specialized filter targeting mobile advertising networks & in-app ads",
                "url": "https://filters.adtidy.org/extension/chromium/filters/11.txt",
                "isEnabled": true,
                "ruleCount": 14910,
                "lastUpdated": Double(Date().timeIntervalSince1970 * 1000),
                "isCustom": false
            ],
            [
                "id": 4,
                "name": "AdGuard DNS Filter",
                "description": "Optimized DNS filter rules composed for high-throughput DNS proxies",
                "url": "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
                "isEnabled": true,
                "ruleCount": 45800,
                "lastUpdated": Double(Date().timeIntervalSince1970 * 1000),
                "isCustom": false
            ]
        ]
        resolve(filters)
    }

    @objc(toggleFilterSubscription:enabled:resolver:rejecter:)
    func toggleFilterSubscription(id: NSNumber, enabled: Bool, resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        userDefaults?.set(enabled, forKey: "filter_enabled_\(id)")
        resolve(true)
    }

    @objc(updateFilterSubscriptions:rejecter:)
    func updateFilterSubscriptions(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        // Simulates fetching latest filter definitions
        resolve(4)
    }

    @objc(getInstalledApps:rejecter:)
    func getInstalledApps(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        // On iOS, system sandboxing prevents listing installed third-party apps.
        // Returns common browser and app profiles configured for split-tunneling.
        let profiles: [[String: Any]] = [
            ["appName": "Safari", "packageName": "com.apple.mobilesafari", "isSystemApp": true, "isFiltered": true, "isVpnBypassed": false],
            ["appName": "Google Chrome", "packageName": "com.google.chrome.ios", "isSystemApp": false, "isFiltered": true, "isVpnBypassed": false],
            ["appName": "Mail", "packageName": "com.apple.mobilemail", "isSystemApp": true, "isFiltered": true, "isVpnBypassed": false],
            ["appName": "App Store", "packageName": "com.apple.AppStore", "isSystemApp": true, "isFiltered": false, "isVpnBypassed": true]
        ]
        resolve(profiles)
    }

    @objc(setAppBypass:bypass:resolver:rejecter:)
    func setAppBypass(bundleId: String, bypass: Bool, resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        userDefaults?.set(bypass, forKey: "bypass_\(bundleId)")
        resolve(true)
    }

    @objc(getQueryLogs:rejecter:)
    func getQueryLogs(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let sampleLogs: [[String: Any]] = [
            ["domain": "app-measurement.com", "queryType": "A", "isBlocked": true, "matchedRule": "||app-measurement.com^", "durationMs": 4.2, "upstream": "Local Filter", "timestamp": Double(Date().timeIntervalSince1970 * 1000)],
            ["domain": "api.github.com", "queryType": "AAAA", "isBlocked": false, "matchedRule": nil, "durationMs": 18.5, "upstream": "94.140.14.14", "timestamp": Double(Date().timeIntervalSince1970 * 1000 - 1200)],
            ["domain": "adservice.google.com", "queryType": "A", "isBlocked": true, "matchedRule": "||adservice.google.com^", "durationMs": 3.8, "upstream": "Local Filter", "timestamp": Double(Date().timeIntervalSince1970 * 1000 - 3400)]
        ]
        resolve(sampleLogs)
    }

    @objc(clearQueryLogs:rejecter:)
    func clearQueryLogs(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        resolve(true)
    }

    @objc(getDnsSettings:rejecter:)
    func getDnsSettings(resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let settings: [String: Any] = [
            "upstreamDnsServers": ["94.140.14.14", "1.1.1.1", "8.8.8.8"],
            "blockingMode": "ADDRESS",
            "virtualDnsServer": "198.18.53.53"
        ]
        resolve(settings)
    }

    @objc(setDnsSettings:blockingModeStr:resolver:rejecter:)
    func setDnsSettings(upstreamServers: [String], blockingModeStr: String, resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        userDefaults?.set(upstreamServers, forKey: "upstream_dns_servers")
        userDefaults?.set(blockingModeStr, forKey: "blocking_mode")
        resolve(true)
    }
}
