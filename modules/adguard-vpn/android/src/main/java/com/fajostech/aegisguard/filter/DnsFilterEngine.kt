package com.fajostech.aegisguard.filter

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.util.concurrent.atomic.AtomicLong

/**
 * Core DNS Filter Engine modeling AdGuard's DnsProxy native filtering pipeline.
 */
class DnsFilterEngine(
    var blockingMode: BlockingMode = BlockingMode.ADDRESS,
    var blockedTtlSecs: Long = 3600L,
    var blockIpv6: Boolean = false,
    var blockEch: Boolean = false,
    var blockH3Alpn: Boolean = false
) {
    private val matcher = RuleMatcher()

    @Volatile
    var isPremium: Boolean = true

    var enableSafeSearch: Boolean = false
    var enableFamilyFilter: Boolean = false

    @Volatile
    private var categoryDomains: Set<String> = emptySet()

    fun setCategoryDomains(domains: List<String>) {
        categoryDomains = domains.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    }

    private val phishingTokens = listOf(
        "verify-account", "login-update", "secure-billing", "wallet-connect",
        "free-nitro", "claim-prize", "appleid-support", "paypal-confirm",
        "account-suspended", "seed-phrase", "recovery-wallet", "signin-verify"
    )
    private val phishingBrands = listOf(
        "paypal", "apple", "google", "microsoft", "amazon", "bank",
        "chase", "coinbase", "binance", "metamask", "wallet", "login", "verify", "secure"
    )
    private val cryptoMiners = setOf(
        "coinhive.com", "crypto-loot.com", "authedmine.com",
        "minero.cc", "webminepool.com", "jsecoin.com", "monerominer.rocks"
    )

    private fun checkPhishingThreat(domain: String): String? {
        val lower = domain.lowercase()
        if (lower.contains("xn--") && phishingBrands.any { lower.contains(it) }) {
            return "||$lower^\$phishing-homograph"
        }
        if (phishingTokens.any { lower.contains(it) }) {
            return "||$lower^\$phishing-shield"
        }
        if (cryptoMiners.any { lower == it || lower.endsWith(".$it") }) {
            return "||$lower^\$cryptominer-threat"
        }
        return null
    }

    private fun isDomainInCategory(domain: String): String? {
        val cats = categoryDomains
        if (cats.isEmpty()) return null
        val lower = domain.lowercase()
        for (cat in cats) {
            if (lower == cat || lower.endsWith(".$cat")) {
                return cat
            }
        }
        return null
    }

    val totalQueries = AtomicLong(0)
    val blockedQueries = AtomicLong(0)
    val allowedQueries = AtomicLong(0)

    init {
        loadDefaultRules()
    }

    /**
     * Checks whether a requested hostname and query type should be blocked or rewritten.
     */
    fun evaluate(domain: String, queryType: Int = 1): EvaluationResult {
        totalQueries.incrementAndGet()

        // Basic Mode (Trial Expired & Not Purchased): allow DNS privacy passthrough only
        if (!isPremium) {
            allowedQueries.incrementAndGet()
            return EvaluationResult(
                isBlocked = false,
                domain = domain
            )
        }

        // 1. IPv6 blocking check (AAAA = 28)
        if (blockIpv6 && queryType == 28) {
            blockedQueries.incrementAndGet()
            return EvaluationResult(
                isBlocked = true,
                domain = domain,
                blockingMode = blockingMode,
                ttl = blockedTtlSecs,
                matchedRule = "Block IPv6 (AAAA)"
            )
        }

        // 2. Encrypted Client Hello (ECH) block (HTTPS/SVCB query type 65)
        // Must return NODATA (NOERROR with 0 answers via ADDRESS mode) so RFC 9460 clients
        // fall back cleanly to standard A/AAAA records without failing the entire domain.
        if (blockEch && queryType == 65) {
            blockedQueries.incrementAndGet()
            return EvaluationResult(
                isBlocked = true,
                domain = domain,
                blockingMode = BlockingMode.ADDRESS,
                ttl = 300L,
                matchedRule = "Block ECH (Encrypted Client Hello)"
            )
        }

        // 3. SafeSearch VIP Enforcement
        if (enableSafeSearch) {
            val safeRewrite = getSafeSearchRewrite(domain)
            if (safeRewrite != null) {
                blockedQueries.incrementAndGet()
                return EvaluationResult(
                    isBlocked = true,
                    isRewrite = true,
                    domain = domain,
                    rewriteIp = safeRewrite,
                    ttl = 300L,
                    matchedRule = "SafeSearch VIP Enforcement ($safeRewrite)"
                )
            }
        }

        // 4. Match against filtering rules
        return when (val match = matcher.match(domain)) {
            is RuleMatcher.MatchResult.Blocked -> {
                val threatHit = checkPhishingThreat(domain) != null
                blockedQueries.incrementAndGet()
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = blockingMode,
                    ttl = blockedTtlSecs,
                    matchedRule = match.rule.rawText,
                    isThreatAlert = threatHit
                )
            }
            is RuleMatcher.MatchResult.Rewrite -> {
                blockedQueries.incrementAndGet()
                EvaluationResult(
                    isBlocked = true,
                    isRewrite = true,
                    domain = domain,
                    rewriteIp = match.rewriteIp,
                    rewriteCname = match.rewriteCname,
                    ttl = 300L,
                    matchedRule = match.rule.rawText
                )
            }
            is RuleMatcher.MatchResult.Allowed -> {
                allowedQueries.incrementAndGet()
                EvaluationResult(
                    isBlocked = false,
                    domain = domain,
                    matchedRule = match.rule.rawText
                )
            }
            is RuleMatcher.MatchResult.NoMatch -> {
                val threatRule = checkPhishingThreat(domain)
                if (threatRule != null) {
                    blockedQueries.incrementAndGet()
                    EvaluationResult(
                        isBlocked = true,
                        domain = domain,
                        blockingMode = blockingMode,
                        ttl = blockedTtlSecs,
                        matchedRule = threatRule,
                        isThreatAlert = true
                    )
                } else {
                    val blockedCategory = isDomainInCategory(domain)
                    if (blockedCategory != null) {
                        blockedQueries.incrementAndGet()
                        EvaluationResult(
                            isBlocked = true,
                            domain = domain,
                            blockingMode = blockingMode,
                            ttl = blockedTtlSecs,
                            matchedRule = "||$blockedCategory^\$category"
                        )
                    } else {
                        allowedQueries.incrementAndGet()
                        EvaluationResult(
                            isBlocked = false,
                            domain = domain
                        )
                    }
                }
            }
        }
    }

    fun loadRulesFromStream(inputStream: InputStream): Int {
        var count = 0
        BufferedReader(InputStreamReader(inputStream)).useLines { lines ->
            lines.forEach { line ->
                val rule = AdBlockRule.parse(line)
                if (rule != null) {
                    matcher.addRule(rule)
                    count++
                }
            }
        }
        return count
    }

    fun loadRulesFromString(rulesContent: String): Int {
        var count = 0
        rulesContent.lineSequence().forEach { line ->
            val rule = AdBlockRule.parse(line)
            if (rule != null) {
                matcher.addRule(rule)
                count++
            }
        }
        return count
    }

    fun getRuleCount(): Int = matcher.totalRules()

    fun clearRules() {
        matcher.clear()
    }

    fun loadDefaultRules() {
        val defaultRules = listOf(
            "||doubleclick.net^",
            "||google-analytics.com^",
            "||googlesyndication.com^",
            "||googleadservices.com^",
            "||pagead2.googlesyndication.com^",
            "||ads.facebook.com^",
            "||an.facebook.com^",
            "||adservice.google.com^",
            "||app-measurement.com^",
            "||adnxs.com^",
            "||criteo.com^",
            "||taboola.com^",
            "||outbrain.com^",
            "||scorecardresearch.com^",
            "||quantserve.com^",
            "||chartbeat.net^",
            "||branch.io^",
            "||appsflyer.com^",
            "||adjust.com^",
            "||unityads.unity3d.com^",
            "||vungle.com^",
            "||ironsrc.com^",
            "||applovin.com^",
            "||mopub.com^",
            "||flurry.com^",
            "||crashlytics.com^",
            "||adcolony.com^",
            "||amazon-adsystem.com^",
            "||moatads.com^",
            "||rubiconproject.com^",
            "||pubmatic.com^",
            "||openx.net^",
            "||smartadserver.com^",
            "||popcash.net^",
            "||popads.net^",
            "||propellerads.com^",
            "||adroll.com^",
            "||mixpanel.com^",
            "||amplitude.com^",
            "||telemetry.sdk.inmobi.com^",
            "||admob.com^",
            "||ads.yahoo.com^",
            "||m.yap.yahoo.com^",
            "||b.gemini.yahoo.com^",
            "||gemini.yahoo.com^",
            "||beap.gemini.yahoo.com^",
            "||pr.comet.yahoo.com^",
            "||adserver.yahoo.com^",
            "||yads.c.oath.com^",
            "||yads.zedo.com^",
            "||analytics.query.yahoo.com^",
            "||ups.analytics.yahoo.com^",
            "||opus.analytics.yahoo.com^",
            "||sp.analytics.yahoo.com^",
            "||cmp.yahoo.com^",
            "||coinhive.com^"
        )
        defaultRules.forEach { line ->
            AdBlockRule.parse(line)?.let { matcher.addRule(it) }
        }
    }

    private fun getSafeSearchRewrite(domain: String): String? {
        val lower = domain.lowercase()
        // Google SafeSearch: forcesafesearch.google.com -> 216.239.38.120
        if (lower == "google.com" || lower.endsWith(".google.com") || lower.matches(Regex("^(www\\.)?google\\.[a-z.]+$"))) {
            return "216.239.38.120"
        }
        // YouTube Restricted Mode: restrict.youtube.com -> 216.239.38.119
        if (lower == "youtube.com" || lower.endsWith(".youtube.com") || lower == "m.youtube.com") {
            return "216.239.38.119"
        }
        // Bing Strict SafeSearch: strict.bing.com -> 204.79.197.220
        if (lower == "bing.com" || lower.endsWith(".bing.com")) {
            return "204.79.197.220"
        }
        // DuckDuckGo SafeSearch: safe.duckduckgo.com -> 52.142.124.215
        if (lower == "duckduckgo.com" || lower.endsWith(".duckduckgo.com")) {
            return "52.142.124.215"
        }
        return null
    }

    data class EvaluationResult(
        val isBlocked: Boolean,
        val isRewrite: Boolean = false,
        val rewriteIp: String? = null,
        val rewriteCname: String? = null,
        val domain: String,
        val blockingMode: BlockingMode = BlockingMode.ADDRESS,
        val ttl: Long = 3600L,
        val matchedRule: String? = null,
        val isThreatAlert: Boolean = false
    )
}
