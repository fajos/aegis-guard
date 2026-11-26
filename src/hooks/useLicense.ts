import { useState, useEffect, useCallback } from 'react';
import {
  LicenseState,
  getLicenseState,
  subscribeLicense,
  purchaseLifetime as doPurchaseLifetime,
  restorePurchases as doRestorePurchases,
  getLifetimePackage,
  PurchaseResult,
  RestoreResult,
} from '../utils/license';

export function useLicense() {
  const [license, setLicense] = useState<LicenseState>({
    isTrialActive: true,
    isLifetimePurchased: false,
    isPremium: true,
    daysRemaining: 7,
    hoursRemaining: 0,
    minutesRemaining: 0,
    totalMsRemaining: 7 * 24 * 60 * 60 * 1000,
    isLoaded: false,
  });

  const [priceString, setPriceString] = useState<string>('$4.99');

  useEffect(() => {
    const unsubscribe = subscribeLicense((updatedState) => {
      setLicense(updatedState);
    });

    // Fetch localized price string from RevenueCat / Apple StoreKit if available
    getLifetimePackage()
      .then((pkg) => {
        if (pkg?.product?.priceString) {
          setPriceString(pkg.product.priceString);
        }
      })
      .catch(() => {});

    // Check periodically every 60 seconds to update remaining hours/minutes countdown
    const timer = setInterval(() => {
      getLicenseState().then((updatedState) => {
        setLicense(updatedState);
      });
    }, 60000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const purchaseLifetime = useCallback(async (): Promise<PurchaseResult> => {
    const result = await doPurchaseLifetime();
    if (result.success) {
      const updated = await getLicenseState();
      setLicense(updated);
    }
    return result;
  }, []);

  const restorePurchases = useCallback(async (): Promise<RestoreResult> => {
    const result = await doRestorePurchases();
    if (result.restored) {
      const updated = await getLicenseState();
      setLicense(updated);
    }
    return result;
  }, []);

  const refreshLicense = useCallback(async () => {
    const updated = await getLicenseState();
    setLicense(updated);
    return updated;
  }, []);

  return {
    license,
    isPremium: license.isPremium,
    isTrialActive: license.isTrialActive,
    isLifetimePurchased: license.isLifetimePurchased,
    trialExpired: !license.isPremium,
    daysRemaining: license.daysRemaining,
    hoursRemaining: license.hoursRemaining,
    priceString,
    purchaseLifetime,
    restorePurchases,
    refreshLicense,
  };
}
