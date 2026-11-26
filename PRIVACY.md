# Privacy Policy for AegisGuard: Ad & DNS Blocker

**Effective Date:** November 26, 2026  
**Developer:** Fajostech / Femi Adeyemi  
**Application:** AegisGuard: Ad & DNS Blocker (`com.fajostech.aegisguard`)  
**Contact:** fajostech@gmail.com  
**Support URL:** https://fajostech.com/contact

---

## 1. Introduction & Our Core Commitment

Welcome to **AegisGuard: Ad & DNS Blocker** ("we", "our", or "us"), developed by Fajostech. We are committed to protecting your privacy and empowering you with complete control over your network traffic, advertisements, and personal data.

**Our Core Privacy Policy is simple: Zero Logs, Zero Tracking, Zero Data Collection.**

AegisGuard: Ad & DNS Blocker is designed from the ground up as an on-device utility. We do not operate tracking servers, we do not log your online activities, and we do not monetize or sell your personal data.

---

## 2. Information We DO NOT Collect

Unlike traditional VPN providers or web proxies, AegisGuard does **not** collect or store:
- ❌ **No Browsing History:** We never see or store the websites you visit, pages you view, or content you access.
- ❌ **No DNS Query Logs on Remote Servers:** Your DNS requests are never sent to or recorded on our servers.
- ❌ **No SMS or Email Message Contents:** Texts screened offline by `AegisSmsFilter` and emails/URLs inspected in the **Phishing Email & Link Scanner** never leave your device.
- ❌ **No IP Address Tracking:** We do not record or track your public or private IP addresses.
- ❌ **No Advertising Identifiers:** We do not read, track, or share your IDFA (Identifier for Advertisers) or Android Advertising ID.
- ❌ **No Personal Identity Data:** We do not require you to create an account, register your email address, or provide your real name.

---

## 3. How AegisGuard Works (On-Device Architecture)

AegisGuard: Ad & DNS Blocker operates locally on your device using native operating system security frameworks:

### A. iOS (NetworkExtension, Safari, IdentityLookup, WidgetKit & AppIntents)
- **`AegisPacketTunnel` (`NEPacketTunnelProvider`):** Runs an on-device local DNS loopback tunnel (`10.0.0.2` → `10.0.0.1`) that enforces Category Blockers, Bedtime Schedules, custom user rules, SafeSearch rewrites, and phishing/cryptomining rules locally before forwarding allowed queries over encrypted **DNS-over-HTTPS (DoH)**. Only DNS traffic is routed through the tunnel; ordinary web/app connections stay direct for minimal battery and speed impact.
- **`AegisSafariBlocker` (Safari Content Blocker):** Supplies network and cosmetic hiding rules directly to Safari so sponsored elements are hidden on-device without inspecting browsing history.
- **`AegisSmsFilter` (`ILMessageFilterExtension`):** Uses Apple's IdentityLookup framework completely offline to flag unknown-sender scam/phishing SMS messages as Junk without contacting any external server.
- **`AegisWidget` & Siri Shortcuts (`AppIntents`):** Reads protection status and counters exclusively from the local shared App Group sandbox (`group.com.fajostech.aegisguard`).
- **Real-Time Threat Alerts (`UNUserNotificationCenter`):** Triggers local notifications strictly on-device when a dangerous phishing, Punycode homograph, or cryptomining domain is blocked.

### B. Android (Local Loopback VpnService)
- On Android devices, AegisGuard uses the Android `VpnService` API to establish a local, on-device loopback interface (`10.0.0.2`) with per-app split-tunneling (`addDisallowedApplication`), Category Blockers, custom rules, and encrypted DoH/UDP resolution.
- Local packets are processed and filtered on your device's processor with zero traffic routed through third-party remote VPN proxy servers.
- **Real-Time Threat Alerts:** Uses a high-importance local Android notification channel (`POST_NOTIFICATIONS`) solely on-device when a phishing/scam/cryptomining domain is blocked.

### C. Phishing Email, SMS & Link Scanner
- Text, sender headers (`From:`), SMS bodies, and URLs pasted into the **Phishing Email & Link Scanner** are evaluated strictly in volatile on-device memory for sender-brand mismatches, lookalike homographs, risky TLDs, urgency cues, and local filter hits. No inspected text or URL leaves your device.

---

## 4. Data Stored Locally on Your Device

Certain operational settings and diagnostics are stored **strictly within your device's local application sandbox** (and shared App Group on iOS):
- **Query Logs & 7-Day Privacy Insights:** Recent DNS queries (domain name, query type, timestamp, matched rule, and blocked/allowed status) and aggregated 7-day blocked counts are saved exclusively to local storage. You can purge your logs anytime with a single tap using **"Clear Logs"**.
- **Category Blockers, Bedtime Schedules & Custom Rules:** Your category filters, downtime schedules, custom AdBlock rules, app bypass selections, and DNS resolver preferences are stored strictly on-device.
- **JSON Configuration Backups:** Exporting or restoring a JSON configuration backup happens strictly at your request between local storage/clipboard and remains entirely under your control.
- **License & Trial Status:** Your trial installation timestamp and one-time Lifetime Pro purchase entitlement are stored locally on your device.

---

## 5. In-App Purchases & Financial Information

- AegisGuard: Ad & DNS Blocker offers an optional **Lifetime Pro** license as a one-time in-app purchase.
- All purchase processing and financial transactions are handled exclusively by **Apple App Store (StoreKit)** on iOS or **Google Play Billing** on Android.
- We do not collect, process, or have access to your credit card number, banking details, or billing address.

---

## 6. Upstream DNS Resolvers & Third-Party Non-Affiliation Disclaimer

AegisGuard configures encrypted DNS routing via independent public Anycast resolvers or optional user-supplied Private DNS endpoints:
- **Built-in Presets:** Aegis Secure DNS, Aegis Family Shield, Cloudflare DNS (`1.1.1.1` / `1.1.1.3`), Google Public DNS (`8.8.8.8`), and Quad9 (`9.9.9.9`).
- **Custom Private DNS & `sdns://` Stamps:** Users may enter personal **NextDNS**, **Control D**, **AdGuard Private DNS**, custom DoH URLs, or `sdns://` stamps. When you configure a personal account-linked resolver (e.g. your own NextDNS or Control D ID), encrypted DNS lookups are handled by that provider according to their privacy policy.

### Non-Affiliation & Trademark Notice
AegisGuard: Ad & DNS Blocker and Fajostech are independent entities. AegisGuard: Ad & DNS Blocker is **not affiliated with, associated with, authorized by, sponsored by, or endorsed by** AdGuard, Cloudflare, Quad9, NextDNS, Control D, Google, Apple, or any other third-party DNS or network provider. All trademarks, registered trademarks, service marks, and company names mentioned are the property of their respective owners. Mention of third-party services is strictly for technical identification under nominative fair use.

### Upstream Service Availability Disclaimer
Fajostech does not operate or control the physical servers of third-party public or private DNS networks. We are not liable for any downtime, service latency, regional blocking, or changes made by independent upstream operators.

---

## 7. Children's Privacy & Family Protection (COPPA & GDPR-K)

AegisGuard: Ad & DNS Blocker does not knowingly collect or solicit personal information from children under the age of 13. Furthermore, AegisGuard includes optional **Family Shield Mode**, **SafeSearch Enforcement**, **Biometric Parental Lock**, **Category Blockers**, and **Bedtime Schedules** operating strictly on-device to help parents create a safer environment for families.

---

## 8. Security of Your Data

Because AegisGuard stores user settings, backups, and local logs exclusively inside the operating system's isolated sandbox, your data is protected by the device's hardware encryption, biometrics (Face ID / Touch ID / Fingerprint), and OS access controls.

---

## 9. Changes to This Privacy Policy

We may update our Privacy Policy periodically to reflect new features, technological updates, or regulatory changes. Any changes will be posted within the application and in this repository with an updated effective date.

---

## 10. Contact Us

If you have questions, comments, or concerns regarding this Privacy Policy, please contact our team:
- **Email:** fajostech@gmail.com
- **Support URL:** https://fajostech.com/contact
- **Developer:** Fajostech / Femi Adeyemi
- **Repository:** https://github.com/fajos/aegis-guard
