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

interface UserRulesScreenProps {
  isNested?: boolean;
}

export const UserRulesScreen: React.FC<UserRulesScreenProps> = ({ isNested = false }) => {
  const [rules, setRules] = useState<string>(cachedUserRules);
  const [isSaving, setIsSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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

  const Container = isNested ? View : SafeAreaView;

  return (
    <Container style={styles.container}>
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
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Quick Syntax Snippets</Text>
          <TouchableOpacity onPress={() => setShowGuide(!showGuide)}>
            <Text style={styles.guideToggleText}>{showGuide ? 'Hide Guide ▲' : 'Rules Guide ❓'}</Text>
          </TouchableOpacity>
        </View>

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

        {/* Expandable Rules Guide */}
        {showGuide && (
          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>📘 How AdBlock DNS Rules Work</Text>

            <View style={styles.guideItem}>
              <Text style={styles.guideRuleCode}>||domain.com^</Text>
              <Text style={styles.guideDesc}>
                <Text style={styles.guideBold}>Blocks domain and all subdomains.</Text> For example, <Text style={styles.guideMono}>||doubleclick.net^</Text> blocks <Text style={styles.guideMono}>ad.doubleclick.net</Text> and <Text style={styles.guideMono}>sub.ad.doubleclick.net</Text>.
              </Text>
            </View>

            <View style={styles.guideItem}>
              <Text style={styles.guideRuleCode}>@@||domain.com^</Text>
              <Text style={styles.guideDesc}>
                <Text style={styles.guideBold}>Whitelist exception.</Text> Unblocks a domain that was blocked by another list. For example, <Text style={styles.guideMono}>@@||s.yimg.com^</Text> allows Yahoo Mail email images.
              </Text>
            </View>

            <View style={styles.guideItem}>
              <Text style={styles.guideRuleCode}>||subdomain.provider.com^</Text>
              <Text style={styles.guideDesc}>
                <Text style={styles.guideBold}>Targeted ad blocking.</Text> Never block <Text style={styles.guideMono}>||yahoo.com^</Text> or <Text style={styles.guideMono}>||google.com^</Text> (which breaks entire apps). Instead, block the specific ad server: <Text style={styles.guideMono}>||ads.yahoo.com^</Text> or <Text style={styles.guideMono}>||m.yap.yahoo.com^</Text>.
              </Text>
            </View>

            <View style={styles.guideItem}>
              <Text style={styles.guideRuleCode}>||tracker.com^$important</Text>
              <Text style={styles.guideDesc}>
                <Text style={styles.guideBold}>Priority override.</Text> Forces this block rule to take precedence even if an allowlist rule exists.
              </Text>
            </View>

            <View style={styles.guideItem}>
              <Text style={styles.guideRuleCode}>||my-nas.local^$dnsrewrite=192.168.1.50</Text>
              <Text style={styles.guideDesc}>
                <Text style={styles.guideBold}>Custom DNS Rewrite.</Text> Directs queries for a domain to a custom local IP address.
              </Text>
            </View>
          </View>
        )}

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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  guideToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  guideCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 14,
    marginBottom: 16,
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E40AF',
    marginBottom: 10,
  },
  guideItem: {
    marginBottom: 8,
  },
  guideRuleCode: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#1D4ED8',
  },
  guideDesc: {
    fontSize: 11,
    color: '#374151',
    lineHeight: 16,
    marginTop: 2,
  },
  guideBold: {
    fontWeight: '700',
    color: '#111827',
  },
  guideMono: {
    fontFamily: 'monospace',
    color: '#1E40AF',
    fontWeight: '600',
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
