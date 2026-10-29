import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Eager restore of cached running state
AsyncStorage.getItem('@aegis_vpn_is_running').then((val) => {
  if (val === 'true') cachedIsRunning = true;
}).catch(() => {});

AsyncStorage.getItem('@aegis_vpn_stats').then((val) => {
  if (val) {
    try {
      cachedStats = JSON.parse(val);
    } catch (e) {}
  }
}).catch(() => {});

export function useAdGuardVpn(isActive: boolean = true) {
  const [isRunning, setIsRunning] = useState<boolean>(cachedIsRunning);
  const [stats, setStats] = useState<VpnStatistics>(cachedStats);
  const [recentLogs, setRecentLogs] = useState<QueryLogRecord[]>(cachedRecentLogs);

  const pendingBatchRef = useRef<QueryLogRecord[]>([]);
  const flushTimerRef = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem('@aegis_vpn_is_running').then((val) => {
      if (val === 'true') {
        cachedIsRunning = true;
        setIsRunning(true);
      }
    }).catch(() => {});
  }, []);

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
      cachedRecentLogs = [];
      setRecentLogs([]);
    } catch (e) {
      console.error('[useAdGuardVpn] clear logs error:', e);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    refreshState();
    const interval = setInterval(refreshState, 4000);

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const pending = pendingBatchRef.current.splice(0);
        if (pending.length > 0) {
          cachedRecentLogs = [...pending, ...cachedRecentLogs].slice(0, 15);
          setRecentLogs(cachedRecentLogs);
        }
      }, 1000);
    };

    let subBatch: any = null;
    let subSingle: any = null;

    try {
      if (vpnEventEmitter && typeof vpnEventEmitter.addListener === 'function') {
        // Preferred: batched array event
        subBatch = vpnEventEmitter.addListener(
          'onQueriesLogged',
          (entries: QueryLogRecord[]) => {
            if (Array.isArray(entries) && entries.length > 0) {
              pendingBatchRef.current.unshift(...entries);
              scheduleFlush();
            }
          }
        );

        // Fallback: single item event
        subSingle = vpnEventEmitter.addListener(
          'onQueryLogged',
          (log: QueryLogRecord) => {
            if (log) {
              pendingBatchRef.current.unshift(log);
              scheduleFlush();
            }
          }
        );
      }
    } catch (e) {
      // EventEmitter listener registration safeguard
    }

    return () => {
      clearInterval(interval);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (subBatch && typeof subBatch.remove === 'function') {
        subBatch.remove();
      }
      if (subSingle && typeof subSingle.remove === 'function') {
        subSingle.remove();
      }
    };
  }, [isActive, refreshState]);

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
