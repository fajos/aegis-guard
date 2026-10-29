import ExpoModulesCore
import NetworkExtension

public class AdGuardVpnModule: Module {
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

        // Configure system-wide Encrypted DNS (DoH) targeting AdGuard Ad-Blocking DNS
        let dohSettings = NEDNSOverHTTPSSettings(servers: ["94.140.14.14", "94.140.15.15"])
        dohSettings.serverURL = URL(string: "https://dns.adguard-dns.com/dns-query")

        manager.localizedDescription = "Aegis Guard DNS"
        manager.dnsSettings = dohSettings

        // Build on-demand rules: exception rules (.neverConnect) + connect rule
        var rules: [NEOnDemandRule] = []
        let excluded = UserDefaults.standard.stringArray(forKey: "aegis_excluded_domains") ?? []
        if !excluded.isEmpty {
          let evalRule = NEEvaluateConnectionRule(matchDomains: excluded, andAction: .neverConnect)
          let onDemandEval = NEOnDemandRuleEvaluateConnection()
          onDemandEval.interfaceTypeMatch = .any
          onDemandEval.connectionRules = [evalRule]
          rules.append(onDemandEval)
        }

        let connectRule = NEOnDemandRuleConnect()
        connectRule.interfaceTypeMatch = .any
        rules.append(connectRule)

        manager.onDemandRules = rules

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
      UserDefaults.standard.set(domains, forKey: "aegis_excluded_domains")

      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        guard loadError == nil else {
          promise.resolve(true)
          return
        }

        let isPaused = manager.onDemandRules?.first is NEOnDemandRuleDisconnect
        if manager.isEnabled && !isPaused {
          var rules: [NEOnDemandRule] = []
          if !domains.isEmpty {
            let evalRule = NEEvaluateConnectionRule(matchDomains: domains, andAction: .neverConnect)
            let onDemandEval = NEOnDemandRuleEvaluateConnection()
            onDemandEval.interfaceTypeMatch = .any
            onDemandEval.connectionRules = [evalRule]
            rules.append(onDemandEval)
          }

          let connectRule = NEOnDemandRuleConnect()
          connectRule.interfaceTypeMatch = .any
          rules.append(connectRule)

          manager.onDemandRules = rules
          manager.saveToPreferences { _ in
            promise.resolve(true)
          }
        } else {
          promise.resolve(true)
        }
      }
    }
  }
}
