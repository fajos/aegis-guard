# Privacy Policy for Aegis Guard

**Effective Date:** November 2, 2026  
**Developer:** Fajostechnologies Ltd / Femi Adeyemi  
**Application:** Aegis Guard (`com.fajostech.aegisguard`)  
**Contact:** privacy@fajostech.com

---

## 1. Introduction & Our Core Commitment

Welcome to **Aegis Guard** ("we", "our", or "us"). We are committed to protecting your privacy and empowering you with complete control over your network traffic, advertisements, and personal data.

**Our Core Privacy Policy is simple: Zero Logs, Zero Tracking, Zero Data Collection.**

Aegis Guard is designed from the ground up as an on-device utility. We do not operate tracking servers, we do not log your online activities, and we do not monetize or sell your personal data.

---

## 2. Information We DO NOT Collect

Unlike traditional VPN providers or web proxies, Aegis Guard does **not** collect or store:
- ❌ **No Browsing History:** We never see or store the websites you visit, pages you view, or content you access.
- ❌ **No DNS Query Logs on Remote Servers:** Your DNS requests are never sent to or recorded on our servers.
- ❌ **No IP Address Tracking:** We do not record or track your public or private IP addresses.
- ❌ **No Advertising Identifiers:** We do not read, track, or share your IDFA (Identifier for Advertisers) or Android Advertising ID.
- ❌ **No Personal Identity Data:** We do not require you to create an account, register your email address, or provide your real name.

---

## 3. How Aegis Guard Works (On-Device Architecture)

Aegis Guard operates locally on your device using native operating system security frameworks:

### A. iOS (Apple NetworkExtension Framework)
- On iOS devices, Aegis Guard configures encrypted **DNS-over-HTTPS (DoH)** via Apple's official `NEDNSSettingsManager` system API.
- All DNS lookups are encrypted using TLS/HTTPS directly between your device and your chosen privacy-preserving upstream resolver (such as AdGuard DNS or Cloudflare DoH).
- We operate no intermediate cloud proxy. All ad-blocking evaluation occurs via encrypted DNS filtering or locally on your hardware.

### B. Android (Local Loopback VpnService)
- On Android devices, Aegis Guard uses the Android `VpnService` API to establish a local, on-device loopback interface (`10.0.0.2`).
- Network packets are processed and filtered locally on your device's processor. No packets are forwarded through third-party remote VPN servers.

---

## 4. Data Stored Locally on Your Device

For the app to function properly, certain data is stored **strictly within your device's local application sandbox**:
- **Query Logs:** If query logging is enabled, recent DNS queries (domain name, query type, timestamp, and blocked/allowed status) are saved exclusively to your device's local storage (`AsyncStorage`). This data never leaves your device. You can purge your query logs at any time with a single tap using the **"Clear Logs"** button.
- **Custom Rules & Exclusions:** Any custom user rules, app routing bypasses, and DNS configuration settings you create are stored strictly on-device.
- **License & Trial Status:** Your trial installation timestamp and one-time Lifetime purchase entitlement are stored locally on your device.

---

## 5. In-App Purchases & Financial Information

- Aegis Guard offers an optional **Lifetime Pro** license as a one-time in-app purchase.
- All purchase processing and financial transactions are handled exclusively by **Apple App Store (StoreKit)** on iOS or **Google Play Billing** on Android.
- We do not collect, process, or have access to your credit card number, banking details, or billing address.

---

## 6. Upstream DNS Resolvers & Third Parties

When Aegis Guard is active, encrypted DNS queries are routed to the upstream DNS resolver configured in your app settings:
- **AdGuard DNS (Default):** Ad-blocking, tracking protection, and parental control. AdGuard DNS operates under strict privacy principles and does not log user IP addresses or DNS histories.
- **Cloudflare DNS (Basic Mode):** High-speed encrypted DNS resolver (`1.1.1.1`) with a strict public no-logs commitment and independent third-party privacy audits.
- **Custom Upstream Resolvers:** You may configure any custom DoH, DoT, or DNSCrypt server of your choice.

---

## 7. Children's Privacy (COPPA & GDPR-K Compliance)

Aegis Guard does not knowingly collect or solicit personal information from children under the age of 13. Furthermore, Aegis Guard includes an optional **Family Shield Mode** designed specifically to help parents protect children by blocking adult content, explicit websites, and enforcing safe search across search engines.

---

## 8. Security of Your Data

Because Aegis Guard stores user settings and local logs exclusively inside the operating system's isolated sandbox, your data is protected by the device's hardware encryption, biometrics (Face ID / Touch ID / Fingerprint), and OS access controls.

---

## 9. Changes to This Privacy Policy

We may update our Privacy Policy periodically to reflect technological or regulatory changes. Any changes will be posted within the application and in this repository with an updated effective date.

---

## 10. Contact Us

If you have questions, comments, or concerns regarding this Privacy Policy, please contact our team:
- **Email:** privacy@fajostech.com / support@fajostech.com
- **Developer:** Fajostechnologies Ltd / Femi Adeyemi
- **Repository:** https://github.com/fajos/aegis-guard
