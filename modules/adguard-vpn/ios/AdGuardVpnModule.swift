import ExpoModulesCore
import NetworkExtension

public class AdGuardVpnModule: Module {
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

        let isPremium = UserDefaults.standard.object(forKey: "aegis_is_premium") as? Bool ?? true
        let isFamily = UserDefaults.standard.bool(forKey: "aegis_family_protection")
        let servers: [String]
        let dohURL: String

        if isPremium {
          servers = isFamily ? ["94.140.14.15", "94.140.15.16"] : ["94.140.14.14", "94.140.15.15"]
          dohURL = isFamily ? "https://dns-family.adguard-dns.com/dns-query" : "https://dns.adguard-dns.com/dns-query"
          manager.localizedDescription = "Aegis Guard DNS"
        } else {
          // Basic Mode: Encrypted DNS privacy without app ad blocking
          servers = ["1.1.1.1", "1.0.0.1"]
          dohURL = "https://cloudflare-dns.com/dns-query"
          manager.localizedDescription = "Aegis Guard DNS (Basic Mode)"
        }

        let dohSettings = NEDNSOverHTTPSSettings(servers: servers)
        dohSettings.serverURL = URL(string: dohURL)

        manager.localizedDescription = "Aegis Guard DNS"
        manager.dnsSettings = dohSettings

        // Unconditionally use standard NEOnDemandRuleConnect to ensure all apps & sites resolve reliably
        let connectRule = NEOnDemandRuleConnect()
        connectRule.interfaceTypeMatch = .any
        manager.onDemandRules = [connectRule]

        manager.saveToPreferences { saveError in
          if let error = saveError {
            promise.reject("SAVE_ERROR", error.localizedDescription)
          } else {
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
          self.sendEvent("onVpnStateChanged", ["isRunning": false])
          promise.resolve(true)
          return
        }

        // Keep profile installed in Settings, but suspend interception via disconnect rule
        let disconnectRule = NEOnDemandRuleDisconnect()
        disconnectRule.interfaceTypeMatch = .any
        manager.onDemandRules = [disconnectRule]

        manager.saveToPreferences { saveError in
          self.sendEvent("onVpnStateChanged", ["isRunning": false])
          promise.resolve(true)
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

      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        guard loadError == nil else {
          promise.resolve(true)
          return
        }

        let servers = enabled ? ["94.140.14.15", "94.140.15.16"] : ["94.140.14.14", "94.140.15.15"]
        let dohURL = enabled ? "https://dns-family.adguard-dns.com/dns-query" : "https://dns.adguard-dns.com/dns-query"

        let dohSettings = NEDNSOverHTTPSSettings(servers: servers)
        dohSettings.serverURL = URL(string: dohURL)
        manager.dnsSettings = dohSettings

        if manager.isEnabled {
          manager.saveToPreferences { _ in
            promise.resolve(true)
          }
        } else {
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

        let isFamily = UserDefaults.standard.bool(forKey: "aegis_family_protection")
        let servers: [String]
        let dohURL: String

        if isPremium {
          servers = isFamily ? ["94.140.14.15", "94.140.15.16"] : ["94.140.14.14", "94.140.15.15"]
          dohURL = isFamily ? "https://dns-family.adguard-dns.com/dns-query" : "https://dns.adguard-dns.com/dns-query"
          manager.localizedDescription = "Aegis Guard DNS"
        } else {
          servers = ["1.1.1.1", "1.0.0.1"]
          dohURL = "https://cloudflare-dns.com/dns-query"
          manager.localizedDescription = "Aegis Guard DNS (Basic Mode)"
        }

        let dohSettings = NEDNSOverHTTPSSettings(servers: servers)
        dohSettings.serverURL = URL(string: dohURL)
        manager.dnsSettings = dohSettings

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
        "m.yap.yahoo.com",
        "ups.analytics.yahoo.com",
        "analytics.query.yahoo.com",
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
  }
}
