/**
 * Domain Category Blocker Definitions, Bedtime Schedules,
 * and Apple Safari Content Blocker Rule Compiler.
 */

export type CategoryId = 'social' | 'gambling' | 'gaming' | 'dating' | 'crypto';

export interface CategoryDefinition {
  id: CategoryId;
  title: string;
  icon: string;
  description: string;
  domains: string[];
}

export interface BedtimeSchedule {
  enabled: boolean;
  startHour: number; // 0-23 (e.g. 21 for 9:00 PM)
  endHour: number;   // 0-23 (e.g. 7 for 7:00 AM)
  categories: CategoryId[];
}

export const DEFAULT_SCHEDULE: BedtimeSchedule = {
  enabled: false,
  startHour: 21,
  endHour: 7,
  categories: ['social', 'gaming'],
};

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: 'social',
    title: 'Social Media',
    icon: '📱',
    description: 'Blocks TikTok, Instagram, Facebook, Snapchat, X/Twitter, and Reddit.',
    domains: [
      'tiktok.com',
      'tiktokcdn.com',
      'tiktokv.com',
      'tiktokv.us',
      'tiktokv.eu',
      'tiktokw.us',
      'tiktokw.eu',
      'tiktokcdn-us.com',
      'tiktokcdn-eu.com',
      'tiktokcdn-in.com',
      'tiktok-row.net',
      'tiktokglobalshopv.com',
      'ttdns2.com',
      'ttwstatic.com',
      'ttlivecdn.com',
      'ibyteimg.com',
      'ibytedtos.com',
      'byteoversea.com',
      'byteoversea.net',
      'bytegecko.com',
      'byteimg.com',
      'byteglb.com',
      'bytedance.com',
      'bytedance.net',
      'bytedance.map.fastly.net',
      'bytednsdoc.com',
      'bytedns1.com',
      'muscdn.com',
      'musical.ly',
      'snssdk.com',
      'isnssdk.com',
      'sgsnssdk.com',
      'pstatp.com',
      'instagram.com',
      'cdninstagram.com',
      'ig.me',
      'igsonar.com',
      'facebook.com',
      'facebook.com.edgekey.net',
      'instagram.com.edgekey.net',
      'fbcdn.net',
      'fbcdn.net.edgekey.net',
      'fb.com',
      'fb.me',
      'fb.watch',
      'fbsbx.com',
      'facebook.net',
      'messenger.com',
      'meta.com',
      'threads.net',
      'threads.com',
      'igcdn.com',
      'fbpigeon.com',
      'snapchat.com',
      'sc-cdn.net',
      'snapkit.com',
      'sc-gw.com',
      'snap-dev.net',
      'sc-jpl.com',
      'sc-prod.net',
      'snapads.com',
      'feelinsonice.com',
      'reddit.com',
      'redd.it',
      'redditmedia.com',
      'redditstatic.com',
      'reddituploads.com',
      'x.com',
      'x.com.cdn.cloudflare.net',
      'twitter.com',
      'twitter.com.cdn.cloudflare.net',
      'twitter.map.fastly.net',
      'twimg.com',
      'twimg.com.akamaized.net',
      't.co',
      'twttr.com',
      'twttr.net',
      'grok.com',
      'x.ai',
      'periscope.tv',
      'pscp.tv',
      'vine.co',
    ],
  },
  {
    id: 'gambling',
    title: 'Gambling & Betting',
    icon: '🎰',
    description: 'Blocks online casinos, sportsbooks, and wagering platforms.',
    domains: [
      'bet365.com',
      'draftkings.com',
      'fanduel.com',
      'betway.com',
      'pokerstars.com',
      '888casino.com',
      'williamhill.com',
      'betmgm.com',
      'bovada.lv',
      'stake.com',
    ],
  },
  {
    id: 'gaming',
    title: 'Online Gaming & Streams',
    icon: '🎮',
    description: 'Blocks Roblox, Twitch, Steam, Epic Games, and Riot platforms.',
    domains: [
      'roblox.com',
      'rbxcdn.com',
      'twitch.tv',
      'ttvnw.net',
      'steampowered.com',
      'steamcommunity.com',
      'epicgames.com',
      'riotgames.com',
      'ea.com',
    ],
  },
  {
    id: 'dating',
    title: 'Dating Apps & Sites',
    icon: '💘',
    description: 'Blocks Tinder, Bumble, Hinge, Match, and Badoo networks.',
    domains: [
      'tinder.com',
      'gotinder.com',
      'bumble.com',
      'hinge.co',
      'match.com',
      'okcupid.com',
      'badoo.com',
    ],
  },
  {
    id: 'crypto',
    title: 'Crypto Miners & Scams',
    icon: '⛏️',
    description: 'Blocks browser cryptojacking miners and fraudulent drain scripts.',
    domains: [
      'coinhive.com',
      'crypto-loot.com',
      'authedmine.com',
      'minero.cc',
      'webminepool.com',
      'jsecoin.com',
      'monerominer.rocks',
    ],
  },
];

/**
 * Checks whether the current local clock hour falls inside the active schedule window.
 */
export function isScheduleCurrentlyActive(schedule: BedtimeSchedule, now: Date = new Date()): boolean {
  if (!schedule.enabled) return false;
  const hour = now.getHours();
  if (schedule.startHour === schedule.endHour) return true;
  if (schedule.startHour < schedule.endHour) {
    return hour >= schedule.startHour && hour < schedule.endHour;
  }
  // Overnight window (e.g. 21 -> 07)
  return hour >= schedule.startHour || hour < schedule.endHour;
}

export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

export function getActiveCategoryDomains(
  enabledCategories: Record<CategoryId, boolean>,
  schedule: BedtimeSchedule
): string[] {
  const domainSet = new Set<string>();
  const scheduleActive = isScheduleCurrentlyActive(schedule);

  for (const cat of CATEGORY_DEFINITIONS) {
    const manualOn = !!enabledCategories[cat.id];
    const scheduledOn = scheduleActive && schedule.categories.includes(cat.id);
    if (manualOn || scheduledOn) {
      cat.domains.forEach((d) => domainSet.add(d));
    }
  }
  return Array.from(domainSet);
}

export interface SafariContentBlockerRule {
  trigger: {
    'url-filter': string;
    'load-type'?: ('first-party' | 'third-party')[];
    'if-domain'?: string[];
  };
  action: {
    type: 'block' | 'css-display-none' | 'ignore-previous-rules';
    selector?: string;
  };
}

/**
 * Builds an Apple Safari Content Blocker JSON ruleset incorporating:
 * - Third-party ad & tracker network blocks
 * - YouTube mobile web & Yahoo Mail Safari cosmetic hiding rules
 * - Cookie consent overlay suppression
 * - Enabled Category blockers & Bedtime Schedule domains
 * - Custom user allow/block rules (||domain^ / @@||domain^)
 */
export function buildSafariBlockerRules(options: {
  categoryDomains?: string[];
  userRulesText?: string;
}): SafariContentBlockerRule[] {
  const rules: SafariContentBlockerRule[] = [];

  const adDomains = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'google-analytics.com',
    'googletagmanager.com',
    'adserver.yahoo.com',
    'ads.yahoo.com',
    'm.yap.yahoo.com',
    'gemini.yahoo.com',
    'beap.gemini.yahoo.com',
    'ups.analytics.yahoo.com',
    'analytics.query.yahoo.com',
    'yads.zedo.com',
    'criteo.com',
    'criteo.net',
    'taboola.com',
    'outbrain.com',
    'adnxs.com',
    'pubmatic.com',
    'rubiconproject.com',
    'openx.net',
    'amazon-adsystem.com',
    'scorecardresearch.com',
    'quantserve.com',
    'ads.tiktok.com',
    'analytics.tiktok.com',
    'connect.facebook.net',
    'pixel.facebook.com',
    'coinhive.com',
  ];

  for (const domain of adDomains) {
    const escaped = domain.replace(/\./g, '\\.');
    rules.push({
      trigger: { 'url-filter': `^https?://([^/]+\\.)?${escaped}/` },
      action: { type: 'block' },
    });
  }

  // Cosmetic element hiding for YouTube Web Ads in Safari (eliminates sponsored cards, banners, player overlays)
  rules.push({
    trigger: {
      'url-filter': '.*',
      'if-domain': ['*youtube.com', '*m.youtube.com'],
    },
    action: {
      type: 'css-display-none',
      selector:
        'ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer, ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, .ytp-ad-module, .ytp-ad-overlay-container, #player-ads, ytd-banner-promo-renderer, ytm-Companion-ad-renderer, ytd-statement-banner-renderer',
    },
  });

  // Cosmetic element hiding for Yahoo Mail & Yahoo Web Sponsored Ads in Safari
  rules.push({
    trigger: {
      'url-filter': '.*',
      'if-domain': ['*yahoo.com', '*mail.yahoo.com'],
    },
    action: {
      type: 'css-display-none',
      selector:
        '[data-test-id="ad-banner"], [data-test-id="sponsored-ad"], [data-test-id="pencil-ad"], [data-test-id="right-rail-ad"], [data-test-id="infeed-ad"], .gemini-ad, .native-ad-card, iframe[src*="adserver.yahoo"], iframe[src*="gemini.yahoo"]',
    },
  });

  // Generic ad slots & annoying cookie/consent banners across Safari sites
  rules.push({
    trigger: { 'url-filter': '.*' },
    action: {
      type: 'css-display-none',
      selector:
        'ins.adsbygoogle, [id^="google_ads_iframe"], [data-ad-slot], .taboola-container, #taboola-below-article-thumbnails, .OUTBRAIN',
    },
  });

  // Enabled Categories + Schedule domains
  if (options.categoryDomains) {
    for (const domain of options.categoryDomains) {
      const clean = domain.trim().toLowerCase();
      if (!clean) continue;
      const escaped = clean.replace(/\./g, '\\.');
      rules.push({
        trigger: { 'url-filter': `^https?://([^/]+\\.)?${escaped}/` },
        action: { type: 'block' },
      });
    }
  }

  // Parse custom User Rules (||domain^ and @@||domain^)
  if (options.userRulesText) {
    const lines = options.userRulesText.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('!') || line.startsWith('#')) continue;

      if (line.startsWith('@@||')) {
        const domain = line.slice(4).replace(/[\^$|].*$/, '').trim().toLowerCase();
        if (domain) {
          const escaped = domain.replace(/\./g, '\\.');
          rules.push({
            trigger: { 'url-filter': `^https?://([^/]+\\.)?${escaped}/` },
            action: { type: 'ignore-previous-rules' },
          });
        }
      } else if (line.startsWith('||')) {
        const domain = line.slice(2).replace(/[\^$|].*$/, '').trim().toLowerCase();
        if (domain) {
          const escaped = domain.replace(/\./g, '\\.');
          rules.push({
            trigger: { 'url-filter': `^https?://([^/]+\\.)?${escaped}/` },
            action: { type: 'block' },
          });
        }
      }
    }
  }

  return rules;
}
