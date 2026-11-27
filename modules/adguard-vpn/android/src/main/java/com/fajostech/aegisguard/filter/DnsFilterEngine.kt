package com.fajostech.aegisguard.filter

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.util.Calendar
import java.util.concurrent.atomic.AtomicLong

/**
 * Core DNS Filter Engine modeling AdGuard's DnsProxy native filtering pipeline.
 */
class DnsFilterEngine(
    var blockingMode: BlockingMode = BlockingMode.ADDRESS,
    var blockedTtlSecs: Long = 60L,
    var blockIpv6: Boolean = false,
    var blockEch: Boolean = false,
    var blockH3Alpn: Boolean = false
) {
    private val matcher = RuleMatcher()
    private val userMatcher = RuleMatcher()

    @Volatile
    var isPremium: Boolean = true

    @Volatile
    var enableSafeSearch: Boolean = false

    @Volatile
    var enableFamilyFilter: Boolean = false

    @Volatile
    var gameAdsBypassEnabled: Boolean = false

    @Volatile
    private var categoryDomains: Set<String> = emptySet()

    @Volatile
    private var excludedDomains: Set<String> = emptySet()

    @Volatile
    private var scheduleEnabled: Boolean = false

    @Volatile
    private var scheduleStartHour: Int = 22

    @Volatile
    private var scheduleEndHour: Int = 7

    @Volatile
    private var scheduledDomains: Set<String> = emptySet()

    fun setCategoryDomains(domains: List<String>) {
        categoryDomains = domains.map { it.trim().lowercase().trimEnd('.') }.filter { it.isNotEmpty() }.toSet()
    }

    fun setExcludedDomains(domains: List<String>) {
        excludedDomains = domains.map { it.trim().lowercase().trimEnd('.') }.filter { it.isNotEmpty() }.toSet()
    }

    fun setBedtimeSchedule(enabled: Boolean, startHour: Int, endHour: Int, domains: List<String>) {
        scheduleEnabled = enabled
        scheduleStartHour = startHour.coerceIn(0, 23)
        scheduleEndHour = endHour.coerceIn(0, 23)
        scheduledDomains = domains.map { it.trim().lowercase().trimEnd('.') }.filter { it.isNotEmpty() }.toSet()
    }

    private fun isWithinScheduleWindow(): Boolean {
        if (!scheduleEnabled || scheduledDomains.isEmpty()) return false
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return if (scheduleStartHour <= scheduleEndHour) {
            hour in scheduleStartHour until scheduleEndHour
        } else {
            hour >= scheduleStartHour || hour < scheduleEndHour
        }
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

    private val adultDomains = setOf(
        "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com",
        "youporn.com", "tube8.com", "spankbang.com", "eporner.com", "beeg.com",
        "chaturbate.com", "onlyfans.com", "stripchat.com", "bongacams.com",
        "cam4.com", "livejasmin.com", "myfreecams.com", "camsoda.com",
        "brazzers.com", "bangbros.com", "realitykings.com", "naughtyamerica.com",
        "digitalplayground.com", "vixen.com", "blacked.com", "tushy.com", "deeper.com",
        "rule34.xxx", "e621.net", "nhentai.net", "hentaihaven.xxx", "hanime.tv",
        "fakku.net", "gelbooru.com", "danbooru.donmai.us", "fetlife.com",
        "literotica.com", "ashleymadison.com", "adultfriendfinder.com",
        "trafficjunky.net", "trafficjunky.com", "exoclick.com", "juicyads.com",
        "ero-advertising.com", "plugrush.com", "txxx.com", "hqporner.com",
        "daftsex.com", "ixxx.com", "motherless.com", "heavy-r.com", "efukt.com",
        "tnaflix.com", "drtuber.com", "xtube.com", "nuvid.com", "sunporno.com",
        "hclips.com", "upornia.com", "thumbzilla.com", "porn.com", "xxx.com"
    )

    private val adultDomainTokens = listOf(
        "porn", "xvideo", "xhamster", "redtube", "youporn", "xnxx", "spankbang",
        "chaturbate", "stripchat", "bongacams", "livejasmin", "myfreecams",
        "brazzers", "bangbros", "hentai", "rule34", "onlyfans", "eporner", "camgirl",
        "nsfw"
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

    private fun matchDomainSet(domain: String, set: Set<String>): String? {
        if (set.isEmpty()) return null
        var cur = domain.lowercase().trimEnd('.')
        while (cur.isNotEmpty()) {
            if (set.contains(cur)) return cur
            val dot = cur.indexOf('.')
            if (dot < 0 || dot + 1 >= cur.length) break
            cur = cur.substring(dot + 1)
        }
        return null
    }

    private fun checkAdultDomain(domain: String): String? {
        if (!enableFamilyFilter) return null
        val exact = matchDomainSet(domain, adultDomains)
        if (exact != null) return "||$exact^\$family-shield"
        val lower = domain.lowercase().trimEnd('.')
        val labels = lower.split('.')
        for (lbl in labels) {
            if (lbl == "xxx" || lbl == "porn" || lbl == "nsfw") {
                return "||$lower^\$family-shield"
            }
            for (tok in adultDomainTokens) {
                if (lbl.contains(tok)) {
                    return "||$lower^\$family-shield"
                }
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
     * Checks whether a domain is blocked without modifying statistics counters.
     */
    fun isDomainBlocked(domain: String): Boolean {
        return evaluateInternal(domain, 1, updateStats = false).isBlocked
    }

    /**
     * Checks whether a requested hostname and query type should be blocked or rewritten.
     */
    fun evaluate(domain: String, queryType: Int = 1): EvaluationResult {
        return evaluateInternal(domain, queryType, updateStats = true)
    }

    private fun evaluateInternal(domain: String, queryType: Int, updateStats: Boolean): EvaluationResult {
        if (updateStats) totalQueries.incrementAndGet()

        fun finishBlocked(res: EvaluationResult): EvaluationResult {
            if (updateStats) blockedQueries.incrementAndGet()
            return res
        }

        fun finishAllowed(res: EvaluationResult): EvaluationResult {
            if (updateStats) allowedQueries.incrementAndGet()
            return res
        }

        // Basic Mode (Trial Expired & Not Purchased): allow DNS privacy passthrough only
        if (!isPremium) {
            return finishAllowed(EvaluationResult(isBlocked = false, domain = domain))
        }

        // 1. IPv6 blocking check (AAAA = 28)
        if (blockIpv6 && queryType == 28) {
            return finishBlocked(
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = blockingMode,
                    ttl = blockedTtlSecs,
                    matchedRule = "Block IPv6 (AAAA)"
                )
            )
        }

        // 2. Encrypted Client Hello (ECH) block (HTTPS/SVCB query type 65)
        if (blockEch && queryType == 65) {
            return finishBlocked(
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = BlockingMode.ADDRESS,
                    ttl = 300L,
                    matchedRule = "Block ECH (Encrypted Client Hello)"
                )
            )
        }

        // 3. Explicit User Custom Rules take top precedence (@@ allows, || blocks)
        when (val userMatch = userMatcher.match(domain)) {
            is RuleMatcher.MatchResult.Blocked -> {
                return finishBlocked(
                    EvaluationResult(
                        isBlocked = true,
                        domain = domain,
                        blockingMode = blockingMode,
                        ttl = blockedTtlSecs,
                        matchedRule = userMatch.rule.rawText,
                        isThreatAlert = checkPhishingThreat(domain) != null
                    )
                )
            }
            is RuleMatcher.MatchResult.Rewrite -> {
                return finishBlocked(
                    EvaluationResult(
                        isBlocked = true,
                        isRewrite = true,
                        domain = domain,
                        rewriteIp = userMatch.rewriteIp,
                        rewriteCname = userMatch.rewriteCname,
                        ttl = 300L,
                        matchedRule = userMatch.rule.rawText
                    )
                )
            }
            is RuleMatcher.MatchResult.Allowed -> {
                return finishAllowed(
                    EvaluationResult(
                        isBlocked = false,
                        domain = domain,
                        matchedRule = userMatch.rule.rawText
                    )
                )
            }
            is RuleMatcher.MatchResult.NoMatch -> {}
        }

        // 4. Real-Time Phishing / Homograph / Cryptominer Shield
        val threatRule = checkPhishingThreat(domain)
        if (threatRule != null) {
            return finishBlocked(
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = blockingMode,
                    ttl = blockedTtlSecs,
                    matchedRule = threatRule,
                    isThreatAlert = true
                )
            )
        }

        // 5. Category Blockers (Social, Gambling, Crypto, etc.) — never overridden by subscription @@ allowlists
        val blockedCategory = matchDomainSet(domain, categoryDomains)
        if (blockedCategory != null) {
            return finishBlocked(
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = blockingMode,
                    ttl = blockedTtlSecs,
                    matchedRule = "||$blockedCategory^\$category"
                )
            )
        }

        // 6. Bedtime / Downtime Schedule Blocker
        if (isWithinScheduleWindow()) {
            val schedDomain = matchDomainSet(domain, scheduledDomains)
            if (schedDomain != null) {
                return finishBlocked(
                    EvaluationResult(
                        isBlocked = true,
                        domain = domain,
                        blockingMode = blockingMode,
                        ttl = blockedTtlSecs,
                        matchedRule = "||$schedDomain^\$schedule"
                    )
                )
            }
        }

        // 7. Adult / Family Protection Shield (only when enableFamilyFilter is ON)
        val adultRule = checkAdultDomain(domain)
        if (adultRule != null) {
            return finishBlocked(
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = blockingMode,
                    ttl = blockedTtlSecs,
                    matchedRule = adultRule
                )
            )
        }

        // 8. SafeSearch VIP Enforcement (when SafeSearch OR Family Filter is enabled)
        if (enableSafeSearch || enableFamilyFilter) {
            val safeRewrite = getSafeSearchRewrite(domain, queryType)
            if (safeRewrite != null) {
                return finishBlocked(
                    EvaluationResult(
                        isBlocked = true,
                        isRewrite = safeRewrite != "__NODATA__",
                        domain = domain,
                        rewriteIp = if (safeRewrite == "__NODATA__") null else safeRewrite,
                        blockingMode = BlockingMode.ADDRESS,
                        ttl = 300L,
                        matchedRule = if (safeRewrite == "__NODATA__") "SafeSearch NODATA" else "SafeSearch VIP Enforcement ($safeRewrite)"
                    )
                )
            }
        }

        // 9. App / Game Rewarded Ad Exclusions (exempt from subscription adlists, never critical security/category blocks)
        val excluded = matchDomainSet(domain, excludedDomains)
        if (excluded != null) {
            return finishAllowed(
                EvaluationResult(
                    isBlocked = false,
                    domain = domain,
                    matchedRule = "@@||$excluded^\$app-exclusion"
                )
            )
        }

        // 10. Subscription & Default Filter Rules
        return when (val match = matcher.match(domain)) {
            is RuleMatcher.MatchResult.Blocked -> {
                finishBlocked(
                    EvaluationResult(
                        isBlocked = true,
                        domain = domain,
                        blockingMode = blockingMode,
                        ttl = blockedTtlSecs,
                        matchedRule = match.rule.rawText
                    )
                )
            }
            is RuleMatcher.MatchResult.Rewrite -> {
                finishBlocked(
                    EvaluationResult(
                        isBlocked = true,
                        isRewrite = true,
                        domain = domain,
                        rewriteIp = match.rewriteIp,
                        rewriteCname = match.rewriteCname,
                        ttl = 300L,
                        matchedRule = match.rule.rawText
                    )
                )
            }
            is RuleMatcher.MatchResult.Allowed -> {
                finishAllowed(
                    EvaluationResult(
                        isBlocked = false,
                        domain = domain,
                        matchedRule = match.rule.rawText
                    )
                )
            }
            is RuleMatcher.MatchResult.NoMatch -> {
                finishAllowed(EvaluationResult(isBlocked = false, domain = domain))
            }
        }
    }

    fun loadUserRulesFromString(rulesContent: String): Int {
        var count = 0
        rulesContent.lineSequence().forEach { line ->
            val rule = AdBlockRule.parse(line)
            if (rule != null) {
                userMatcher.addRule(rule)
                count++
            }
        }
        return count
    }

    fun clearUserRules() {
        userMatcher.clear()
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

    fun getRuleCount(): Int = matcher.totalRules() + userMatcher.totalRules()

    fun clearRules() {
        matcher.clear()
        userMatcher.clear()
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

    private fun getSafeSearchRewrite(domain: String, queryType: Int): String? {
        val lower = domain.lowercase().trimEnd('.')
        // Google SafeSearch: forcesafesearch.google.com
        if (lower.matches(Regex("^(www\\.)?google\\.[a-z.]+$"))) {
            return when (queryType) {
                1 -> "216.239.38.120"
                28 -> "2001:4860:4802:32::78"
                65 -> "__NODATA__"
                else -> null
            }
        }
        // YouTube Restricted Mode: restrict.youtube.com
        if (lower == "youtube.com" || lower == "www.youtube.com" || lower == "m.youtube.com" ||
            lower == "youtubei.googleapis.com" || lower == "youtube-nocookie.com" || lower == "www.youtube-nocookie.com"
        ) {
            return when (queryType) {
                1 -> "216.239.38.119"
                28 -> "2001:4860:4802:32::77"
                65 -> "__NODATA__"
                else -> null
            }
        }
        // Bing Strict SafeSearch: strict.bing.com
        if (lower == "bing.com" || lower == "www.bing.com" || lower == "cn.bing.com") {
            return when (queryType) {
                1 -> "204.79.197.220"
                28, 65 -> "__NODATA__"
                else -> null
            }
        }
        // DuckDuckGo SafeSearch: safe.duckduckgo.com
        if (lower == "duckduckgo.com" || lower == "www.duckduckgo.com" || lower == "html.duckduckgo.com") {
            return when (queryType) {
                1 -> "52.142.124.215"
                28, 65 -> "__NODATA__"
                else -> null
            }
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
        val ttl: Long = 60L,
        val matchedRule: String? = null,
        val isThreatAlert: Boolean = false
    )
}
