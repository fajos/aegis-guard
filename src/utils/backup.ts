import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdGuardVpn } from '../native/AdGuardVpnModule';
import {
  BedtimeSchedule,
  buildSafariBlockerRules,
  CategoryId,
  DEFAULT_SCHEDULE,
  getActiveCategoryDomains,
} from './categories';

export const CATEGORY_STORAGE_KEYS = {
  CATEGORIES: '@aegis_category_blockers',
  SCHEDULE: '@aegis_bedtime_schedule',
  ONBOARDING_DONE: '@aegis_onboarding_completed',
  TREND_HISTORY: '@aegis_weekly_trend',
};

export interface AegisBackupPayload {
  schemaVersion: number;
  exportedAt: string;
  dnsSettings: {
    upstreamDnsServers: string[];
    blockingMode: string;
  };
  userRules: string;
  familyProtection: boolean;
  safeSearch: boolean;
  gameAdsBypass: boolean;
  categories: Partial<Record<CategoryId, boolean>>;
  schedule: BedtimeSchedule;
}

export async function syncCategoriesAndSafari(
  overrideCats?: Partial<Record<CategoryId, boolean>>,
  overrideSched?: BedtimeSchedule
): Promise<void> {
  try {
    const [rawCats, rawSched, rulesText] = await Promise.all([
      overrideCats ? Promise.resolve(null) : AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.CATEGORIES),
      overrideSched ? Promise.resolve(null) : AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.SCHEDULE),
      AdGuardVpn.getUserRules().catch(() => ''),
    ]);
    const cats = (overrideCats || (rawCats ? JSON.parse(rawCats) : {})) as Record<CategoryId, boolean>;
    const sched = overrideSched || (rawSched ? JSON.parse(rawSched) : DEFAULT_SCHEDULE);
    const activeDomains = getActiveCategoryDomains(cats, sched);

    if (typeof AdGuardVpn.setCategoryDomains === 'function') {
      await AdGuardVpn.setCategoryDomains(activeDomains).catch(() => {});
    }
    if (Platform.OS === 'ios' && typeof AdGuardVpn.reloadSafariBlocker === 'function') {
      const safariRules = buildSafariBlockerRules({
        categoryDomains: activeDomains,
        userRulesText: rulesText,
      });
      await AdGuardVpn.reloadSafariBlocker(JSON.stringify(safariRules)).catch(() => {});
    }
  } catch {
    // Non-fatal background sync
  }
}

export async function exportAegisConfig(): Promise<string> {
  const [dnsSettings, userRules, familyProtection, safeSearch, gameAdsBypass, rawCats, rawSchedule] =
    await Promise.all([
      AdGuardVpn.getDnsSettings(),
      AdGuardVpn.getUserRules(),
      AdGuardVpn.isFamilyProtectionEnabled(),
      AdGuardVpn.isSafeSearchEnabled(),
      AdGuardVpn.isGameAdsBypassEnabled(),
      AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.CATEGORIES),
      AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.SCHEDULE),
    ]);

  const categories = rawCats ? JSON.parse(rawCats) : {};
  const schedule: BedtimeSchedule = rawSchedule ? JSON.parse(rawSchedule) : DEFAULT_SCHEDULE;

  const payload: AegisBackupPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    dnsSettings: {
      upstreamDnsServers: dnsSettings.upstreamDnsServers || ['94.140.14.14', '94.140.15.15'],
      blockingMode: dnsSettings.blockingMode || 'ADDRESS',
    },
    userRules: userRules || '',
    familyProtection,
    safeSearch,
    gameAdsBypass,
    categories,
    schedule,
  };

  return JSON.stringify(payload, null, 2);
}

export async function importAegisConfig(rawJson: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = JSON.parse(rawJson.trim()) as Partial<AegisBackupPayload>;
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
      return { ok: false, error: 'Unrecognized AegisGuard backup format.' };
    }

    if (parsed.dnsSettings?.upstreamDnsServers?.length) {
      await AdGuardVpn.setDnsSettings(
        parsed.dnsSettings.upstreamDnsServers,
        parsed.dnsSettings.blockingMode || 'ADDRESS'
      );
    }

    if (typeof parsed.userRules === 'string') {
      await AdGuardVpn.saveUserRules(parsed.userRules);
    }

    if (typeof parsed.familyProtection === 'boolean') {
      await AdGuardVpn.setFamilyProtectionEnabled(parsed.familyProtection);
    }

    if (typeof parsed.safeSearch === 'boolean') {
      await AdGuardVpn.setSafeSearchEnabled(parsed.safeSearch);
    }

    if (typeof parsed.gameAdsBypass === 'boolean') {
      await AdGuardVpn.setGameAdsBypassEnabled(parsed.gameAdsBypass);
    }

    if (parsed.categories && typeof parsed.categories === 'object') {
      await AsyncStorage.setItem(
        CATEGORY_STORAGE_KEYS.CATEGORIES,
        JSON.stringify(parsed.categories)
      );
    }

    if (parsed.schedule && typeof parsed.schedule === 'object') {
      await AsyncStorage.setItem(
        CATEGORY_STORAGE_KEYS.SCHEDULE,
        JSON.stringify(parsed.schedule)
      );
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Invalid JSON backup payload.' };
  }
}
