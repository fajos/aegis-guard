package com.fajostech.aegisguard.filter

import java.util.regex.Pattern

/**
 * Advanced AdBlock Rule parser matching AdGuard's full rule syntax specifications:
 * - Plain domain: "ad.example.com"
 * - Hosts entry: "0.0.0.0 ad.example.com" or "127.0.0.1 tracker.com"
 * - AdBlock syntax: "||example.com^"
 * - Allowlist syntax: "@@||example.com^"
 * - Regex syntax: "/^ad[0-9]+\.example\.com$/"
 * - Modifiers:
 *     $dnsrewrite=1.2.3.4 (A record rewrite)
 *     $dnsrewrite=CNAME;target.com (CNAME rewrite)
 *     $important (takes precedence over exceptions)
 *     $badfilter (negates an existing rule)
 */
data class AdBlockRule(
    val rawText: String,
    val pattern: String,
    val isAllowlist: Boolean = false,
    val matchSubdomains: Boolean = true,
    val isRegex: Boolean = false,
    val regexPattern: Pattern? = null,
    val isImportant: Boolean = false,
    val isBadFilter: Boolean = false,
    val dnsRewriteIp: String? = null,
    val dnsRewriteCname: String? = null
) {
    companion object {
        fun parse(line: String): AdBlockRule? {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("!")) {
                return null // Comment or empty
            }

            var working = trimmed
            var isImportant = false
            var isBadFilter = false
            var dnsRewriteIp: String? = null
            var dnsRewriteCname: String? = null

            // Extract modifiers if present after '$'
            val dollarIdx = working.lastIndexOf('$')
            if (dollarIdx != -1 && !working.endsWith("/")) {
                val modifiersPart = working.substring(dollarIdx + 1)
                working = working.substring(0, dollarIdx)

                val modifiers = modifiersPart.split(',')
                for (mod in modifiers) {
                    val m = mod.trim().lowercase()
                    when {
                        m == "important" -> isImportant = true
                        m == "badfilter" -> isBadFilter = true
                        m.startsWith("dnsrewrite=") -> {
                            val rewriteTarget = mod.substring("dnsrewrite=".length).trim()
                            if (rewriteTarget.startsWith("cname;", ignoreCase = true)) {
                                dnsRewriteCname = rewriteTarget.substring(6).trim()
                            } else {
                                dnsRewriteIp = rewriteTarget
                            }
                        }
                    }
                }
            }

            // Regex syntax: /pattern/
            if (working.startsWith("/") && working.endsWith("/") && working.length > 2) {
                val regexStr = working.substring(1, working.length - 1)
                return try {
                    val pattern = Pattern.compile(regexStr, Pattern.CASE_INSENSITIVE)
                    AdBlockRule(
                        rawText = trimmed,
                        pattern = regexStr,
                        isAllowlist = false,
                        isRegex = true,
                        regexPattern = pattern,
                        isImportant = isImportant,
                        isBadFilter = isBadFilter,
                        dnsRewriteIp = dnsRewriteIp,
                        dnsRewriteCname = dnsRewriteCname
                    )
                } catch (e: Exception) {
                    null
                }
            }

            // Exception / Allowlist: @@||example.com^ or @@example.com
            if (working.startsWith("@@")) {
                var content = working.substring(2)
                var matchSubdomains = false
                if (content.startsWith("||")) {
                    content = content.substring(2)
                    matchSubdomains = true
                }
                if (content.endsWith("^")) {
                    content = content.substring(0, content.length - 1)
                }
                val domain = sanitizeDomain(content) ?: return null
                return AdBlockRule(
                    rawText = trimmed,
                    pattern = domain,
                    isAllowlist = true,
                    matchSubdomains = matchSubdomains,
                    isImportant = isImportant,
                    isBadFilter = isBadFilter,
                    dnsRewriteIp = dnsRewriteIp,
                    dnsRewriteCname = dnsRewriteCname
                )
            }

            // Adblock syntax: ||example.com^
            if (working.startsWith("||")) {
                var content = working.substring(2)
                if (content.endsWith("^")) {
                    content = content.substring(0, content.length - 1)
                }
                val domain = sanitizeDomain(content) ?: return null
                return AdBlockRule(
                    rawText = trimmed,
                    pattern = domain,
                    isAllowlist = false,
                    matchSubdomains = true,
                    isImportant = isImportant,
                    isBadFilter = isBadFilter,
                    dnsRewriteIp = dnsRewriteIp,
                    dnsRewriteCname = dnsRewriteCname
                )
            }

            // Hosts syntax: 0.0.0.0 domain.com or 127.0.0.1 domain.com
            if (working.startsWith("0.0.0.0 ") || working.startsWith("127.0.0.1 ") || working.startsWith("::1 ")) {
                val parts = working.split(Regex("\\s+"))
                if (parts.size >= 2) {
                    val domain = sanitizeDomain(parts[1]) ?: return null
                    return AdBlockRule(
                        rawText = trimmed,
                        pattern = domain,
                        isAllowlist = false,
                        matchSubdomains = false,
                        isImportant = isImportant,
                        isBadFilter = isBadFilter,
                        dnsRewriteIp = dnsRewriteIp,
                        dnsRewriteCname = dnsRewriteCname
                    )
                }
            }

            // Plain domain or domain^
            var domainCandidate = working
            if (domainCandidate.endsWith("^")) {
                domainCandidate = domainCandidate.substring(0, domainCandidate.length - 1)
            }
            val domain = sanitizeDomain(domainCandidate) ?: return null
            return AdBlockRule(
                rawText = trimmed,
                pattern = domain,
                isAllowlist = false,
                matchSubdomains = true,
                isImportant = isImportant,
                isBadFilter = isBadFilter,
                dnsRewriteIp = dnsRewriteIp,
                dnsRewriteCname = dnsRewriteCname
            )
        }

        private fun sanitizeDomain(raw: String): String? {
            val domain = raw.trim().lowercase().removePrefix("http://").removePrefix("https://").split("/")[0].split(":")[0]
            return if (domain.contains(".") && !domain.contains(" ")) domain else null
        }
    }
}
