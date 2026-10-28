package com.fajostech.aegisguard.filter

/**
 * High-performance domain matcher supporting:
 * - Exact matches ("analytics.google.com")
 * - Subdomain wildcards ("||google-analytics.com^")
 * - Priority allowlists ("@@||domain^")
 * - Important rules ($important)
 * - DNS rewrites ($dnsrewrite=...)
 * - Regular expression patterns (//)
 */
class RuleMatcher {

    private val exactBlockMap = HashMap<String, AdBlockRule>()
    private val exactAllowMap = HashMap<String, AdBlockRule>()
    private val wildcardBlockMap = HashMap<String, AdBlockRule>()
    private val wildcardAllowMap = HashMap<String, AdBlockRule>()

    // Important rules: $important block rules cannot be overridden by ordinary allowlists
    private val importantBlockRules = ArrayList<AdBlockRule>()
    private val importantAllowRules = ArrayList<AdBlockRule>()

    // Regex rules
    private val regexRules = ArrayList<AdBlockRule>()

    @Synchronized
    fun addRule(rule: AdBlockRule) {
        if (rule.isBadFilter) return

        if (rule.isRegex) {
            regexRules.add(rule)
            return
        }

        if (rule.isImportant) {
            if (rule.isAllowlist) {
                importantAllowRules.add(rule)
            } else {
                importantBlockRules.add(rule)
            }
        }

        if (rule.isAllowlist) {
            if (rule.matchSubdomains) {
                wildcardAllowMap[rule.pattern] = rule
            } else {
                exactAllowMap[rule.pattern] = rule
            }
        } else {
            if (rule.matchSubdomains) {
                wildcardBlockMap[rule.pattern] = rule
            } else {
                exactBlockMap[rule.pattern] = rule
            }
        }
    }

    @Synchronized
    fun clear() {
        exactBlockMap.clear()
        exactAllowMap.clear()
        wildcardBlockMap.clear()
        wildcardAllowMap.clear()
        importantBlockRules.clear()
        importantAllowRules.clear()
        regexRules.clear()
    }

    @Synchronized
    fun totalRules(): Int {
        return exactBlockMap.size + exactAllowMap.size + wildcardBlockMap.size + wildcardAllowMap.size + regexRules.size
    }

    fun match(domain: String): MatchResult {
        val normalized = domain.trim().lowercase().removeSuffix(".")

        // 1. Highest priority: $important allowlist rules
        for (r in importantAllowRules) {
            if (domainMatchesPattern(normalized, r)) {
                return MatchResult.Allowed(r)
            }
        }

        // 2. Second priority: $important blocklist rules
        for (r in importantBlockRules) {
            if (domainMatchesPattern(normalized, r)) {
                if (r.dnsRewriteIp != null || r.dnsRewriteCname != null) {
                    return MatchResult.Rewrite(r, r.dnsRewriteIp, r.dnsRewriteCname)
                }
                return MatchResult.Blocked(r)
            }
        }

        // 3. Normal allowlists
        exactAllowMap[normalized]?.let { return MatchResult.Allowed(it) }
        checkSubdomains(normalized, wildcardAllowMap)?.let { return MatchResult.Allowed(it) }

        // 4. Normal blocklists
        exactBlockMap[normalized]?.let { rule ->
            if (rule.dnsRewriteIp != null || rule.dnsRewriteCname != null) {
                return MatchResult.Rewrite(rule, rule.dnsRewriteIp, rule.dnsRewriteCname)
            }
            return MatchResult.Blocked(rule)
        }
        checkSubdomains(normalized, wildcardBlockMap)?.let { rule ->
            if (rule.dnsRewriteIp != null || rule.dnsRewriteCname != null) {
                return MatchResult.Rewrite(rule, rule.dnsRewriteIp, rule.dnsRewriteCname)
            }
            return MatchResult.Blocked(rule)
        }

        // 5. Regex rules
        for (r in regexRules) {
            val reg = r.regexPattern ?: continue
            if (reg.matcher(normalized).find()) {
                if (r.isAllowlist) {
                    return MatchResult.Allowed(r)
                } else {
                    if (r.dnsRewriteIp != null || r.dnsRewriteCname != null) {
                        return MatchResult.Rewrite(r, r.dnsRewriteIp, r.dnsRewriteCname)
                    }
                    return MatchResult.Blocked(r)
                }
            }
        }

        return MatchResult.NoMatch
    }

    private fun domainMatchesPattern(domain: String, rule: AdBlockRule): Boolean {
        if (!rule.matchSubdomains) {
            return domain == rule.pattern
        }
        return domain == rule.pattern || domain.endsWith("." + rule.pattern)
    }

    private fun checkSubdomains(domain: String, map: Map<String, AdBlockRule>): AdBlockRule? {
        map[domain]?.let { return it }

        var current = domain
        while (true) {
            val dotIndex = current.indexOf('.')
            if (dotIndex == -1 || dotIndex == current.length - 1) break
            current = current.substring(dotIndex + 1)
            // Safety guard: Never match bare TLDs (e.g. "com", "org", "net") as wildcard domains
            if (!current.contains('.')) break
            map[current]?.let { return it }
        }
        return null
    }

    sealed class MatchResult {
        object NoMatch : MatchResult()
        data class Blocked(val rule: AdBlockRule) : MatchResult()
        data class Allowed(val rule: AdBlockRule) : MatchResult()
        data class Rewrite(val rule: AdBlockRule, val rewriteIp: String?, val rewriteCname: String?) : MatchResult()
    }
}
