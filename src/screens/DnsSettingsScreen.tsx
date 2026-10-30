import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdGuardVpn } from '../native/AdGuardVpnModule';

interface PresetServer {
  name: string;
  servers: string[];
  description: string;
}

const PRESET_PROVIDERS: PresetServer[] = [
  {
    name: 'Aegis Secure DNS (Default)',
    servers: ['94.140.14.14', '94.140.15.15'],
    description: 'Ultra-fast Anycast resolvers blocking ads, trackers, and malicious scripts',
  },
  {
    name: 'Aegis Family Shield',
    servers: ['94.140.14.15', '94.140.15.16'],
    description: 'Blocks adult & explicit websites, enforces SafeSearch, plus ad-blocking',
  },
  {
    name: 'Cloudflare DNS',
    servers: ['1.1.1.1', '1.0.0.1'],
    description: 'Ultra-fast privacy-first recursive resolver with zero-logging guarantee',
  },
  {
    name: 'Cloudflare Family (1.1.1.3)',
    servers: ['1.1.1.3', '1.0.0.3'],
    description: 'Cloudflare resolver with automated malware and adult content blocking',
  },
  {
    name: 'Google Public DNS',
    servers: ['8.8.8.8', '8.8.4.4'],
    description: 'High-availability global resolver operated by Google',
  },
  {
    name: 'Quad9 DNS',
    servers: ['9.9.9.9', '149.112.112.112'],
    description: 'Non-profit security resolver blocking malicious malware domains',
  },
];

// In-memory cache for instant DNS configuration rendering
let cachedServers: string[] = ['94.140.14.14', '1.1.1.1'];
let cachedBlockingMode: 'ADDRESS' | 'NXDOMAIN' | 'REFUSED' = 'ADDRESS';

interface DnsSettingsScreenProps {
  isNested?: boolean;
}

export const DnsSettingsScreen: React.FC<DnsSettingsScreenProps> = ({ isNested = false }) => {
  const [selectedServers, setSelectedServers] = useState<string[]>(cachedServers);
  const [customServer, setCustomServer] = useState('');
  const [blockingMode, setBlockingMode] = useState<'ADDRESS' | 'NXDOMAIN' | 'REFUSED'>(cachedBlockingMode);
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  const handleRunSpeedTest = async () => {
    setIsBenchmarking(true);
    try {
      if (!AdGuardVpn) return;
      const allPrimaryServers = PRESET_PROVIDERS.map((p) => p.servers[0]);
      const results = await AdGuardVpn.benchmarkDnsServers(allPrimaryServers);
      const map: Record<string, number> = {};
      results.forEach((r) => {
        if (r.latencyMs > 0) {
          map[r.server] = r.latencyMs;
        }
      });
      setBenchmarks(map);
    } catch (e: any) {
      console.warn('[DNS Benchmark] Notice:', e?.message || e);
      Alert.alert(
        'Rebuild Required',
        'The DNS Radar Speed Test requires the newly compiled APK binary because it uses native UDP sockets. Please rebuild your APK (e.g. via "eas build") to activate this feature on your device.'
      );
    } finally {
      setIsBenchmarking(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!AdGuardVpn) return;
        const cfg = await AdGuardVpn.getDnsSettings();
        if (cfg) {
          const servers = cfg.upstreamDnsServers || ['94.140.14.14'];
          const mode = cfg.blockingMode || 'ADDRESS';
          cachedServers = servers;
          cachedBlockingMode = mode;
          setSelectedServers(servers);
          setBlockingMode(mode);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const handleSelectPreset = (preset: PresetServer) => {
    setSelectedServers(preset.servers);
  };

  const handleAddCustom = () => {
    const trimmed = customServer.trim();
    if (!trimmed) return;
    if (!selectedServers.includes(trimmed)) {
      setSelectedServers([...selectedServers, trimmed]);
      setCustomServer('');
    }
  };

  const handleRemoveServer = (server: string) => {
    if (selectedServers.length <= 1) {
      Alert.alert('Required', 'At least one upstream DNS server must remain configured.');
      return;
    }
    setSelectedServers(selectedServers.filter((s) => s !== server));
  };

  const handleSave = async () => {
    try {
      await AdGuardVpn.setDnsSettings(selectedServers, blockingMode);
      cachedServers = selectedServers;
      cachedBlockingMode = blockingMode;
      Alert.alert('Settings Saved', 'Upstream DNS and blocking mode updated successfully.');
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not update DNS settings');
    }
  };

  const Container = isNested ? View : SafeAreaView;

  return (
    <Container style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!isNested && (
          <>
            <Text style={styles.heading}>DNS Upstream & Blocking</Text>
            <Text style={styles.subheading}>
              Control upstream recursive resolvers and blocking response modes.
            </Text>
          </>
        )}

        {/* Selected Upstream Servers */}
        <Text style={styles.sectionTitle}>Active Upstream Resolvers</Text>
        <View style={styles.chipContainer}>
          {selectedServers.map((srv) => (
            <View key={srv} style={styles.chip}>
              <Text style={styles.chipText}>{srv}</Text>
              <TouchableOpacity onPress={() => handleRemoveServer(srv)} style={styles.chipDelete}>
                <Text style={styles.chipDeleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Add Custom Upstream */}
        <View style={styles.customInputRow}>
          <TextInput
            style={styles.customInput}
            placeholder="Add IP or DoH (e.g. 1.1.1.1 or sdns://...)"
            placeholderTextColor="#9CA3AF"
            value={customServer}
            onChangeText={setCustomServer}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddCustom}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Presets */}
        <Text style={styles.sectionTitle}>Popular DNS Providers</Text>

        {/* DNS Radar Card */}
        <View style={styles.radarCard}>
          <View style={styles.radarHeader}>
            <Text style={styles.radarIcon}>⚡</Text>
            <View style={styles.radarTextContainer}>
              <Text style={styles.radarTitle}>DNS Radar Benchmark</Text>
              <Text style={styles.radarSubtitle}>
                Ping global resolvers directly from your connection to find the fastest
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.radarButton}
            onPress={handleRunSpeedTest}
            disabled={isBenchmarking}
            activeOpacity={0.8}
          >
            {isBenchmarking ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.radarButtonText}>Run Real-Time Speed Test</Text>
            )}
          </TouchableOpacity>
        </View>

        {PRESET_PROVIDERS.map((preset) => {
          const isSelected =
            preset.servers.length === selectedServers.length &&
            preset.servers.every((s) => selectedServers.includes(s));

          const primaryIp = preset.servers[0];
          const latency = benchmarks[primaryIp];
          const fastestServerIp = Object.entries(benchmarks).reduce<string | null>(
            (fastest, [ip, l]) => (!fastest || l < (benchmarks[fastest] || 9999) ? ip : fastest),
            null
          );
          const isFastest = fastestServerIp === primaryIp && latency > 0;

          return (
            <TouchableOpacity
              key={preset.name}
              style={[styles.presetCard, isSelected && styles.presetCardSelected]}
              onPress={() => handleSelectPreset(preset)}
            >
              <View style={styles.presetHeader}>
                <View style={styles.presetTitleRow}>
                  <Text style={[styles.presetName, isSelected && styles.presetNameSelected]}>
                    {preset.name}
                  </Text>
                  {latency !== undefined && latency > 0 && (
                    <View style={[styles.pingBadge, isFastest && styles.fastestPingBadge]}>
                      <Text style={[styles.pingText, isFastest && styles.fastestPingText]}>
                        {isFastest ? '⚡ ' : ''}{latency.toFixed(0)} ms
                      </Text>
                    </View>
                  )}
                </View>
                {isSelected && <Text style={styles.selectedBadge}>✓ ACTIVE</Text>}
              </View>
              <Text style={styles.presetDesc}>{preset.description}</Text>
              <Text style={styles.presetServers}>{preset.servers.join(', ')}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Blocking Mode Selection */}
        <Text style={styles.sectionTitle}>Blocking Response Mode</Text>
        <View style={styles.modeContainer}>
          {(
            [
              {
                mode: 'ADDRESS',
                title: 'Default IP (0.0.0.0 / ::)',
                desc: 'Fastest response. Prevents retry delays by returning null route immediately.',
              },
              {
                mode: 'NXDOMAIN',
                title: 'Name Error (NXDOMAIN)',
                desc: 'Informs OS resolver that the requested domain does not exist.',
              },
              {
                mode: 'REFUSED',
                title: 'Query Refused (REFUSED)',
                desc: 'DNS RCODE 5, rejected by administrator policy.',
              },
            ] as const
          ).map((item) => (
            <TouchableOpacity
              key={item.mode}
              style={[
                styles.modeCard,
                blockingMode === item.mode && styles.modeCardSelected,
              ]}
              onPress={() => setBlockingMode(item.mode)}
            >
              <Text
                style={[
                  styles.modeTitle,
                  blockingMode === item.mode && styles.modeTitleSelected,
                ]}
              >
                {item.title}
              </Text>
              <Text style={styles.modeDesc}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save & Apply DNS Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  subheading: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 14,
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: {
    fontSize: 13,
    color: '#1D4ED8',
    fontWeight: '600',
    marginRight: 6,
  },
  chipDelete: {
    padding: 2,
  },
  chipDeleteText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '800',
  },
  customInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  customInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
  },
  addBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  presetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  presetCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  presetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  presetNameSelected: {
    color: '#065F46',
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  presetDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  presetServers: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#3B82F6',
    marginTop: 6,
  },
  modeContainer: {
    gap: 8,
    marginBottom: 20,
  },
  modeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  modeTitleSelected: {
    color: '#1D4ED8',
  },
  modeDesc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  radarCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  radarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  radarIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  radarTextContainer: {
    flex: 1,
  },
  radarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  radarSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  radarButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  presetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pingBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fastestPingBadge: {
    backgroundColor: '#D1FAE5',
  },
  pingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730A3',
  },
  fastestPingText: {
    color: '#065F46',
  },
});
