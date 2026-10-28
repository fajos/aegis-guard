package com.fajostech.aegisguard

import com.fajostech.aegisguard.filter.AdBlockRule
import com.fajostech.aegisguard.filter.DnsFilterEngine
import com.fajostech.aegisguard.filter.RuleMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RuleMatcherTest {

    private lateinit var matcher: RuleMatcher

    @Before
    fun setup() {
        matcher = RuleMatcher()
    }

    @Test
    fun testAdblockSyntaxSubdomains() {
        val rule = AdBlockRule.parse("||doubleclick.net^")!!
        matcher.addRule(rule)

        val res1 = matcher.match("ad.doubleclick.net")
        assertTrue(res1 is RuleMatcher.MatchResult.Blocked)

        val res2 = matcher.match("secure.pub.doubleclick.net")
        assertTrue(res2 is RuleMatcher.MatchResult.Blocked)

        val res3 = matcher.match("doubleclick.net")
        assertTrue(res3 is RuleMatcher.MatchResult.Blocked)

        val res4 = matcher.match("notdoubleclick.net")
        assertTrue(res4 is RuleMatcher.MatchResult.NoMatch)
    }

    @Test
    fun testAllowlistExceptionOverridesBlocklist() {
        matcher.addRule(AdBlockRule.parse("||example.com^")!!)
        matcher.addRule(AdBlockRule.parse("@@||static.example.com^")!!)

        val res1 = matcher.match("ads.example.com")
        assertTrue(res1 is RuleMatcher.MatchResult.Blocked)

        val res2 = matcher.match("static.example.com")
        assertTrue(res2 is RuleMatcher.MatchResult.Allowed)
    }

    @Test
    fun testImportantModifierPrecedence() {
        // Normal allowlist
        matcher.addRule(AdBlockRule.parse("@@||tracker.com^")!!)
        // Important blocklist
        matcher.addRule(AdBlockRule.parse("||tracker.com^\$important")!!)

        val res = matcher.match("tracker.com")
        assertTrue("Important blocklist must override normal allowlist", res is RuleMatcher.MatchResult.Blocked)
    }

    @Test
    fun testDnsRewriteRule() {
        val rule = AdBlockRule.parse("||internal-service.local^\$dnsrewrite=192.168.1.50")!!
        matcher.addRule(rule)

        val res = matcher.match("internal-service.local")
        assertTrue(res is RuleMatcher.MatchResult.Rewrite)
        assertEquals("192.168.1.50", (res as RuleMatcher.MatchResult.Rewrite).rewriteIp)
    }

    @Test
    fun testRegexRule() {
        val rule = AdBlockRule.parse("/^ad[0-9]+\\.network\\.com$/")!!
        matcher.addRule(rule)

        val res1 = matcher.match("ad123.network.com")
        assertTrue(res1 is RuleMatcher.MatchResult.Blocked)

        val res2 = matcher.match("other.network.com")
        assertTrue(res2 is RuleMatcher.MatchResult.NoMatch)
    }

    @Test
    fun testDnsFilterEngineEvaluation() {
        val engine = DnsFilterEngine()

        val eval1 = engine.evaluate("pagead2.googlesyndication.com")
        assertTrue(eval1.isBlocked)

        val eval2 = engine.evaluate("github.com")
        assertFalse(eval2.isBlocked)

        // Test ECH blocking (query type 65)
        val evalEch = engine.evaluate("cloudflare.com", queryType = 65)
        assertTrue("ECH query type 65 must be blocked when blockEch is enabled", evalEch.isBlocked)
    }
}
