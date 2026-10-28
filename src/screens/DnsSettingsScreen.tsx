import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
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
    name: 'AdGuard Default DNS',
    servers: ['94.140.14.14', '94.140.15.15'],
    description: 'AdGuard official filtering DNS resolvers (Anycast global network)',
  },
  {
    name: 'Cloudflare DNS',
    servers: ['1.1.1.1', '1.0.0.1'],
    description: 'Ultra-fast privacy-first recursive resolver with zero-logging guarantee',
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

export const DnsSettingsScreen: React.FC = () => {
  const [selectedServers, setSelectedServers] = useState<string[]>(['94.140.14.14', '1.1.1.1']);
  const [customServer, setCustomServer] = useState('');
  const [blockingMode, setBlockingMode] = useState<'ADDRESS' | 'NXDOMAIN' | 'REFUSED'>('ADDRESS');

  useEffect(() => {
    (async () => {
      try {
        if (!AdGuardVpn) return;
        const cfg = await AdGuardVpn.getDnsSettings();
        if (cfg) {
          setSelectedServers(cfg.upstreamDnsServers || ['94.140.14.14']);
          setBlockingMode(cfg.blockingMode || 'ADDRESS');
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
      Alert.alert('Settings Saved', 'Upstream DNS and blocking mode updated successfully.');
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not update DNS settings');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text style={styles.heading}>DNS Upstream & Blocking</Text>
        <Text style={styles.subheading}>
          Control upstream recursive resolvers and blocking response modes.
        </Text>

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
        {PRESET_PROVIDERS.map((preset) => {
          const isSelected =
            preset.servers.length === selectedServers.length &&
            preset.servers.every((s) => selectedServers.includes(s));

          return (
            <TouchableOpacity
              key={preset.name}
              style={[styles.presetCard, isSelected && styles.presetCardSelected]}
              onPress={() => handleSelectPreset(preset)}
            >
              <View style={styles.presetHeader}>
                <Text style={[styles.presetName, isSelected && styles.presetNameSelected]}>
                  {preset.name}
                </Text>
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
    </SafeAreaView>
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
});
