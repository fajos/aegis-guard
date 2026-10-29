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
          promise.resolve(manager.isEnabled)
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

        manager.dnsSettings = dohSettings
        manager.isEnabled = true

        manager.saveToPreferences { saveError in
          if let error = saveError {
            promise.reject("SAVE_ERROR", error.localizedDescription)
          } else {
            self.sendEvent("onVpnStateChanged", ["isRunning": true])
            promise.resolve(true)
          }
        }
      }
    }

    AsyncFunction("stopVpn") { (promise: Promise) in
      let manager = NEDNSSettingsManager.shared()
      manager.loadFromPreferences { loadError in
        if let error = loadError {
          promise.reject("LOAD_ERROR", error.localizedDescription)
          return
        }

        manager.isEnabled = false
        manager.dnsSettings = nil

        manager.saveToPreferences { saveError in
          if let error = saveError {
            promise.reject("SAVE_ERROR", error.localizedDescription)
          } else {
            self.sendEvent("onVpnStateChanged", ["isRunning": false])
            promise.resolve(true)
          }
        }
      }
    }
  }
}
