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
    var blockEch: Boolean = true,
    var blockH3Alpn: Boolean = false
) {
    private val matcher = RuleMatcher()

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

        // 2. Encrypted Client Hello (ECH) bypass block (HTTPS/SVCB query type 65)
        if (blockEch && queryType == 65) {
            blockedQueries.incrementAndGet()
            return EvaluationResult(
                isBlocked = true,
                domain = domain,
                blockingMode = BlockingMode.NXDOMAIN,
                ttl = 300L,
                matchedRule = "Block ECH (Encrypted Client Hello)"
            )
        }

        // 3. Match against filtering rules
        return when (val match = matcher.match(domain)) {
            is RuleMatcher.MatchResult.Blocked -> {
                blockedQueries.incrementAndGet()
                EvaluationResult(
                    isBlocked = true,
                    domain = domain,
                    blockingMode = blockingMode,
                    ttl = blockedTtlSecs,
                    matchedRule = match.rule.rawText
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
                allowedQueries.incrementAndGet()
                EvaluationResult(
                    isBlocked = false,
                    domain = domain
                )
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

    private fun loadDefaultRules() {
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
            "||admob.com^"
        )
        defaultRules.forEach { line ->
            AdBlockRule.parse(line)?.let { matcher.addRule(it) }
        }
    }

    data class EvaluationResult(
        val isBlocked: Boolean,
        val isRewrite: Boolean = false,
        val rewriteIp: String? = null,
        val rewriteCname: String? = null,
        val domain: String,
        val blockingMode: BlockingMode = BlockingMode.ADDRESS,
        val ttl: Long = 3600L,
        val matchedRule: String? = null
    )
}
