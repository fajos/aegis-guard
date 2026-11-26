import { AdGuardVpn } from '../native/AdGuardVpnModule';

export type ThreatLevel = 'SAFE' | 'SUSPICIOUS' | 'DANGEROUS';

export interface EmailOrLinkScanResult {
  status: ThreatLevel;
  headline: string;
  senderEmail: string | null;
  senderDomain: string | null;
  extractedDomains: string[];
  threatDomains: string[];
  reasons: string[];
}

const RISKY_TLDS = [
  '.xyz', '.top', '.click', '.tk', '.ml', '.ga', '.cf', '.gq',
  '.loan', '.zip', '.mov', '.icu', '.cfd', '.work',
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'rb.gy', 'cutt.ly',
  'shorturl.at', 'rebrand.ly', 'ow.ly', 'is.gd',
];

const PHISHING_URL_KEYWORDS = [
  'verify-account', 'login-update', 'secure-billing', 'wallet-connect',
  'free-nitro', 'claim-prize', 'appleid-support', 'paypal-confirm',
  'account-suspended', 'seed-phrase', 'recovery-wallet', 'signin-verify',
  'update-payment', 'confirm-identity',
];

const URGENCY_SCAM_PHRASES = [
  'account has been suspended',
  'account will be suspended',
  'verify your identity immediately',
  'verify within 24 hours',
  'unauthorized login attempt',
  'unpaid toll',
  'package delivery failed',
  'parcel is held',
  'click here to verify',
  'confirm your bank',
  'wire transfer',
  'gift card',
  'seed phrase',
  '12-word recovery',
  'final warning',
  'action required immediately',
];

const PROTECTED_BRANDS: Array<{ brand: string; officialDomains: string[] }> = [
  { brand: 'paypal', officialDomains: ['paypal.com', 'paypalobjects.com'] },
  { brand: 'apple', officialDomains: ['apple.com', 'icloud.com'] },
  { brand: 'amazon', officialDomains: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.ca'] },
  { brand: 'microsoft', officialDomains: ['microsoft.com', 'live.com', 'outlook.com', 'office.com'] },
  { brand: 'google', officialDomains: ['google.com', 'gmail.com', 'youtube.com', 'accounts.google.com'] },
  { brand: 'netflix', officialDomains: ['netflix.com'] },
  { brand: 'coinbase', officialDomains: ['coinbase.com'] },
  { brand: 'binance', officialDomains: ['binance.com', 'binance.us'] },
  { brand: 'metamask', officialDomains: ['metamask.io'] },
  { brand: 'chase', officialDomains: ['chase.com'] },
  { brand: 'bank of america', officialDomains: ['bankofamerica.com'] },
  { brand: 'wells fargo', officialDomains: ['wellsfargo.com'] },
  { brand: 'fedex', officialDomains: ['fedex.com'] },
  { brand: 'dhl', officialDomains: ['dhl.com'] },
  { brand: 'usps', officialDomains: ['usps.com'] },
];

function isDomainUnder(domain: string, officialList: string[]): boolean {
  const clean = domain.toLowerCase();
  return officialList.some((off) => clean === off || clean.endsWith('.' + off));
}

function normalizeHomoglyphs(input: string): string {
  return input
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w');
}

function extractUrlsAndDomains(rawText: string): string[] {
  // Refang defanged URLs like hxxps:// or example[.]com before scanning
  const refanged = rawText
    .replace(/hxxps?:\/\//gi, 'https://')
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.');

  const domains = new Set<string>();

  // 1. Explicit http(s) URLs
  const urlMatches = refanged.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  for (const u of urlMatches) {
    const cleanHost = u
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .split(':')[0]
      .replace(/^www\./i, '')
      .toLowerCase();
    if (cleanHost.includes('.')) {
      domains.add(cleanHost);
    }
  }

  // 2. Bare hostnames (including single-URL input without protocol or domain mentions)
  const hostRegex = /\b(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = hostRegex.exec(refanged)) !== null) {
    const candidate = match[1].replace(/^www\./i, '').toLowerCase();
    // Skip file extensions or decimal numbers like v1.0.2
    if (/^\d+(\.\d+)+$/.test(candidate)) continue;
    if (/\.(png|jpg|jpeg|gif|pdf|txt|html|css|js)$/i.test(candidate)) continue;
    if (candidate.includes('.')) {
      domains.add(candidate);
    }
  }

  return Array.from(domains);
}

function extractSenderEmail(rawText: string): { email: string | null; domain: string | null } {
  // Prioritize explicit From: header if pasted, otherwise first email address
  const fromMatch = rawText.match(/from:\s*[^\n<]*<([^>\s]+@[^>\s]+)>/i)
    || rawText.match(/from:\s*([^\s,<]+@[^\s,>]+)/i)
    || rawText.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);

  if (!fromMatch) return { email: null, domain: null };
  const email = fromMatch[1].trim().toLowerCase();
  const domain = email.split('@')[1] || null;
  return { email, domain };
}

export async function analyzeEmailOrLink(rawInput: string): Promise<EmailOrLinkScanResult> {
  const trimmed = rawInput.trim();
  const { email: senderEmail, domain: senderDomain } = extractSenderEmail(trimmed);
  const extractedDomains = extractUrlsAndDomains(trimmed);

  // Exclude pure email domain if it's only the sender when checking link targets, while still auditing it
  const allTargets = Array.from(new Set([
    ...(senderDomain ? [senderDomain] : []),
    ...extractedDomains,
  ]));

  if (allTargets.length === 0) {
    return {
      status: 'SUSPICIOUS',
      headline: 'No URL or Email Sender Detected',
      senderEmail,
      senderDomain,
      extractedDomains: [],
      threatDomains: [],
      reasons: ['Paste a suspicious link, sender address (From: ...), or full email/SMS message.'],
    };
  }

  const reasons: string[] = [];
  const threatDomains = new Set<string>();
  let status: ThreatLevel = 'SAFE';
  const elevate = (next: ThreatLevel): void => {
    if (next === 'DANGEROUS') {
      status = 'DANGEROUS';
    } else if (next === 'SUSPICIOUS' && status === 'SAFE') {
      status = 'SUSPICIOUS';
    }
  };

  // 1. Check native & local DNS blocklists for every domain found
  for (const domain of allTargets) {
    try {
      const filterRes = await AdGuardVpn.testDomainFilter(domain);
      if (filterRes?.isBlocked) {
        elevate('DANGEROUS');
        threatDomains.add(domain);
        reasons.push(`Blocked by AegisGuard filter rule (${domain}): ${filterRes.matchedRule || 'blocklist match'}`);
      }
    } catch {
      // Safe continue
    }

    if (domain.includes('xn--')) {
      elevate('DANGEROUS');
      threatDomains.add(domain);
      reasons.push(`Punycode IDN homograph detected (${domain}) — frequently used to fake lookalike letters.`);
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) {
      elevate('DANGEROUS');
      threatDomains.add(domain);
      reasons.push(`Raw IP address link (${domain}) instead of a legitimate domain name.`);
    }

    if (PHISHING_URL_KEYWORDS.some((kw) => domain.includes(kw))) {
      elevate('DANGEROUS');
      threatDomains.add(domain);
      reasons.push(`Credential-harvesting / brand impersonation pattern in hostname (${domain}).`);
    }

    if (URL_SHORTENERS.some((s) => domain === s || domain.endsWith('.' + s))) {
      elevate('SUSPICIOUS');
      reasons.push(`Uses URL shortener (${domain}) which masks the true destination.`);
    }

    if (RISKY_TLDS.some((tld) => domain.endsWith(tld))) {
      elevate('SUSPICIOUS');
      threatDomains.add(domain);
      reasons.push(`Uses high-risk TLD (${domain}) commonly abused in phishing & SMS scams.`);
    }
  }

  // 2. Email / Brand impersonation & sender domain mismatch check
  const lowerBody = trimmed.toLowerCase();
  const normalizedBody = normalizeHomoglyphs(lowerBody);

  for (const entry of PROTECTED_BRANDS) {
    const claimsBrand = lowerBody.includes(entry.brand);
    // Check lookalike typosquatting in extracted hostnames (e.g. paypa1-secure.com, rnicrosoft.com)
    for (const domain of allTargets) {
      const normDom = normalizeHomoglyphs(domain);
      if ((domain.includes(entry.brand) || normDom.includes(entry.brand)) && !isDomainUnder(domain, entry.officialDomains)) {
        elevate('DANGEROUS');
        threatDomains.add(domain);
        reasons.push(
          `Brand spoof detected: "${domain}" impersonates ${entry.brand.toUpperCase()} (official: ${entry.officialDomains[0]}).`
        );
      }
    }

    // If email sender claims brand (e.g. "PayPal Support") or message demands action for brand, check sender domain
    if (claimsBrand && senderDomain && !isDomainUnder(senderDomain, entry.officialDomains)) {
      elevate('DANGEROUS');
      threatDomains.add(senderDomain);
      reasons.push(
        `Sender mismatch: message references ${entry.brand.toUpperCase()}, but email sender domain "${senderDomain}" is NOT an official ${entry.brand} domain.`
      );
    }
  }

  // 3. Urgency / extortion / credential lure cues inside pasted email/SMS text
  const matchedPhrases = URGENCY_SCAM_PHRASES.filter(
    (p) => lowerBody.includes(p) || normalizedBody.includes(p)
  );
  if (matchedPhrases.length >= 2 || (matchedPhrases.length === 1 && allTargets.some((d) => threatDomains.has(d) || status !== 'SAFE'))) {
    elevate('DANGEROUS');
    reasons.push(`Contains social-engineering urgency/lure phrasing ("${matchedPhrases[0]}").`);
  } else if (matchedPhrases.length === 1) {
    elevate('SUSPICIOUS');
    reasons.push(`Contains urgency wording commonly seen in phishing emails ("${matchedPhrases[0]}").`);
  }

  if (reasons.length === 0) {
    reasons.push(
      `Inspected ${allTargets.length} domain(s) locally on-device. No brand spoofing, homographs, risky TLDs, or blocklist hits found.`
    );
  }

  const finalStatus = status as ThreatLevel;

  return {
    status: finalStatus,
    headline:
      finalStatus === 'DANGEROUS'
        ? '🚨 Phishing / Threat Detected'
        : finalStatus === 'SUSPICIOUS'
        ? '⚠️ Suspicious — Verify Carefully'
        : '✅ Appears Clean',
    senderEmail,
    senderDomain,
    extractedDomains,
    threatDomains: Array.from(threatDomains),
    reasons,
  };
}
