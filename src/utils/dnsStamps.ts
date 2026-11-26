/**
 * Pure-JS RFC DNS Stamp (sdns://) Decoder & Private DNS Endpoint Builder.
 * Compatible with Hermes / React Native (no Node Buffer required).
 */

export type StampProtocol = 'PLAIN' | 'DNSCRYPT' | 'DOH' | 'DOT' | 'DOQ';

export interface ParsedDnsStamp {
  protocol: StampProtocol;
  serverAddress: string;
  providerName: string;
  path?: string;
  dohUrl?: string;
  summary: string;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(input: string): Uint8Array | null {
  try {
    let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }

    const bytes: number[] = [];
    for (let i = 0; i < b64.length; i += 4) {
      const c1 = B64_CHARS.indexOf(b64[i]);
      const c2 = B64_CHARS.indexOf(b64[i + 1]);
      const c3 = b64[i + 2] === '=' ? -1 : B64_CHARS.indexOf(b64[i + 2]);
      const c4 = b64[i + 3] === '=' ? -1 : B64_CHARS.indexOf(b64[i + 3]);

      if (c1 < 0 || c2 < 0 || (b64[i + 2] !== '=' && c3 < 0) || (b64[i + 3] !== '=' && c4 < 0)) {
        return null;
      }

      const triple = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
      bytes.push((triple >> 16) & 0xff);
      if (c3 >= 0) bytes.push((triple >> 8) & 0xff);
      if (c4 >= 0) bytes.push(triple & 0xff);
    }
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

function decodeUtf8(slice: Uint8Array): string {
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(slice);
    }
  } catch {}
  let out = '';
  for (let i = 0; i < slice.length; i++) {
    out += String.fromCharCode(slice[i]);
  }
  return out;
}

function readLpString(buf: Uint8Array, offset: { pos: number }): string | null {
  if (offset.pos >= buf.length) return null;
  const len = buf[offset.pos++];
  if (offset.pos + len > buf.length) return null;
  const slice = buf.slice(offset.pos, offset.pos + len);
  offset.pos += len;
  return decodeUtf8(slice);
}

function skipHashes(buf: Uint8Array, offset: { pos: number }): boolean {
  while (offset.pos < buf.length) {
    const rawLen = buf[offset.pos++];
    const hasMore = (rawLen & 0x80) !== 0;
    const len = rawLen & 0x7f;
    if (len > 0) {
      if (offset.pos + len > buf.length) return false;
      offset.pos += len;
    }
    if (!hasMore) return true;
  }
  return false;
}

/**
 * Decodes an sdns:// DNS Stamp string into structured endpoint metadata.
 */
export function parseDnsStamp(stampStr: string): ParsedDnsStamp | null {
  const trimmed = stampStr.trim();
  if (!trimmed.toLowerCase().startsWith('sdns://')) return null;

  const bytes = decodeBase64Url(trimmed.slice(7));
  if (!bytes || bytes.length < 9) return null;

  const protoId = bytes[0];
  const offset = { pos: 9 }; // skip 1-byte proto + 8-byte props bitmask

  switch (protoId) {
    case 0x00: {
      const addr = readLpString(bytes, offset);
      if (!addr) return null;
      return {
        protocol: 'PLAIN',
        serverAddress: addr,
        providerName: addr,
        summary: `Plain DNS (${addr})`,
      };
    }
    case 0x01: {
      const addr = readLpString(bytes, offset);
      if (!addr || offset.pos + 32 > bytes.length) return null;
      offset.pos += 32; // skip 32-byte Ed25519 PK
      const providerName = readLpString(bytes, offset);
      if (!providerName) return null;
      return {
        protocol: 'DNSCRYPT',
        serverAddress: addr,
        providerName,
        summary: `DNSCrypt (${providerName})`,
      };
    }
    case 0x02: {
      const addr = readLpString(bytes, offset);
      if (addr === null || !skipHashes(bytes, offset)) return null;
      const hostName = readLpString(bytes, offset);
      if (!hostName) return null;
      const path = readLpString(bytes, offset) || '/dns-query';
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const cleanHost = hostName.replace(/:443$/, '');
      const dohUrl = `https://${cleanHost}${normalizedPath}`;
      return {
        protocol: 'DOH',
        serverAddress: addr || cleanHost,
        providerName: cleanHost,
        path: normalizedPath,
        dohUrl,
        summary: `DoH (${dohUrl})`,
      };
    }
    case 0x03: {
      const addr = readLpString(bytes, offset);
      if (addr === null || !skipHashes(bytes, offset)) return null;
      const hostName = readLpString(bytes, offset);
      if (!hostName) return null;
      return {
        protocol: 'DOT',
        serverAddress: addr || hostName,
        providerName: hostName,
        summary: `DoT (${hostName})`,
      };
    }
    case 0x04: {
      const addr = readLpString(bytes, offset);
      if (addr === null || !skipHashes(bytes, offset)) return null;
      const hostName = readLpString(bytes, offset);
      if (!hostName) return null;
      return {
        protocol: 'DOQ',
        serverAddress: addr || hostName,
        providerName: hostName,
        summary: `DoQ (${hostName})`,
      };
    }
    default:
      return null;
  }
}

export type PrivateDnsProviderType = 'nextdns' | 'controld' | 'adguard' | 'sdns';

/**
 * Resolves a Private DNS profile ID or sdns:// stamp into an encrypted DoH endpoint URL (and optional bootstrap IP).
 */
export function buildPrivateDnsTarget(
  provider: PrivateDnsProviderType,
  rawInput: string
): { servers: string[]; displayName: string; dohUrl?: string; error?: string } {
  const input = rawInput.trim();
  if (!input) {
    return { servers: [], displayName: '', error: 'Please enter a profile ID, URL, or DNS stamp.' };
  }

  if (provider === 'sdns' || input.toLowerCase().startsWith('sdns://')) {
    const parsed = parseDnsStamp(input);
    if (!parsed) {
      return { servers: [], displayName: '', error: 'Invalid sdns:// DNS stamp format.' };
    }
    if (parsed.protocol === 'DOH' && parsed.dohUrl) {
      return {
        servers: [parsed.dohUrl],
        displayName: `DNS Stamp (${parsed.providerName})`,
        dohUrl: parsed.dohUrl,
      };
    }
    if (parsed.serverAddress) {
      return {
        servers: [parsed.serverAddress],
        displayName: parsed.summary,
      };
    }
    return { servers: [], displayName: '', error: 'Could not extract server address from stamp.' };
  }

  // Strip full URL if user pasted one into ID field
  const cleanId = input
    .replace(/^https?:\/\/(dns\.nextdns\.io|freedns\.controld\.com|dns\.controld\.com|d\.adguard-dns\.com\/dns-query)\//i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '');

  if (!cleanId) {
    return { servers: [], displayName: '', error: 'Invalid profile identifier.' };
  }

  if (provider === 'nextdns') {
    const dohUrl = `https://dns.nextdns.io/${cleanId}`;
    return { servers: [dohUrl], displayName: `NextDNS (${cleanId})`, dohUrl };
  }

  if (provider === 'controld') {
    const dohUrl = `https://freedns.controld.com/${cleanId}`;
    return { servers: [dohUrl], displayName: `Control D (${cleanId})`, dohUrl };
  }

  // AdGuard Private DNS
  const dohUrl = `https://d.adguard-dns.com/dns-query/${cleanId}`;
  return { servers: [dohUrl], displayName: `AdGuard Private (${cleanId})`, dohUrl };
}
