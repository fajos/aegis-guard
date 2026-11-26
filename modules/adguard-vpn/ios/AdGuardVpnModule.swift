import ExpoModulesCore
import NetworkExtension
import SafariServices
#if canImport(WidgetKit)
import WidgetKit
#endif

public class AdGuardVpnModule: Module {
  private let appGroupId = "group.com.fajostech.aegisguard"
  private let safariBlockerId = "com.fajostech.aegisguard.SafariBlocker"
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
    let customServers = UserDefaults.standard.stringArray(forKey: "aegis_selected_dns_servers") ?? []
    let isFamily = UserDefaults.standard.bool(forKey: "aegis_family_protection")

    // 1. Explicitly configured server list takes precedence
    if let primary = customServers.first {
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
        let doh = primary.starts(with: "https://") ? primary : "https://\(primary)/dns-query"
        let lower = doh.lowercased()
        // Filter bootstrap list strictly to IP addresses so NEDNSOverHTTPSSettings never gets URLs in `servers`
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

    // 2. If no custom servers are set, check Family Shield flag
    if isFamily {
      return (
        ["94.140.14.15", "94.140.15.16", "2a10:50c0::bad1:ff", "2a10:50c0::bad2:ff"],
        "https://dns-family.adguard-dns.com/dns-query",
        "Aegis Guard Family Shield"
      )
    }

    // 3. Fallback default: Aegis Secure / AdGuard Public Anycast DNS with full dual-stack IPv4/IPv6 bootstrap
    return (
      ["94.140.14.14", "94.140.15.15", "2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff"],
      "https://dns.adguard-dns.com/dns-query",
      "Aegis Guard DNS (Default)"
    )
  }

  private func syncWidgetState(isRunning: Bool? = nil, activeProfileName: String? = nil, stats: [String: Any]? = nil) {
    guard let sharedDefaults = UserDefaults(suiteName: appGroupId) else { return }
    if let running = isRunning {
      sharedDefaults.set(running, forKey: "widget_is_running")
    }
    if let name = activeProfileName {
      sharedDefaults.set(name, forKey: "widget_active_profile")
    }
    if let s = stats {
      if let blocked = s["blockedQueries"] as? NSNumber {
        sharedDefaults.set(blocked.intValue, forKey: "widget_blocked_queries")
      }
      if let total = s["totalQueries"] as? NSNumber {
        sharedDefaults.set(total.intValue, forKey: "widget_total_queries")
      }
      if let saved = s["dataSavedBytes"] as? NSNumber {
        sharedDefaults.set(saved.doubleValue, forKey: "widget_data_saved_bytes")
      }
      if let rate = s["blockRate"] as? NSNumber {
        sharedDefaults.set(rate.doubleValue, forKey: "widget_block_rate")
      }
    }
    sharedDefaults.synchronize()
    #if canImport(WidgetKit)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    #endif
  }

  public func definition() -> ModuleDefinition {
    Name("AdGuardVpnModule")

    Events("onVpnStateChanged")

    AsyncFunction("isRunning") { (promise: Promise) in
      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { error in
        if error != nil {
          promise.resolve(false)
        } else {
          guard manager.isEnabled else {
            promise.resolve(false)
            return
          }
          // If enabled in iOS Settings, check if paused via disconnect rule
          let isPaused = manager.onDemandRules?.first is NEOnDemandRuleDisconnect
          promise.resolve(!isPaused)
        }
      }
    }

    AsyncFunction("startVpn") { (promise: Promise) in
      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        if let error = loadError {
          promise.reject("LOAD_ERROR", error.localizedDescription)
          return
        }

        let config = self.getDnsConfiguration()
        let dohSettings = NEDNSOverHTTPSSettings(servers: config.servers)
        dohSettings.serverURL = URL(string: config.dohURL)

        manager.localizedDescription = config.description
        manager.dnsSettings = dohSettings

        // In NEDNSSettingsManager, onDemandRules must be nil for the DNS profile to apply unconditionally to all networks.
        // NEOnDemandRuleConnect is exclusively for VPN tunnels and causes mDNSResponder to stall waiting for a tunnel.
        manager.onDemandRules = nil

        manager.saveToPreferences { saveError in
          if let error = saveError {
            promise.reject("SAVE_ERROR", error.localizedDescription)
          } else {
            self.syncWidgetState(isRunning: manager.isEnabled, activeProfileName: config.description)
            self.sendEvent("onVpnStateChanged", ["isRunning": manager.isEnabled])
            promise.resolve(manager.isEnabled)
          }
        }
      }
    }

    AsyncFunction("stopVpn") { (promise: Promise) in
      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        if let error = loadError {
          self.syncWidgetState(isRunning: false)
          self.sendEvent("onVpnStateChanged", ["isRunning": false])
          promise.resolve(true)
          return
        }

        // Keep profile registered in iOS Settings, but suspend DoH routing via disconnect rule
        let disconnectRule = NEOnDemandRuleDisconnect()
        disconnectRule.interfaceTypeMatch = .any
        manager.onDemandRules = [disconnectRule]

        manager.saveToPreferences { saveError in
          self.syncWidgetState(isRunning: false)
          self.sendEvent("onVpnStateChanged", ["isRunning": false])
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("setDnsSettings") { (servers: [String], blockingMode: String, promise: Promise) in
      UserDefaults.standard.set(servers, forKey: "aegis_selected_dns_servers")
      UserDefaults.standard.set(blockingMode, forKey: "aegis_blocking_mode")

      let isFamily = servers.contains("94.140.14.15") || servers.contains("1.1.1.3")
      UserDefaults.standard.set(isFamily, forKey: "aegis_family_protection")

      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        guard loadError == nil else {
          promise.resolve(false)
          return
        }

        let config = self.getDnsConfiguration()
        let dohSettings = NEDNSOverHTTPSSettings(servers: config.servers)
        dohSettings.serverURL = URL(string: config.dohURL)
        manager.dnsSettings = dohSettings
        manager.localizedDescription = config.description

        let isPaused = manager.onDemandRules?.first is NEOnDemandRuleDisconnect
        if !isPaused {
          manager.onDemandRules = nil
        }

        manager.saveToPreferences { saveError in
          if saveError == nil {
            self.syncWidgetState(activeProfileName: config.description)
          }
          promise.resolve(saveError == nil)
        }
      }
    }

    AsyncFunction("setExcludedDomains") { (domains: [String], promise: Promise) in
      let safeDomains = self.sanitizeDomains(domains)
      UserDefaults.standard.set(safeDomains, forKey: "aegis_excluded_domains")
      promise.resolve(true)
    }

    AsyncFunction("isFamilyProtectionEnabled") { (promise: Promise) in
      let isFamily = UserDefaults.standard.bool(forKey: "aegis_family_protection")
      promise.resolve(isFamily)
    }

    AsyncFunction("setFamilyProtectionEnabled") { (enabled: Bool, promise: Promise) in
      UserDefaults.standard.set(enabled, forKey: "aegis_family_protection")
      if enabled {
        UserDefaults.standard.set(["94.140.14.15", "94.140.15.16"], forKey: "aegis_selected_dns_servers")
      } else {
        UserDefaults.standard.set(["94.140.14.14", "94.140.15.15"], forKey: "aegis_selected_dns_servers")
      }

      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        guard loadError == nil else {
          promise.resolve(true)
          return
        }

        let config = self.getDnsConfiguration()
        let dohSettings = NEDNSOverHTTPSSettings(servers: config.servers)
        dohSettings.serverURL = URL(string: config.dohURL)
        manager.dnsSettings = dohSettings
        manager.localizedDescription = config.description

        let isPaused = manager.onDemandRules?.first is NEOnDemandRuleDisconnect
        if !isPaused {
          manager.onDemandRules = nil
        }

        manager.saveToPreferences { _ in
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("setLicenseState") { (isPremium: Bool, promise: Promise) in
      UserDefaults.standard.set(isPremium, forKey: "aegis_is_premium")

      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        guard loadError == nil else {
          promise.resolve(true)
          return
        }

        let config = self.getDnsConfiguration()
        let dohSettings = NEDNSOverHTTPSSettings(servers: config.servers)
        dohSettings.serverURL = URL(string: config.dohURL)
        manager.dnsSettings = dohSettings
        manager.localizedDescription = config.description

        let isPaused = manager.onDemandRules?.first is NEOnDemandRuleDisconnect
        if !isPaused {
          manager.onDemandRules = nil
        }

        if manager.isEnabled {
          manager.saveToPreferences { _ in
            promise.resolve(true)
          }
        } else {
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("testDomainFilter") { (domain: String, promise: Promise) in
      let lower = domain.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
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
      let result: [String: Any] = [
        "domain": domain,
        "isBlocked": isBlocked,
        "matchedRule": isBlocked ? "||\(domain)^$important" : "",
        "isRewrite": false,
        "rewriteIp": ""
      ]
      promise.resolve(result)
    }

    AsyncFunction("isDnsProfileInstalled") { (promise: Promise) in
      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { error in
        promise.resolve(error == nil && manager.isEnabled)
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
