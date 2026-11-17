import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, {
  CustomerInfo,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import { AdGuardVpn } from '../native/AdGuardVpnModule';

export const REVENUECAT_APPLE_API_KEY = 'appl_CGaRZbQRSoQkJGBcWTcVFUAfPyh';

export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 Days (72 Hours)
export const CURRENT_BUILD_VERSION = '1.0.15';

const LICENSE_STORAGE_KEYS = {
  INSTALL_TIME: '@aegis_first_install_time',
  LIFETIME_PURCHASED: '@aegis_lifetime_purchased',
  BUILD_VERSION: '@aegis_build_version_installed',
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

export interface PurchaseResult {
  success: boolean;
  userCancelled?: boolean;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  restored: boolean;
  error?: string;
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

let isRevenueCatConfigured = false;

/**
 * Checks whether a CustomerInfo object from RevenueCat contains an active lifetime or pro entitlement
 */
export function isCustomerEntitled(customerInfo: CustomerInfo | null | undefined): boolean {
  if (!customerInfo) return false;

  // 1. Any active entitlement in RevenueCat (e.g. 'pro', 'premium', 'lifetime')
  const activeEntitlements = customerInfo.entitlements?.active;
  if (activeEntitlements && Object.keys(activeEntitlements).length > 0) {
    return true;
  }

  // 2. Non-subscription transactions (e.g. lifetime non-consumable purchase)
  if (customerInfo.nonSubscriptionTransactions && customerInfo.nonSubscriptionTransactions.length > 0) {
    return true;
  }

  // 3. All purchased product identifiers recorded by StoreKit
  if (customerInfo.allPurchasedProductIdentifiers && customerInfo.allPurchasedProductIdentifiers.length > 0) {
    return true;
  }

  return false;
}

/**
 * Initializes RevenueCat SDK with the Apple Public API Key
 */
export function initPurchases(): void {
  if (isRevenueCatConfigured) return;

  if (Platform.OS === 'ios') {
    try {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey: REVENUECAT_APPLE_API_KEY });
      isRevenueCatConfigured = true;

      // Listen for customer info updates (e.g. family sharing, renewals, or restores)
      Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        if (isCustomerEntitled(customerInfo)) {
          AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true').then(() => {
            getLicenseState().then(notifyListeners);
          });
        }
      });

      // Synchronize initial customer info in background
      Purchases.getCustomerInfo()
        .then((customerInfo) => {
          if (isCustomerEntitled(customerInfo)) {
            AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true').then(() => {
              getLicenseState().then(notifyListeners);
            });
          }
        })
        .catch((e) => {
          console.warn('[license] RevenueCat initial getCustomerInfo note:', e?.message || e);
        });
    } catch (e) {
      console.error('[license] Failed to configure RevenueCat Purchases:', e);
    }
  }
}

/**
 * Computes current license state based on stored install time & lifetime purchase status
 */
export async function getLicenseState(): Promise<LicenseState> {
  try {
    const [installTimeStr, lifetimePurchasedStr, installedBuild] = await Promise.all([
      AsyncStorage.getItem(LICENSE_STORAGE_KEYS.INSTALL_TIME),
      AsyncStorage.getItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED),
      AsyncStorage.getItem(LICENSE_STORAGE_KEYS.BUILD_VERSION),
    ]);

    const isLifetimePurchased = lifetimePurchasedStr === 'true';
    const now = Date.now();
    let installTime: number;

    // Fresh 3-day trial on first install OR when updating to this build (if not already lifetime)
    if (!installTimeStr || (!isLifetimePurchased && installedBuild !== CURRENT_BUILD_VERSION)) {
      installTime = now;
      await Promise.all([
        AsyncStorage.setItem(LICENSE_STORAGE_KEYS.INSTALL_TIME, String(installTime)),
        AsyncStorage.setItem(LICENSE_STORAGE_KEYS.BUILD_VERSION, CURRENT_BUILD_VERSION),
      ]);
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
 * Fetches the active Lifetime Pro package from RevenueCat offerings
 */
export async function getLifetimePackage(): Promise<PurchasesPackage | null> {
  try {
    if (Platform.OS === 'ios') {
      initPurchases();
      const offerings = await Purchases.getOfferings();
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        return offerings.current.lifetime || offerings.current.availablePackages[0];
      }
      for (const offering of Object.values(offerings.all)) {
        if (offering.availablePackages.length > 0) {
          return offering.lifetime || offering.availablePackages[0];
        }
      }
    }
  } catch (e) {
    console.warn('[license] Failed to fetch offerings:', e);
  }
  return null;
}

/**
 * Unlocks Lifetime Pro Access via RevenueCat and Apple StoreKit
 */
export async function purchaseLifetime(): Promise<PurchaseResult> {
  try {
    if (Platform.OS === 'ios') {
      initPurchases();
      const offerings = await Purchases.getOfferings();
      let packageToBuy: PurchasesPackage | undefined = undefined;

      if (offerings.current && offerings.current.availablePackages.length > 0) {
        packageToBuy = offerings.current.lifetime || offerings.current.availablePackages[0];
      }

      if (!packageToBuy) {
        for (const offering of Object.values(offerings.all)) {
          if (offering.availablePackages.length > 0) {
            packageToBuy = offering.lifetime || offering.availablePackages[0];
            break;
          }
        }
      }

      if (packageToBuy) {
        const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
        if (isCustomerEntitled(customerInfo)) {
          await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true');
          await getLicenseState();
          notifyListeners();
          return { success: true };
        }
        return { success: false, error: 'Purchase did not unlock active entitlement.' };
      } else {
        // Fallback: check direct product lookup if offering not configured yet
        const fallbackProducts = await Purchases.getProducts([
          'com.fajostech.aegisguard.lifetime',
          'aegis_lifetime_pro',
          'lifetime_pro',
        ]);
        if (fallbackProducts && fallbackProducts.length > 0) {
          const { customerInfo } = await Purchases.purchaseStoreProduct(fallbackProducts[0]);
          if (isCustomerEntitled(customerInfo)) {
            await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true');
            await getLicenseState();
            notifyListeners();
            return { success: true };
          }
        }
        return {
          success: false,
          error: 'No in-app purchase packages configured in RevenueCat. Please verify your Offering in the RevenueCat dashboard.',
        };
      }
    } else {
      // Android / Simulator fallback
      await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true');
      await getLicenseState();
      notifyListeners();
      return { success: true };
    }
  } catch (e: any) {
    if (e.userCancelled) {
      return { success: false, userCancelled: true };
    }
    console.error('[license] purchaseLifetime error:', e);
    return { success: false, error: e.message || 'Unable to complete in-app purchase.' };
  }
}

/**
 * Restores past in-app purchases via RevenueCat & Apple StoreKit
 */
export async function restorePurchases(): Promise<RestoreResult> {
  try {
    if (Platform.OS === 'ios') {
      initPurchases();
      const customerInfo = await Purchases.restorePurchases();
      const hasPurchased = isCustomerEntitled(customerInfo);
      if (hasPurchased) {
        await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'true');
      }
      await getLicenseState();
      notifyListeners();
      return { success: true, restored: hasPurchased };
    } else {
      const purchased = await AsyncStorage.getItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED);
      const hasBought = purchased === 'true';
      await getLicenseState();
      notifyListeners();
      return { success: true, restored: hasBought };
    }
  } catch (e: any) {
    console.error('[license] restorePurchases error:', e);
    return { success: false, restored: false, error: e.message || 'Failed to restore purchases.' };
  }
}

/**
 * Debug/Testing utility: Simulates trial expiration or resets trial
 */
export async function resetTrialForTesting(daysOffset: number = 0): Promise<void> {
  const simulatedInstallTime = Date.now() - daysOffset * 24 * 60 * 60 * 1000;
  await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.INSTALL_TIME, String(simulatedInstallTime));
  await AsyncStorage.setItem(LICENSE_STORAGE_KEYS.LIFETIME_PURCHASED, 'false');
  await getLicenseState();
  notifyListeners();
}

// Automatically initialize license check & RevenueCat on import
getLicenseState().catch(() => {});
initPurchases();
