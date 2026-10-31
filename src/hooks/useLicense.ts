import { useState, useEffect, useCallback } from 'react';
import {
  LicenseState,
  getLicenseState,
  subscribeLicense,
  purchaseLifetime as doPurchaseLifetime,
  restorePurchases as doRestorePurchases,
} from '../utils/license';

export function useLicense() {
  const [license, setLicense] = useState<LicenseState>({
    isTrialActive: true,
    isLifetimePurchased: false,
    isPremium: true,
    daysRemaining: 3,
    hoursRemaining: 0,
    minutesRemaining: 0,
    totalMsRemaining: 3 * 24 * 60 * 60 * 1000,
    isLoaded: false,
  });

  useEffect(() => {
    const unsubscribe = subscribeLicense((updatedState) => {
      setLicense(updatedState);
    });

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

  const purchaseLifetime = useCallback(async () => {
    const success = await doPurchaseLifetime();
    if (success) {
      const updated = await getLicenseState();
      setLicense(updated);
    }
    return success;
  }, []);

  const restorePurchases = useCallback(async () => {
    const success = await doRestorePurchases();
    if (success) {
      const updated = await getLicenseState();
      setLicense(updated);
    }
    return success;
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
    purchaseLifetime,
    restorePurchases,
    refreshLicense,
  };
}
