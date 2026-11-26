import ExpoModulesCore
import NetworkExtension
import SafariServices
import UserNotifications
#if canImport(WidgetKit)
import WidgetKit
#endif

public class AdGuardVpnModule: Module {
  private let appGroupId = "group.com.fajostech.aegisguard"
  private let tunnelBundleId = "com.fajostech.aegisguard.PacketTunnel"
  private let safariBlockerId = "com.fajostech.aegisguard.SafariBlocker"
  private var statusObserver: NSObjectProtocol?

  private var sharedDefaults: UserDefaults {
    return UserDefaults(suiteName: appGroupId) ?? UserDefaults.standard
  }

  private let criticalAdDomains: [String] = [
    "googleads.g.doubleclick.net",
    "pubads.g.doubleclick.net",
    "pagead2.googlesyndication.com",
    "adservice.google.com",
    "doubleclick.net",
    "googlesyndication.com",
    "app-measurement.com",
    "google-analytics.com"
  ]

  private func sanitizeDomains(_ domains: [String]) -> [String] {
    return domains.filter { domain in
      let lower = domain.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
      for cad in criticalAdDomains {
        if lower == cad || lower.hasSuffix("." + cad) {
          return false
        }
      }
      return true
    }
  }

  /// Resolves the active DoH URL and bootstrap IPv4/IPv6 addresses based on user selection & entitlements
  private func getDnsConfiguration() -> (servers: [String], dohURL: String, description: String) {
    let isPremium = (sharedDefaults.object(forKey: "aegis_is_premium") == nil) || sharedDefaults.bool(forKey: "aegis_is_premium")
    if !isPremium {
      return (
        ["1.1.1.1", "1.0.0.1", "2606:4700:4700::1111", "2606:4700:4700::1001"],
        "https://cloudflare-dns.com/dns-query",
        "Aegis Guard Basic Privacy"
      )
    }

    let customServers = sharedDefaults.stringArray(forKey: "aegis_selected_dns_servers")
      ?? UserDefaults.standard.stringArray(forKey: "aegis_selected_dns_servers")
      ?? []
    let isFamily = sharedDefaults.bool(forKey: "aegis_family_protection")
      || UserDefaults.standard.bool(forKey: "aegis_family_protection")

    if let primary = customServers.first, !primary.isEmpty {
      if primary == "94.140.14.15" || primary == "94.140.15.16" {
        return (
          ["94.140.14.15", "94.140.15.16", "2a10:50c0::bad1:ff", "2a10:50c0::bad2:ff"],
          "https://dns-family.adguard-dns.com/dns-query",
          "Aegis Guard Family Shield"
        )
      } else if primary == "1.1.1.1" || primary == "1.0.0.1" {
        return (
          ["1.1.1.1", "1.0.0.1", "2606:4700:4700::1111", "2606:4700:4700::1001"],
          "https://cloudflare-dns.com/dns-query",
          "Aegis Guard - Cloudflare DNS"
        )
      } else if primary == "1.1.1.3" || primary == "1.0.0.3" {
        return (
          ["1.1.1.3", "1.0.0.3", "2606:4700:4700::1113", "2606:4700:4700::1003"],
          "https://family.cloudflare-dns.com/dns-query",
          "Aegis Guard - Cloudflare Family"
        )
      } else if primary == "8.8.8.8" || primary == "8.8.4.4" {
        return (
          ["8.8.8.8", "8.8.4.4", "2001:4860:4860::8888", "2001:4860:4860::8844"],
          "https://dns.google/dns-query",
          "Aegis Guard - Google DNS"
        )
      } else if primary == "9.9.9.9" || primary == "149.112.112.112" {
        return (
          ["9.9.9.9", "149.112.112.112", "2620:fe::fe", "2620:fe::9"],
          "https://dns.quad9.net/dns-query",
          "Aegis Guard - Quad9 DNS"
        )
      } else if primary == "94.140.14.14" || primary == "94.140.15.15" {
        return (
          ["94.140.14.14", "94.140.15.15", "2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff"],
          "https://dns.adguard-dns.com/dns-query",
          "Aegis Guard DNS (Default)"
        )
      } else {
        let doh = primary.starts(with: "https://") ? primary : "https://\\(primary)/dns-query"
        let lower = doh.lowercased()
        let ipOnlyServers = customServers.filter { srv in
          !srv.contains("://") && (srv.contains(".") || srv.contains(":")) && !srv.contains("/")
        }
        if lower.contains("nextdns.io") {
          let bootstrap = ipOnlyServers.isEmpty ? ["45.90.28.0", "45.90.30.0", "2a07:a8c0::", "2a07:a8c1::"] : ipOnlyServers
          return (bootstrap, doh, "Aegis Guard - NextDNS")
        } else if lower.contains("controld.com") {
          let bootstrap = ipOnlyServers.isEmpty ? ["76.76.2.0", "76.76.10.0", "2606:1a40::", "2606:1a40:1::"] : ipOnlyServers
          return (bootstrap, doh, "Aegis Guard - Control D")
        } else if lower.contains("adguard-dns.com") {
          let bootstrap = ipOnlyServers.isEmpty ? ["94.140.14.49", "94.140.14.59", "2a10:50c0::ded:ff", "2a10:50c0::dad:ff"] : ipOnlyServers
          return (bootstrap, doh, "Aegis Guard - Private DNS")
        }
        return (ipOnlyServers, doh, "Aegis Guard - Private DNS")
      }
    }

    if isFamily {
      return (
        ["94.140.14.15", "94.140.15.16", "2a10:50c0::bad1:ff", "2a10:50c0::bad2:ff"],
        "https://dns-family.adguard-dns.com/dns-query",
        "Aegis Guard Family Shield"
      )
    }

    return (
      ["94.140.14.14", "94.140.15.15", "2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff"],
      "https://dns.adguard-dns.com/dns-query",
      "Aegis Guard DNS (Default)"
    )
  }

  private func syncWidgetState(isRunning: Bool? = nil, activeProfileName: String? = nil, stats: [String: Any]? = nil) {
    let defaults = sharedDefaults
    if let running = isRunning {
      defaults.set(running, forKey: "widget_is_running")
    }
    if let name = activeProfileName {
      defaults.set(name, forKey: "widget_active_profile")
    }
    if let s = stats {
      if let blocked = s["blockedQueries"] as? NSNumber {
        defaults.set(blocked.intValue, forKey: "widget_blocked_queries")
      }
      if let total = s["totalQueries"] as? NSNumber {
        defaults.set(total.intValue, forKey: "widget_total_queries")
      }
      if let saved = s["dataSavedBytes"] as? NSNumber {
        defaults.set(saved.doubleValue, forKey: "widget_data_saved_bytes")
      }
      if let rate = s["blockRate"] as? NSNumber {
        defaults.set(rate.doubleValue, forKey: "widget_block_rate")
      }
    }
    defaults.synchronize()
    #if canImport(WidgetKit)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    #endif
  }

  private func findTunnelManager(completion: @escaping (NETunnelProviderManager?, Error?) -> Void) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error {
        completion(nil, error)
        return
      }
      let existing = managers?.first(where: { mgr in
        (mgr.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == self.tunnelBundleId
      }) ?? managers?.first
      completion(existing, nil)
    }
  }

  private func notifyTunnel(_ message: String) {
    findTunnelManager { manager, _ in
      guard let session = manager?.connection as? NETunnelProviderSession else { return }
      guard session.status == .connected || session.status == .connecting else { return }
      try? session.sendProviderMessage(Data(message.utf8)) { _ in }
    }
  }

  private func clearLegacyDnsProfileIfNeeded() {
    let dnsManager = NEDNSSettingsManager.shared()
    dnsManager.loadFromPreferences { error in
      guard error == nil, dnsManager.dnsSettings != nil else { return }
      dnsManager.removeFromPreferences { _ in }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("AdGuardVpnModule")

    Events("onVpnStateChanged", "onQueriesLogged", "onQueryLogged")

    OnCreate {
      self.statusObserver = NotificationCenter.default.addObserver(
        forName: .NEVPNStatusDidChange,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let self = self else { return }
        if let conn = notification.object as? NEVPNConnection {
          let active = conn.status == .connected || conn.status == .connecting
          self.syncWidgetState(isRunning: active)
          self.sendEvent("onVpnStateChanged", ["isRunning": active])
        }
      }
    }

    OnDestroy {
      if let observer = self.statusObserver {
        NotificationCenter.default.removeObserver(observer)
        self.statusObserver = nil
      }
    }

    AsyncFunction("isRunning") { (promise: Promise) in
      self.findTunnelManager { manager, error in
        if let error = error {
          promise.resolve(false)
          return
        }
        guard let manager = manager, manager.isEnabled else {
          self.syncWidgetState(isRunning: false)
          promise.resolve(false)
          return
        }
        let status = manager.connection.status
        let active = status == .connected || status == .connecting || status == .reasserting
        self.syncWidgetState(isRunning: active)
        promise.resolve(active)
      }
    }

    AsyncFunction("startVpn") { (promise: Promise) in
      self.clearLegacyDnsProfileIfNeeded()
      let config = self.getDnsConfiguration()

      self.findTunnelManager { existingManager, loadError in
        if let error = loadError {
          promise.reject("LOAD_ERROR", error.localizedDescription)
          return
        }

        let manager = existingManager ?? NETunnelProviderManager()
        let proto = (manager.protocolConfiguration as? NETunnelProviderProtocol) ?? NETunnelProviderProtocol()
        proto.providerBundleIdentifier = self.tunnelBundleId
        proto.serverAddress = "198.18.0.1"
        proto.providerConfiguration = ["appGroup": self.appGroupId]

        manager.protocolConfiguration = proto
        manager.localizedDescription = config.description
        manager.isEnabled = true

        let connectRule = NEOnDemandRuleConnect()
        connectRule.interfaceTypeMatch = .any
        manager.onDemandRules = [connectRule]
        manager.isOnDemandEnabled = true

        manager.saveToPreferences { saveError in
          if let error = saveError {
            promise.reject("SAVE_ERROR", error.localizedDescription)
            return
          }

          manager.loadFromPreferences { reloadError in
            if let error = reloadError {
              promise.reject("RELOAD_ERROR", error.localizedDescription)
              return
            }

            do {
              try manager.connection.startVPNTunnel()
              self.notifyTunnel("reload")
              self.syncWidgetState(isRunning: true, activeProfileName: config.description)
              self.sendEvent("onVpnStateChanged", ["isRunning": true])
              promise.resolve(true)
            } catch {
              promise.reject("START_ERROR", error.localizedDescription)
            }
          }
        }
      }
    }

    AsyncFunction("stopVpn") { (promise: Promise) in
      self.findTunnelManager { manager, _ in
        guard let manager = manager else {
          self.syncWidgetState(isRunning: false)
          self.sendEvent("onVpnStateChanged", ["isRunning": false])
          promise.resolve(true)
          return
        }

        manager.isOnDemandEnabled = false
        manager.saveToPreferences { _ in
          manager.connection.stopVPNTunnel()
          self.syncWidgetState(isRunning: false)
          self.sendEvent("onVpnStateChanged", ["isRunning": false])
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("getStatistics") { (promise: Promise) in
      let defaults = self.sharedDefaults
      let total = defaults.integer(forKey: "widget_total_queries")
      let blocked = defaults.integer(forKey: "widget_blocked_queries")
      let saved = defaults.double(forKey: "widget_data_saved_bytes")
      let rate = total > 0 ? ((Double(blocked) / Double(total)) * 1000.0).rounded() / 10.0 : 0.0

      let rawRules = defaults.string(forKey: "aegis_user_rules") ?? ""
      let userRuleCount = rawRules.components(separatedBy: .newlines).filter {
        let t = $0.trimmingCharacters(in: .whitespacesAndNewlines)
        return !t.isEmpty && !t.hasPrefix("!") && !t.hasPrefix("#")
      }.count
      let catCount = (defaults.stringArray(forKey: "aegis_category_domains") ?? []).count
      // 50+ built-in tunnel & Safari rules + user rules + active category domains
      let totalRuleCount = 54 + userRuleCount + catCount

      promise.resolve([
        "totalQueries": total,
        "blockedQueries": blocked,
        "dataSavedBytes": saved,
        "blockRate": rate,
        "ruleCount": totalRuleCount
      ])
    }

    AsyncFunction("getQueryLogs") { (promise: Promise) in
      if let data = self.sharedDefaults.data(forKey: "aegis_query_logs"),
         let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
        promise.resolve(decoded)
      } else {
        promise.resolve([])
      }
    }

    AsyncFunction("clearQueryLogs") { (promise: Promise) in
      let defaults = self.sharedDefaults
      defaults.removeObject(forKey: "aegis_query_logs")
      defaults.set(0, forKey: "widget_total_queries")
      defaults.set(0, forKey: "widget_blocked_queries")
      defaults.set(0.0, forKey: "widget_data_saved_bytes")
      defaults.set(0.0, forKey: "widget_block_rate")
      defaults.synchronize()
      self.notifyTunnel("clear_logs")
      self.syncWidgetState(stats: [
        "blockedQueries": 0,
        "totalQueries": 0,
        "dataSavedBytes": 0.0,
        "blockRate": 0.0
      ])
      promise.resolve(true)
    }

    AsyncFunction("getUserRules") { (promise: Promise) in
      let rules = self.sharedDefaults.string(forKey: "aegis_user_rules") ?? ""
      promise.resolve(rules)
    }

    AsyncFunction("saveUserRules") { (rulesText: String, promise: Promise) in
      self.sharedDefaults.set(rulesText, forKey: "aegis_user_rules")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("addCustomRule") { (rule: String, promise: Promise) in
      let trimmed = rule.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else {
        promise.resolve(false)
        return
      }
      var existing = self.sharedDefaults.string(forKey: "aegis_user_rules") ?? ""
      existing = existing.isEmpty ? trimmed : "\\(existing)\\n\\(trimmed)"
      self.sharedDefaults.set(existing, forKey: "aegis_user_rules")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("setDnsSettings") { (servers: [String], blockingMode: String, promise: Promise) in
      self.sharedDefaults.set(servers, forKey: "aegis_selected_dns_servers")
      self.sharedDefaults.set(blockingMode, forKey: "aegis_blocking_mode")
      UserDefaults.standard.set(servers, forKey: "aegis_selected_dns_servers")
      UserDefaults.standard.set(blockingMode, forKey: "aegis_blocking_mode")

      let isFamily = servers.contains("94.140.14.15") || servers.contains("1.1.1.3")
      self.sharedDefaults.set(isFamily, forKey: "aegis_family_protection")
      UserDefaults.standard.set(isFamily, forKey: "aegis_family_protection")
      self.sharedDefaults.synchronize()

      let config = self.getDnsConfiguration()
      self.syncWidgetState(activeProfileName: config.description)
      self.notifyTunnel("reload")

      self.findTunnelManager { manager, _ in
        if let manager = manager {
          manager.localizedDescription = config.description
          manager.saveToPreferences { _ in
            promise.resolve(true)
          }
        } else {
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("setCategoryDomains") { (domains: [String], promise: Promise) in
      let clean = domains.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty }
      self.sharedDefaults.set(clean, forKey: "aegis_category_domains")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("setBedtimeSchedule") { (enabled: Bool, startHour: Int, endHour: Int, domains: [String], promise: Promise) in
      let clean = domains.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty }
      self.sharedDefaults.set(enabled, forKey: "aegis_schedule_enabled")
      self.sharedDefaults.set(startHour, forKey: "aegis_schedule_start_hour")
      self.sharedDefaults.set(endHour, forKey: "aegis_schedule_end_hour")
      self.sharedDefaults.set(clean, forKey: "aegis_schedule_domains")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("setExcludedDomains") { (domains: [String], promise: Promise) in
      let safeDomains = self.sanitizeDomains(domains)
      self.sharedDefaults.set(safeDomains, forKey: "aegis_excluded_domains")
      UserDefaults.standard.set(safeDomains, forKey: "aegis_excluded_domains")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("isSafeSearchEnabled") { (promise: Promise) in
      promise.resolve(self.sharedDefaults.bool(forKey: "aegis_safe_search"))
    }

    AsyncFunction("setSafeSearchEnabled") { (enabled: Bool, promise: Promise) in
      self.sharedDefaults.set(enabled, forKey: "aegis_safe_search")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("isThreatAlertsEnabled") { (promise: Promise) in
      if self.sharedDefaults.object(forKey: "aegis_threat_alerts") != nil {
        promise.resolve(self.sharedDefaults.bool(forKey: "aegis_threat_alerts"))
      } else {
        promise.resolve(true)
      }
    }

    AsyncFunction("setThreatAlertsEnabled") { (enabled: Bool, promise: Promise) in
      self.sharedDefaults.set(enabled, forKey: "aegis_threat_alerts")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      if enabled {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
          promise.resolve(true)
        }
      } else {
        promise.resolve(true)
      }
    }

    AsyncFunction("requestNotificationPermission") { (promise: Promise) in
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
        promise.resolve(granted)
      }
    }

    AsyncFunction("isParentalLockEnabled") { (promise: Promise) in
      promise.resolve(self.sharedDefaults.bool(forKey: "aegis_parental_lock"))
    }

    AsyncFunction("setParentalLockEnabled") { (enabled: Bool, promise: Promise) in
      self.sharedDefaults.set(enabled, forKey: "aegis_parental_lock")
      self.sharedDefaults.synchronize()
      promise.resolve(true)
    }

    AsyncFunction("isFamilyProtectionEnabled") { (promise: Promise) in
      let isFamily = self.sharedDefaults.bool(forKey: "aegis_family_protection")
        || UserDefaults.standard.bool(forKey: "aegis_family_protection")
      promise.resolve(isFamily)
    }

    AsyncFunction("setFamilyProtectionEnabled") { (enabled: Bool, promise: Promise) in
      self.sharedDefaults.set(enabled, forKey: "aegis_family_protection")
      UserDefaults.standard.set(enabled, forKey: "aegis_family_protection")
      let servers = enabled ? ["94.140.14.15", "94.140.15.16"] : ["94.140.14.14", "94.140.15.15"]
      self.sharedDefaults.set(servers, forKey: "aegis_selected_dns_servers")
      UserDefaults.standard.set(servers, forKey: "aegis_selected_dns_servers")
      self.sharedDefaults.synchronize()

      let config = self.getDnsConfiguration()
      self.syncWidgetState(activeProfileName: config.description)
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("isLicensePremium") { (promise: Promise) in
      if self.sharedDefaults.object(forKey: "aegis_is_premium") != nil {
        promise.resolve(self.sharedDefaults.bool(forKey: "aegis_is_premium"))
      } else {
        promise.resolve(true)
      }
    }

    AsyncFunction("setLicenseState") { (isPremium: Bool, promise: Promise) in
      self.sharedDefaults.set(isPremium, forKey: "aegis_is_premium")
      UserDefaults.standard.set(isPremium, forKey: "aegis_is_premium")
      self.sharedDefaults.synchronize()
      self.notifyTunnel("reload")
      promise.resolve(true)
    }

    AsyncFunction("testDomainFilter") { (domain: String, promise: Promise) in
      let lower = domain.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

      let cats = self.sharedDefaults.stringArray(forKey: "aegis_category_domains") ?? []
      if let catHit = cats.first(where: { lower == $0 || lower.hasSuffix("." + $0) }) {
        promise.resolve([
          "domain": domain,
          "isBlocked": true,
          "matchedRule": "||\\(catHit)^$category",
          "isRewrite": false,
          "rewriteIp": ""
        ])
        return
      }

      let rawRules = self.sharedDefaults.string(forKey: "aegis_user_rules") ?? ""
      for line in rawRules.components(separatedBy: .newlines) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("@@||") {
          let allowed = trimmed.dropFirst(4).split(separator: "^").first.map(String.init)?.lowercased() ?? ""
          if !allowed.isEmpty && (lower == allowed || lower.hasSuffix("." + allowed)) {
            promise.resolve([
              "domain": domain,
              "isBlocked": false,
              "matchedRule": trimmed,
              "isRewrite": false,
              "rewriteIp": ""
            ])
            return
          }
        } else if trimmed.hasPrefix("||") {
          let blocked = trimmed.dropFirst(2).split(separator: "^").first.map(String.init)?.lowercased() ?? ""
          if !blocked.isEmpty && (lower == blocked || lower.hasSuffix("." + blocked)) {
            promise.resolve([
              "domain": domain,
              "isBlocked": true,
              "matchedRule": trimmed,
              "isRewrite": false,
              "rewriteIp": ""
            ])
            return
          }
        }
      }

      let knownBad = [
        "doubleclick.net",
        "googleads.g.doubleclick.net",
        "pubads.g.doubleclick.net",
        "adserver.yahoo.com",
        "ads.yahoo.com",
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
        "coinhive.com",
        "pagead2.googlesyndication.com",
        "adservice.google.com",
        "app-measurement.com",
        "google-analytics.com",
        "admob.com"
      ]
      let isBlocked = knownBad.contains { lower == $0 || lower.hasSuffix("." + $0) }
      promise.resolve([
        "domain": domain,
        "isBlocked": isBlocked,
        "matchedRule": isBlocked ? "||\\(domain)^$important" : "",
        "isRewrite": false,
        "rewriteIp": ""
      ])
    }

    AsyncFunction("isDnsProfileInstalled") { (promise: Promise) in
      self.findTunnelManager { manager, error in
        promise.resolve(error == nil && manager?.isEnabled == true)
      }
    }

    AsyncFunction("getSafariBlockerStatus") { (promise: Promise) in
      SFContentBlockerManager.getStateOfContentBlocker(withIdentifier: self.safariBlockerId) { state, error in
        if error != nil {
          promise.resolve(false)
        } else {
          promise.resolve(state?.isEnabled ?? false)
        }
      }
    }

    AsyncFunction("reloadSafariBlocker") { (rulesJson: String, promise: Promise) in
      if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupId) {
        let targetURL = containerURL.appendingPathComponent("blockerList.json")
        do {
          try rulesJson.write(to: targetURL, atomically: true, encoding: .utf8)
        } catch {
          promise.resolve(false)
          return
        }
      }
      SFContentBlockerManager.reloadContentBlocker(withIdentifier: self.safariBlockerId) { error in
        promise.resolve(error == nil)
      }
    }

    AsyncFunction("updateWidgetStats") { (stats: [String: Any], promise: Promise) in
      let config = self.getDnsConfiguration()
      self.syncWidgetState(activeProfileName: config.description, stats: stats)
      promise.resolve(true)
    }
  }
}
