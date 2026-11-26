import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryLogRecord } from '../native/AdGuardVpnModule';
import { CATEGORY_STORAGE_KEYS } from '../utils/backup';

interface PrivacyInsightsCardProps {
  recentLogs: QueryLogRecord[];
  blockedQueries: number;
  locked?: boolean;
  onUnlockPress?: () => void;
}

interface TrackerBucket {
  label: string;
  count: number;
  color: string;
}

function classifyTracker(domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes('doubleclick') || d.includes('googlesyndication') || d.includes('google-analytics') || d.includes('admob') || d.includes('app-measurement')) {
    return 'Google / AdMob';
  }
  if (d.includes('facebook') || d.includes('instagram') || d.includes('fbcdn')) {
    return 'Meta Telemetry';
  }
  if (d.includes('yahoo') || d.includes('oath') || d.includes('zedo')) {
    return 'Yahoo / Oath';
  }
  if (d.includes('tiktok') || d.includes('applovin') || d.includes('vungle') || d.includes('unityads') || d.includes('ironsrc')) {
    return 'Mobile Ad SDKs';
  }
  return 'Other Trackers';
}

const BUCKET_COLORS: Record<string, string> = {
  'Google / AdMob': '#EF4444',
  'Meta Telemetry': '#3B82F6',
  'Yahoo / Oath': '#8B5CF6',
  'Mobile Ad SDKs': '#F59E0B',
  'Other Trackers': '#10B981',
};

export const PrivacyInsightsCard: React.FC<PrivacyInsightsCardProps> = ({
  recentLogs,
  blockedQueries,
  locked = false,
  onUnlockPress,
}) => {
  const [dailyHistory, setDailyHistory] = useState<Record<string, number>>({});

  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem(CATEGORY_STORAGE_KEYS.TREND_HISTORY)
      .then((raw) => {
        const parsed: Record<string, number> = raw ? JSON.parse(raw) : {};
        const prevToday = parsed[todayKey] || 0;
        const nextToday = Math.max(prevToday, blockedQueries);
        if (nextToday !== prevToday || !raw) {
          const updated = { ...parsed, [todayKey]: nextToday };
          // Retain only last 14 days
          const keys = Object.keys(updated).sort().slice(-14);
          const trimmed: Record<string, number> = {};
          keys.forEach((k) => {
            trimmed[k] = updated[k];
          });
          setDailyHistory(trimmed);
          AsyncStorage.setItem(CATEGORY_STORAGE_KEYS.TREND_HISTORY, JSON.stringify(trimmed)).catch(() => {});
        } else {
          setDailyHistory(parsed);
        }
      })
      .catch(() => {});
  }, [blockedQueries]);

  const trackerBreakdown: TrackerBucket[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of recentLogs) {
      if (!entry.isBlocked) continue;
      const bucket = classifyTracker(entry.domain);
      counts[bucket] = (counts[bucket] || 0) + 1;
    }
    const entries = Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        color: BUCKET_COLORS[label] || '#6B7280',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    return entries;
  }, [recentLogs]);

  const maxBucket = trackerBreakdown.reduce((m, b) => Math.max(m, b.count), 1);

  const last7Days = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const shortDay = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
      days.push({
        label: shortDay,
        count: i === 0 ? Math.max(dailyHistory[key] || 0, blockedQueries) : dailyHistory[key] || 0,
      });
    }
    return days;
  }, [dailyHistory, blockedQueries]);

  const maxDayCount = last7Days.reduce((m, d) => Math.max(m, d.count), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📊 Privacy Insights &amp; Trends</Text>

      {locked ? (
        <TouchableOpacity
          style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}
          onPress={onUnlockPress}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#991B1B' }}>
            🔒 7-Day Privacy Insights Locked
          </Text>
          <Text style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>
            Your 7-day trial ended. Tap to unlock tracker breakdowns &amp; 7-day activity charts with Lifetime Pro.
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={styles.subTitle}>Top Blocked Trackers (Recent Session)</Text>
      {trackerBreakdown.length === 0 ? (
        <Text style={styles.emptyText}>
          Turn on protection to see real-time tracker breakdown by network.
        </Text>
      ) : (
        <View style={styles.barsList}>
          {trackerBreakdown.map((item) => (
            <View key={item.label} style={styles.barRow}>
              <View style={styles.barHeader}>
                <Text style={styles.barLabel}>{item.label}</Text>
                <Text style={styles.barCount}>{item.count} blocked</Text>
              </View>
              <View style={styles.trackBg}>
                <View
                  style={[
                    styles.trackFill,
                    {
                      width: `${Math.max(10, Math.round((item.count / maxBucket) * 100))}%`,
                      backgroundColor: item.color,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.subTitle, { marginTop: 14 }]}>7-Day Protection Activity</Text>
      <View style={styles.chartRow}>
        {last7Days.map((day, idx) => {
          const pct = day.count > 0 ? Math.max(12, Math.round((day.count / maxDayCount) * 100)) : 6;
          return (
            <View key={`${day.label}-${idx}`} style={styles.chartCol}>
              <View style={styles.chartBarWrap}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: `${pct}%`,
                      backgroundColor: day.count > 0 ? '#10B981' : '#E5E7EB',
                    },
                  ]}
                />
              </View>
              <Text style={styles.chartDay}>{day.label}</Text>
            </View>
          );
        })}
      </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  barsList: {
    gap: 8,
  },
  barRow: {
    gap: 4,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1F2937',
  },
  barCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  trackBg: {
    height: 7,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 76,
    paddingTop: 6,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  chartBarWrap: {
    flex: 1,
    width: 16,
    justifyContent: 'flex-end',
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    borderRadius: 4,
  },
  chartDay: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
});
