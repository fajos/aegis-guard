import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdGuardVpn } from '../native/AdGuardVpnModule';

export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 Days (72 Hours)

const LICENSE_STORAGE_KEYS = {
  INSTALL_TIME: '@aegis_first_install_time',
  LIFETIME_PURCHASED: '@aegis_lifetime_purchased',
};

export interface LicenseState {
  isTrialActive: boolean;
  isLifetimePurchased: boolean;
  isPremium: boolean; // true if trial is active OR lifetime is purchased
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  totalMsRemaining: number;
  isLoaded: boolean;
}

let cachedLicenseState: LicenseState = {
  isTrialActive: true,
  isLifetimePurchased: false,
  isPremium: true,
  daysRemaining: 3,
  hoursRemaining: 0,
  minutesRemaining: 0,
  totalMsRemaining: TRIAL_DURATION_MS,
  isLoaded: false,
};

type LicenseListener = (state: LicenseState) => void;
const listeners = new Set<LicenseListener>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener(cachedLicenseState);
    } catch (e) {
      console.error('[license] Error notifying listener:', e);
    }
  });
}

/**
 * Computes current license state based on stored install time & lifetime purchase status
 */
export async function getLicenseState(): Promise<LicenseState> {
  try {
    const [installTimeStr, lifetimePurchasedStr] = await Promise.all([
      AsyncStorage.getItem(LICENSE_STORAGE_KEYS.INSTALL_TIME),
      AsyncStorage.getItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED),
    ]);

    const isLifetimePurchased = lifetimePurchasedStr === 'true';
    const now = Date.now();
    let installTime: number;

    if (!installTimeStr) {
      // First launch: set install timestamp to right now
      installTime = now;
      await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.INSTALL_TIME, String(installTime));
    } else {
      installTime = parseInt(installTimeStr, 10);
      if (isNaN(installTime)) {
        installTime = now;
        await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.INSTALL_TIME, String(installTime));
      }
    }

    const elapsedMs = Math.max(0, now - installTime);
    const totalMsRemaining = Math.max(0, TRIAL_DURATION_MS - elapsedMs);
    const isTrialActive = totalMsRemaining > 0;
    const isPremium = isLifetimePurchased || isTrialActive;

    const daysRemaining = Math.floor(totalMsRemaining / (24 * 60 * 60 * 1000));
    const hoursRemaining = Math.floor(
      (totalMsRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );
    const minutesRemaining = Math.floor(
      (totalMsRemaining % (60 * 60 * 1000)) / (60 * 1000)
    );

    cachedLicenseState = {
      isTrialActive,
      isLifetimePurchased,
      isPremium,
      daysRemaining,
      hoursRemaining,
      minutesRemaining,
      totalMsRemaining,
      isLoaded: true,
    };

    // Keep native DNS engine in sync with premium status
    if (AdGuardVpn && typeof AdGuardVpn.setLicenseState === 'function') {
      AdGuardVpn.setLicenseState(isPremium).catch(() => {});
    }

    return cachedLicenseState;
  } catch (e) {
    console.error('[license] Failed to get license state:', e);
    return cachedLicenseState;
  }
}

/**
 * Subscribes a callback to live license state changes
 */
export function subscribeLicense(listener: LicenseListener): () => void {
  listeners.add(listener);
  // Emit current cached state immediately
  if (cachedLicenseState.isLoaded) {
    listener(cachedLicenseState);
  } else {
    getLicenseState().then(listener);
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Unlocks Lifetime Pro Access (One-Off Purchase)
 */
export async function purchaseLifetime(): Promise<boolean> {
  try {
    await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true');
    await getLicenseState();
    notifyListeners();
    return true;
  } catch (e) {
    console.error('[license] purchaseLifetime error:', e);
    return false;
  }
}

/**
 * Restores past in-app purchase
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const purchased = await AsyncStorage.getItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED);
    const hasBought = purchased === 'true';
    await getLicenseState();
    notifyListeners();
    return hasBought;
  } catch (e) {
    console.error('[license] restorePurchases error:', e);
    return false;
  }
}

/**
 * Debug/Testing utility: Simulates trial expiration or resets trial
 * Pass daysOffset = 4 to simulate expired trial (Day 4)
 * Pass daysOffset = 0 to reset trial back to 3 full days
 */
export async function resetTrialForTesting(daysOffset: number = 0): Promise<void> {
  const simulatedInstallTime = Date.now() - daysOffset * 24 * 60 * 60 * 1000;
  await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.INSTALL_TIME, String(simulatedInstallTime));
  await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'false');
  await getLicenseState();
  notifyListeners();
}

// Automatically initialize license check in background on module import
getLicenseState().catch(() => {});
