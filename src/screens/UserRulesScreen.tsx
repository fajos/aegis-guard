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

const SYNTAX_TIPS = [
  { syntax: '||example.com^', note: 'Block domain and subdomains' },
  { syntax: '@@||example.com^', note: 'Whitelist domain exception' },
  { syntax: '||example.com^$dnsrewrite=127.0.0.1', note: 'DNS response rewrite' },
  { syntax: '||example.com^$important', note: 'Higher priority than whitelist' },
  { syntax: '! Comment line', note: 'Comments ignored by parser' },
];

// In-memory cache for instant user rules editor rendering
let cachedUserRules = '';

export const UserRulesScreen: React.FC = () => {
  const [rules, setRules] = useState<string>(cachedUserRules);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        console.log('[UserRulesScreen] Loading custom rules from disk...');
        if (!AdGuardVpn) return;
        const text = await AdGuardVpn.getUserRules();
        console.log('[UserRulesScreen] Loaded custom rules text:', text);
        if (text !== null && text !== undefined) {
          cachedUserRules = text;
          setRules(text);
        }
      } catch (e) {
        console.error('[UserRulesScreen] Error loading user rules:', e);
      }
    })();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    console.log('[UserRulesScreen] Saving rules to disk:\n', rules);
    try {
      await AdGuardVpn.saveUserRules(rules);
      cachedUserRules = rules;
      console.log('[UserRulesScreen] Rules successfully parsed and reloaded into engine');
      Alert.alert('Rules Saved', 'Your custom rules have been parsed and reloaded into the filter engine.');
    } catch (e: any) {
      console.error('[UserRulesScreen] Failed to save rules:', e);
      Alert.alert('Error', e.message || 'Failed to save rules');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInsertTemplate = (template: string) => {
    setRules((prev) => (prev ? `${prev}\n${template}` : template));
  };

  const parsedRuleCount = rules
    .split('\n')
    .filter((l) => {
      const trimmed = l.trim();
      return trimmed.length > 0 && !trimmed.startsWith('!') && !trimmed.startsWith('#');
    }).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title & Count */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>User Rules</Text>
            <Text style={styles.subtitle}>
              Custom AdBlock filter rules applied locally
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{parsedRuleCount} rules</Text>
          </View>
        </View>

        {/* Quick Insert Cheat Sheet */}
        <Text style={styles.sectionHeader}>Quick Syntax Snippets (Tap to Insert)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tipsRow}>
          {SYNTAX_TIPS.map((tip, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.tipChip}
              onPress={() => handleInsertTemplate(tip.syntax)}
            >
              <Text style={styles.tipSyntax}>{tip.syntax}</Text>
              <Text style={styles.tipNote}>{tip.note}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Rules Multiline Editor */}
        <Text style={styles.sectionHeader}>Editor (One Rule Per Line)</Text>
        <View style={styles.editorContainer}>
          <TextInput
            style={styles.editor}
            multiline
            numberOfLines={18}
            textAlignVertical="top"
            value={rules}
            onChangeText={setRules}
            placeholder={`# Example custom rules:\n||tracking-provider.com^\n@@||trusted-service.org^\n||telemetry.app^$important`}
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveBtnText}>
            {isSaving ? 'Compiling Rules...' : 'Save & Reload Engine'}
          </Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#03543F',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 8,
  },
  tipsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tipChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  tipSyntax: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#2563EB',
  },
  tipNote: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  editorContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 16,
  },
  editor: {
    minHeight: 280,
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#111827',
    lineHeight: 19,
  },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#A7F3D0',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
