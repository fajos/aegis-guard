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
        .containerBackground(for: .widget) {
            Color(red: 0.01, green: 0.04, blue: 0.13)
        }
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
    static var description = IntentDescription("Activates system-wide encrypted DNS ad & tracker protection.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let manager = NEDNSSettingsManager.shared()
        try await manager.loadFromPreferences()
        manager.onDemandRules = nil
        try await manager.saveToPreferences()
        return .result(dialog: "Aegis Guard encrypted DNS protection is now enabled.")
    }
}

@available(iOS 16.0, *)
struct PauseAegisShieldIntent: AppIntent {
    static var title: LocalizedStringResource = "Pause Aegis Guard Shield"
    static var description = IntentDescription("Temporarily suspends encrypted DNS filtering so game rewarded ads can load.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let manager = NEDNSSettingsManager.shared()
        try await manager.loadFromPreferences()
        let disconnectRule = NEOnDemandRuleDisconnect()
        disconnectRule.interfaceTypeMatch = .any
        manager.onDemandRules = [disconnectRule]
        try await manager.saveToPreferences()
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

function createEntitlementsPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
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

  const mainTarget = proj.getFirstTarget();
  if (mainTarget && mainTarget.uuid) {
    proj.addTargetDependency(mainTarget.uuid, [target.uuid]);
  }

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

    return config;
  });
}

function withAdguardIosExtensions(config) {
  config = withAdguardIosFiles(config);
  config = withAdguardIosXcode(config);
  return config;
}

module.exports = createRunOncePlugin(withAdguardIosExtensions, 'withAdguardIosExtensions', '1.0.0');
