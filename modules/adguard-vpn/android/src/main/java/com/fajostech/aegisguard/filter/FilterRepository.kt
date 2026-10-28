package com.fajostech.aegisguard.filter

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

class FilterRepository(private val context: Context) {

    companion object {
        private const val TAG = "FilterRepository"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val filtersDir = File(context.filesDir, "filters").apply { mkdirs() }
    private val userRulesFile = File(context.filesDir, "user_rules.txt")

    private val subscriptions = mutableListOf<FilterSubscription>()

    init {
        initDefaultSubscriptions()
    }

    private fun initDefaultSubscriptions() {
        subscriptions.clear()
        subscriptions.add(
            FilterSubscription(
                id = 1,
                name = "AdGuard Base Filter",
                description = "Comprehensive ad-blocking rules for popular web applications",
                url = "https://filters.adtidy.org/extension/chromium/filters/2.txt",
                isEnabled = true
            )
        )
        subscriptions.add(
            FilterSubscription(
                id = 2,
                name = "AdGuard Tracking Protection",
                description = "Blocks telemetry, analytics, trackers and user profiling scripts",
                url = "https://filters.adtidy.org/extension/chromium/filters/3.txt",
                isEnabled = true
            )
        )
        subscriptions.add(
            FilterSubscription(
                id = 3,
                name = "AdGuard Mobile Ads Filter",
                description = "Specialized filter targeting mobile advertising networks & in-app ads",
                url = "https://filters.adtidy.org/extension/chromium/filters/11.txt",
                isEnabled = true
            )
        )
        subscriptions.add(
            FilterSubscription(
                id = 4,
                name = "AdGuard DNS Filter",
                description = "Optimized DNS filter rules composed for high-throughput DNS proxies",
                url = "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
                isEnabled = true
            )
        )
    }

    fun getSubscriptions(): List<FilterSubscription> = subscriptions.toList()

    fun initializeDefaults(engine: DnsFilterEngine) {
        // Load custom user rules
        loadUserRules(engine)

        // Seed default starter rules if not yet present
        seedDefaultRulesIfEmpty()

        // For predefined subscriptions, check if cached file exists
        for (sub in subscriptions) {
            if (!sub.isEnabled) continue
            val file = File(filtersDir, "filter_${sub.id}.txt")
            if (file.exists()) {
                val loaded = file.inputStream().use { engine.loadRulesFromStream(it) }
                sub.ruleCount = loaded
                sub.lastUpdated = file.lastModified()
            }
        }
    }

    private fun seedDefaultRulesIfEmpty() {
        val file = File(filtersDir, "filter_1.txt")
        if (!file.exists() || file.length() == 0L) {
            val defaultRules = """
                ! Aegis Guard Built-in Seed Filter Rules
                ||doubleclick.net^
                ||googleads.g.doubleclick.net^
                ||adservice.google.com^
                ||www.google-analytics.com^
                ||analytics.google.com^
                ||stats.g.doubleclick.net^
                ||securepubads.g.doubleclick.net^
                ||ad.doubleclick.net^
                ||pagead2.googlesyndication.com^
                ||ads.pubmatic.com^
                ||ib.adnxs.com^
                ||c.amazon-adsystem.com^
                ||aax.amazon-adsystem.com^
                ||fls-na.amazon-adsystem.com^
                ||static.criteo.net^
                ||cas.criteo.com^
                ||bidder.criteo.com^
                ||tr.snapchat.com^
                ||ads.tiktok.com^
                ||analytics.tiktok.com^
                ||pixel.facebook.com^
                ||an.facebook.com^
                ||ads.yahoo.com^
                ||taboola.com^
                ||outbrain.com^
                ||adcolony.com^
                ||applovin.com^
                ||applvn.com^
                ||vungle.com^
                ||unityads.unity3d.com^
                ||chartboost.com^
                ||ironsource.com^
                ||supersonicads.com^
                ||inmobi.com^
                ||mobfox.com^
                ||mopub.com^
                ||adjust.com^
                ||appsflyer.com^
                ||branch.io^
                ||kochava.com^
                ||crashlytics.com^
                ||adservice.google.*^
                ||telemetry.sdk.*^
                ||test-ad-domain.com^
                ||adguard-dns-test.com^
            """.trimIndent()
            file.writeText(defaultRules)
        }
    }

    suspend fun updateSubscription(sub: FilterSubscription, engine: DnsFilterEngine): Boolean = withContext(Dispatchers.IO) {
        val url = sub.url ?: return@withContext false
        try {
            val req = Request.Builder().url(url).build()
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) return@withContext false
                val content = response.body?.string() ?: return@withContext false

                val file = File(filtersDir, "filter_${sub.id}.txt")
                file.writeText(content)

                sub.lastUpdated = System.currentTimeMillis()
                reloadAll(engine)
                return@withContext true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download filter: ${sub.name}", e)
            return@withContext false
        }
    }

    fun reloadAll(engine: DnsFilterEngine) {
        engine.clearRules()

        // Reload user rules
        loadUserRules(engine)

        // Reload enabled subscriptions
        for (sub in subscriptions) {
            if (!sub.isEnabled) continue
            val file = File(filtersDir, "filter_${sub.id}.txt")
            if (file.exists()) {
                val loaded = file.inputStream().use { engine.loadRulesFromStream(it) }
                sub.ruleCount = loaded
            }
        }
    }

    fun getUserRules(): String {
        return if (userRulesFile.exists()) userRulesFile.readText() else ""
    }

    fun saveUserRules(rulesText: String, engine: DnsFilterEngine) {
        userRulesFile.writeText(rulesText)
        reloadAll(engine)
    }

    private fun loadUserRules(engine: DnsFilterEngine) {
        if (userRulesFile.exists()) {
            engine.loadRulesFromString(userRulesFile.readText())
        }
    }

    fun addCustomSubscription(name: String, url: String, engine: DnsFilterEngine): FilterSubscription {
        val nextId = (subscriptions.maxOfOrNull { it.id } ?: 0) + 1
        val sub = FilterSubscription(
            id = nextId,
            name = name,
            description = "Custom User Filter Subscription",
            url = url,
            isEnabled = true,
            isCustom = true
        )
        subscriptions.add(sub)
        return sub
    }
}
