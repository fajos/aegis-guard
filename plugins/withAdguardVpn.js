let withAndroidManifest, withEntitlementsPlist, withStringsXml, withGradleProperties, withMainApplication, withAppBuildGradle, createRunOncePlugin;

try {
  const plugins = require('expo/config-plugins');
  withAndroidManifest = plugins.withAndroidManifest;
  withEntitlementsPlist = plugins.withEntitlementsPlist;
  withStringsXml = plugins.withStringsXml;
  withGradleProperties = plugins.withGradleProperties;
  withMainApplication = plugins.withMainApplication;
  withAppBuildGradle = plugins.withAppBuildGradle;
  createRunOncePlugin = plugins.createRunOncePlugin;
} catch (e) {
  // Fallback when @expo/config-plugins is not yet installed in node_modules
  createRunOncePlugin = (fn) => fn;
}

/**
 * Expo Config Plugin for AdGuard Local VPN & NetworkExtension.
 *
 * Configures AndroidManifest.xml with LocalVpnService (android.net.VpnService),
 * Quick Settings Tile, Watchdog Service, Boot Receiver, and special-use FGS permissions.
 * Configures iOS entitlements with NetworkExtension packet-tunnel and App Groups.
 * Injects packaging options into gradle.properties to resolve multi-release JAR META-INF collisions.
 * Injects AdGuardVpnPackage registration into MainApplication.kt and app/build.gradle.
 */
function withAdguardAndroid(config) {
  if (!withAndroidManifest) return config;
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    // 1. Ensure permissions
    const permissions = [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.permission.QUERY_ALL_PACKAGES',
    ];

    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    permissions.forEach((perm) => {
      if (!androidManifest['uses-permission'].some((p) => p.$['android:name'] === perm)) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });

    // 2. Configure Application Services
    const app = androidManifest.application[0];
    if (!app.service) app.service = [];
    if (!app.receiver) app.receiver = [];

    // Local VPN Service
    const vpnServiceName = 'com.fajostech.aegisguard.vpn.LocalVpnService';
    if (!app.service.some((s) => s.$['android:name'] === vpnServiceName)) {
      app.service.push({
        $: {
          'android:name': vpnServiceName,
          'android:description': '@string/vpn_service_desc',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
          'android:permission': 'android.permission.BIND_VPN_SERVICE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.net.VpnService' } }],
          },
        ],
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Local VPN for DNS content filtering and privacy protection',
            },
          },
        ],
      });
    }

    // Watchdog Service
    const watchdogName = 'com.fajostech.aegisguard.vpn.WatchdogService';
    if (!app.service.some((s) => s.$['android:name'] === watchdogName)) {
      app.service.push({
        $: {
          'android:name': watchdogName,
          'android:exported': 'false',
        },
      });
    }

    // Quick Settings Tile
    const tileServiceName = 'com.fajostech.aegisguard.vpn.AdguardTileService';
    if (!app.service.some((s) => s.$['android:name'] === tileServiceName)) {
      app.service.push({
        $: {
          'android:name': tileServiceName,
          'android:icon': '@android:drawable/ic_lock_lock',
          'android:label': 'Aegis Guard',
          'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }],
          },
        ],
      });
    }

    // Boot Receiver
    const bootReceiverName = 'com.fajostech.aegisguard.vpn.BootUpReceiver';
    if (!app.receiver.some((r) => r.$['android:name'] === bootReceiverName)) {
      app.receiver.push({
        $: {
          'android:name': bootReceiverName,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
            ],
          },
        ],
      });
    }

    return config;
  });
}

function withAdguardStrings(config) {
  if (!withStringsXml) return config;
  return withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];
    if (!strings.some((s) => s.$.name === 'vpn_service_desc')) {
      strings.push({
        $: { name: 'vpn_service_desc' },
        _: 'Aegis Guard Local VPN for DNS content filtering and privacy protection',
      });
    }
    config.modResults.resources.string = strings;
    return config;
  });
}

function withAdguardPackagingProperties(config) {
  if (!withGradleProperties) return config;
  return withGradleProperties(config, (config) => {
    const props = [
      {
        type: 'property',
        key: 'android.packagingOptions.pickFirsts',
        value: '**/MANIFEST.MF,META-INF/versions/9/OSGI-INF/MANIFEST.MF',
      },
      {
        type: 'property',
        key: 'android.packagingOptions.excludes',
        value: 'META-INF/versions/9/OSGI-INF/MANIFEST.MF,META-INF/DEPENDENCIES,META-INF/LICENSE*,META-INF/NOTICE*',
      },
    ];
    props.forEach((p) => {
      const idx = config.modResults.findIndex((item) => item.key === p.key);
      if (idx !== -1) {
        config.modResults[idx] = p;
      } else {
        config.modResults.push(p);
      }
    });
    return config;
  });
}

function withAdguardMainApplication(config) {
  if (!withMainApplication) return config;
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('import com.fajostech.aegisguard.bridge.AdGuardVpnPackage')) {
      contents = contents.replace(
        /(package [^\n]+)/,
        `$1\n\nimport com.fajostech.aegisguard.bridge.AdGuardVpnPackage`
      );
    }
    if (!contents.includes('add(AdGuardVpnPackage())')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{([\s\S]*?)\}/,
        `PackageList(this).packages.apply {\n              add(AdGuardVpnPackage())\n            }`
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

function withAdguardAppBuildGradle(config) {
  if (!withAppBuildGradle) return config;
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes("project(':adguard-vpn')")) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation project(':adguard-vpn')`
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

function withAdguardIos(config) {
  if (!withEntitlementsPlist) return config;
  return withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.networking.networkextension'] = ['packet-tunnel'];
    config.modResults['com.apple.security.application-groups'] = ['group.com.fajostech.aegisguard'];
    return config;
  });
}

function withAdguardVpn(config) {
  config = withAdguardAndroid(config);
  config = withAdguardStrings(config);
  config = withAdguardPackagingProperties(config);
  config = withAdguardMainApplication(config);
  config = withAdguardAppBuildGradle(config);
  config = withAdguardIos(config);
  return config;
}

module.exports = createRunOncePlugin(withAdguardVpn, 'withAdguardVpn', '1.0.0');
