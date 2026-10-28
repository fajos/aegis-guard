import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  AdGuardVpn,
  vpnEventEmitter,
  VpnStatistics,
  QueryLogRecord,
} from '../native/AdGuardVpnModule';

let cachedIsRunning = false;
let cachedStats: VpnStatistics = {
  totalQueries: 0,
  blockedQueries: 0,
  dataSavedBytes: 0,
  blockRate: 0,
  ruleCount: 0,
};
let cachedRecentLogs: QueryLogRecord[] = [];

export function useAdGuardVpn() {
  const [isRunning, setIsRunning] = useState<boolean>(cachedIsRunning);
  const [stats, setStats] = useState<VpnStatistics>(cachedStats);
  const [recentLogs, setRecentLogs] = useState<QueryLogRecord[]>(cachedRecentLogs);

  const refreshState = useCallback(async () => {
    try {
      if (!AdGuardVpn) return;
      const running = await AdGuardVpn.isRunning();
      cachedIsRunning = running;
      setIsRunning(running);
      const s = await AdGuardVpn.getStatistics();
      if (s) {
        cachedStats = s;
        setStats(s);
      }
    } catch (e) {
      console.error('[useAdGuardVpn] refresh error:', e);
    }
  }, []);

  const toggleVpn = useCallback(async () => {
    try {
      if (!AdGuardVpn) {
        Alert.alert(
          'Native Build Required',
          'Local VPN requires native interceptors. Please launch the custom development build or APK generated via "eas build" or "npx expo run:android" (Expo Go does not support custom VpnServices).'
        );
        return;
      }
      if (isRunning) {
        await AdGuardVpn.stopVpn();
        cachedIsRunning = false;
        setIsRunning(false);
      } else {
        await AdGuardVpn.startVpn();
        cachedIsRunning = true;
        setIsRunning(true);
      }
      refreshState();
    } catch (e: any) {
      console.error('[useAdGuardVpn] toggle error:', e);
      Alert.alert('VPN Error', e.message || 'Failed to toggle VPN protection');
    }
  }, [isRunning, refreshState]);

  const addCustomRule = useCallback(async (rule: string) => {
    try {
      if (!AdGuardVpn) return false;
      const ok = await AdGuardVpn.addCustomRule(rule);
      refreshState();
      return ok;
    } catch (e) {
      console.error('[useAdGuardVpn] add rule error:', e);
      return false;
    }
  }, [refreshState]);

  const clearLogs = useCallback(async () => {
    try {
      if (!AdGuardVpn) return;
      await AdGuardVpn.clearQueryLogs();
      setRecentLogs([]);
    } catch (e) {
      console.error('[useAdGuardVpn] clear logs error:', e);
    }
  }, []);

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 3000);

    let subscription: any = null;
    try {
      if (vpnEventEmitter && typeof vpnEventEmitter.addListener === 'function') {
        subscription = vpnEventEmitter.addListener(
          'onQueryLogged',
          (log: QueryLogRecord) => {
            cachedRecentLogs = [log, ...cachedRecentLogs.slice(0, 49)];
            setRecentLogs(cachedRecentLogs);
          }
        );
      }
    } catch (e) {
      // EventEmitter listener registration safe guard
    }

    return () => {
      clearInterval(interval);
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [refreshState]);

  return {
    isRunning,
    stats,
    recentLogs,
    toggleVpn,
    refreshState,
    addCustomRule,
    clearLogs,
  };
}
