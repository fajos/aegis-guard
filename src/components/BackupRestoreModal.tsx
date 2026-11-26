import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
  ScrollView,
} from 'react-native';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import {
  exportAegisConfig,
  importAegisConfig,
  syncCategoriesAndSafari,
} from '../utils/backup';

interface BackupRestoreModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ visible, onClose }) => {
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const json = await exportAegisConfig();
      await Share.share({
        message: json,
        title: 'AegisGuard Settings Backup',
      });
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message || 'Could not export backup.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      Alert.alert('Backup Required', 'Paste an AegisGuard JSON backup first.');
      return;
    }
    setBusy(true);
    try {
      const res = await importAegisConfig(importText);
      if (!res.ok) {
        Alert.alert('Restore Failed', res.error || 'Could not import settings.');
        return;
      }

      await syncCategoriesAndSafari();

      setImportText('');
      Alert.alert('Backup Restored', 'Your DNS settings, custom rules, and schedules were restored.', [
        { text: 'Done', onPress: onClose },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>💾 Backup &amp; Restore</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.desc}>
              Export your DNS upstream config, user rules, categories, and bedtime schedules as JSON to transfer across devices or restore anytime.
            </Text>

            <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={busy}>
              <Text style={styles.exportBtnText}>📤 Export &amp; Share Settings JSON</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Restore from JSON Backup</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={6}
              placeholder='Paste exported JSON starting with { "schemaVersion": 1 ... }'
              placeholderTextColor="#9CA3AF"
              value={importText}
              onChangeText={setImportText}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity style={styles.importBtn} onPress={handleImport} disabled={busy}>
              <Text style={styles.importBtnText}>📥 Restore Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 11, 32, 0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  closeX: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '700',
  },
  desc: {
    fontSize: 12.5,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 14,
  },
  exportBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 18,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  textArea: {
    minHeight: 110,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    color: '#111827',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  importBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
