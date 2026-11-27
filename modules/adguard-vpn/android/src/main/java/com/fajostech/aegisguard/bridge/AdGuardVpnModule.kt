package com.fajostech.aegisguard.bridge

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Handler
import android.os.Looper
import com.fajostech.aegisguard.appmanagement.AppManager
import com.fajostech.aegisguard.filter.AdBlockRule
import com.fajostech.aegisguard.filter.BlockingMode
import com.fajostech.aegisguard.filter.FilterRepository
import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.stats.StatisticsManager
import com.fajostech.aegisguard.vpn.LocalVpnService
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native Bridge Module providing complete Aegis Guard DNS filtering,
 * local VPN lifecycle, statistics, and system management capabilities.
 */
class AdGuardVpnModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "AdGuardVpnModule"
        private const val VPN_REQUEST_CODE = 2001
    }

    private var preparePromise: Promise? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    private val filterRepository by lazy { FilterRepository(reactContext) }
    private val appManager by lazy { AppManager(reactContext) }
    private val dnsPrefs by lazy { reactContext.getSharedPreferences("adguard_dns_prefs", Context.MODE_PRIVATE) }

    private val pendingLogQueue = ConcurrentLinkedQueue<com.fajostech.aegisguard.log.QueryLogEntry>()
    private val isFlushScheduled = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())

    private val flushBatchRunnable = Runnable {
        isFlushScheduled.set(false)
        flushLogBatch()
    }

    private val reconfigureRunnable = Runnable {
        if (LocalVpnService.isServiceRunning) {
            val intent = Intent(reactContext, LocalVpnService::class.java).apply {
                action = LocalVpnService.ACTION_RECONFIGURE
            }
            try {
                reactContext.startService(intent)
            } catch (_: Exception) {}
        }
    }

    init {
        reactContext.addActivityEventListener(this)

        // Initialize default and user-configured filter rules
        try {
            filterRepository.initializeDefaults(LocalVpnService.filterEngine)
        } catch (e: Exception) {
            // Non-fatal fallback
        }

        // Restore persisted DNS, category blockers, family shield, schedule, and license settings
        LocalVpnService.syncPersistedState(reactContext)

        // Buffer and batch query logs to prevent flooding the React Native bridge
        FilteringLog.addListener { entry ->
            enqueueLogEntry(entry)
        }
    }

    private fun enqueueLogEntry(entry: com.fajostech.aegisguard.log.QueryLogEntry) {
        // Prevent unbounded memory growth if JS is suspended or bridge is busy
        if (pendingLogQueue.size > 250) {
            pendingLogQueue.poll()
        }
        pendingLogQueue.offer(entry)

        // Flush immediately if batch has reached 20 items, or throttle to 250ms
        if (pendingLogQueue.size >= 20) {
            mainHandler.removeCallbacks(flushBatchRunnable)
            isFlushScheduled.set(false)
            flushLogBatch()
        } else if (!isFlushScheduled.getAndSet(true)) {
            mainHandler.postDelayed(flushBatchRunnable, 250)
        }
    }

    private fun flushLogBatch() {
        if (!reactContext.hasActiveReactInstance()) {
            pendingLogQueue.clear()
            return
        }

        val batch = mutableListOf<com.fajostech.aegisguard.log.QueryLogEntry>()
        while (batch.size < 50 && !pendingLogQueue.isEmpty()) {
            val item = pendingLogQueue.poll() ?: break
            batch.add(item)
        }

        if (batch.isEmpty()) return

        val batchArray = Arguments.createArray()
        for (entry in batch) {
            val map = Arguments.createMap().apply {
                putString("domain", entry.domain)
                putString("queryType", entry.queryType)
                putBoolean("isBlocked", entry.isBlocked)
                putString("matchedRule", entry.matchedRule)
                putDouble("durationMs", entry.durationMs.toDouble())
                putString("upstream", entry.upstream)
                putDouble("timestamp", entry.timestamp.toDouble())
            }
            batchArray.pushMap(map)
        }

        sendArrayEvent("onQueriesLogged", batchArray)

        // If items are still queued up during heavy traffic bursts, schedule next batch promptly
        if (!pendingLogQueue.isEmpty()) {
            if (!isFlushScheduled.getAndSet(true)) {
                mainHandler.postDelayed(flushBatchRunnable, 100)
            }
        }
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(LocalVpnService.isServiceRunning)
    }

    @ReactMethod
    fun startVpn(promise: Promise) {
        val act = reactContext.currentActivity
        if (act == null) {
            promise.reject("NO_ACTIVITY", "Current activity is null")
            return
        }

        val prepareIntent = VpnService.prepare(act)
        if (prepareIntent != null) {
            preparePromise = promise
            act.startActivityForResult(prepareIntent, VPN_REQUEST_CODE)
        } else {
            launchVpnService()
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun stopVpn(promise: Promise) {
        val intent = Intent(reactContext, LocalVpnService::class.java).apply {
            action = LocalVpnService.ACTION_STOP
        }
        reactContext.startService(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun getStatistics(promise: Promise) {
        val map = Arguments.createMap().apply {
            putDouble("totalQueries", StatisticsManager.totalQueries.get().toDouble())
            putDouble("blockedQueries", StatisticsManager.blockedQueries.get().toDouble())
            putDouble("dataSavedBytes", StatisticsManager.getEstimatedDataSavedBytes().toDouble())
            putDouble("blockRate", StatisticsManager.getBlockRate().toDouble())
            putInt("ruleCount", LocalVpnService.filterEngine.getRuleCount())
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun addCustomRule(ruleString: String, promise: Promise) {
        val rule = AdBlockRule.parse(ruleString)
        if (rule != null) {
            val currentRules = filterRepository.getUserRules()
            val newRules = if (currentRules.isBlank()) ruleString else "$currentRules\n$ruleString"
            filterRepository.saveUserRules(newRules, LocalVpnService.filterEngine)
            reconfigureVpnIfRunning()
            promise.resolve(true)
        } else {
            promise.reject("INVALID_RULE", "Could not parse rule: $ruleString")
        }
    }

    @ReactMethod
    fun getUserRules(promise: Promise) {
        val rules = filterRepository.getUserRules()
        promise.resolve(rules)
    }

    @ReactMethod
    fun saveUserRules(rulesText: String, promise: Promise) {
        filterRepository.saveUserRules(rulesText, LocalVpnService.filterEngine)
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun getFilterSubscriptions(promise: Promise) {
        val subscriptions = filterRepository.getSubscriptions()
        val array = Arguments.createArray()
        for (sub in subscriptions) {
            val map = Arguments.createMap().apply {
                putInt("id", sub.id)
                putString("name", sub.name)
                putString("description", sub.description)
                putString("url", sub.url ?: "")
                putBoolean("isEnabled", sub.isEnabled)
                putInt("ruleCount", sub.ruleCount)
                putDouble("lastUpdated", sub.lastUpdated.toDouble())
                putBoolean("isCustom", sub.isCustom)
            }
            array.pushMap(map)
        }
        promise.resolve(array)
    }

    @ReactMethod
    fun toggleFilterSubscription(id: Double, enabled: Boolean, promise: Promise) {
        val subId = id.toInt()
        val sub = filterRepository.getSubscriptions().find { it.id == subId }
        if (sub != null) {
            filterRepository.setSubscriptionEnabled(subId, enabled)
            filterRepository.reloadAll(LocalVpnService.filterEngine)
            reconfigureVpnIfRunning()
            promise.resolve(true)
        } else {
            promise.reject("NOT_FOUND", "Subscription with id $id not found")
        }
    }

    @ReactMethod
    fun updateFilterSubscriptions(promise: Promise) {
        scope.launch {
            try {
                val subs = filterRepository.getSubscriptions()
                var updated = 0
                for (sub in subs) {
                    if (sub.isEnabled) {
                        val ok = filterRepository.updateSubscription(sub, LocalVpnService.filterEngine)
                        if (ok) updated++
                    }
                }
                if (updated > 0) {
                    reconfigureVpnIfRunning()
                }
                promise.resolve(updated)
            } catch (e: Exception) {
                promise.reject("UPDATE_FAILED", e.message)
            }
        }
    }

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        scope.launch {
            try {
                val apps = appManager.getInstalledApps()
                val array = Arguments.createArray()
                for (app in apps) {
                    val map = Arguments.createMap().apply {
                        putString("appName", app.appName)
                        putString("packageName", app.packageName)
                        putBoolean("isSystemApp", app.isSystemApp)
                        putBoolean("isFiltered", app.isFiltered)
                        putBoolean("isVpnBypassed", app.isVpnBypassed)
                    }
                    array.pushMap(map)
                }
                promise.resolve(array)
            } catch (e: Exception) {
                promise.reject("FETCH_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun setAppBypass(packageName: String, bypass: Boolean, promise: Promise) {
        appManager.setAppBypass(packageName, bypass)
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun setAppsBypassBatch(packageNames: ReadableArray, bypass: Boolean, promise: Promise) {
        val packages = mutableListOf<String>()
        for (i in 0 until packageNames.size()) {
            packageNames.getString(i)?.let { packages.add(it) }
        }
        appManager.setAppsBypassBatch(packages, bypass)
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun getQueryLogs(promise: Promise) {
        val logs = FilteringLog.getRecentEntries()
        val array = Arguments.createArray()
        for (entry in logs) {
            val map = Arguments.createMap().apply {
                putString("domain", entry.domain)
                putString("queryType", entry.queryType)
                putBoolean("isBlocked", entry.isBlocked)
                putString("matchedRule", entry.matchedRule)
                putDouble("durationMs", entry.durationMs.toDouble())
                putString("upstream", entry.upstream)
                putDouble("timestamp", entry.timestamp.toDouble())
            }
            array.pushMap(map)
        }
        promise.resolve(array)
    }

    @ReactMethod
    fun clearQueryLogs(promise: Promise) {
        FilteringLog.clear()
        promise.resolve(true)
    }

    @ReactMethod
    fun getDnsSettings(promise: Promise) {
        val config = LocalVpnService.currentConfig
        val map = Arguments.createMap().apply {
            val upstreams = Arguments.createArray()
            config.upstreamDnsServers.forEach { upstreams.pushString(it) }
            putArray("upstreamDnsServers", upstreams)
            putString("blockingMode", config.blockingMode.name)
            putString("virtualDnsServer", config.virtualDnsServer)
        }
        promise.resolve(map)
    }

    private val criticalAdDomains = setOf(
        "googleads.g.doubleclick.net",
        "pubads.g.doubleclick.net",
        "pagead2.googlesyndication.com",
        "adservice.google.com",
        "doubleclick.net",
        "googlesyndication.com",
        "app-measurement.com",
        "google-analytics.com"
    )

    private fun sanitizeExcludedDomains(domains: List<String>): List<String> {
        return domains.map { it.trim().lowercase().trimEnd('.') }
            .filter { d ->
                d.isNotEmpty() && criticalAdDomains.none { cad -> d == cad || d.endsWith(".$cad") }
            }
    }

    @ReactMethod
    fun setDnsSettings(upstreamServers: ReadableArray, blockingModeStr: String, promise: Promise) {
        val servers = mutableListOf<String>()
        for (i in 0 until upstreamServers.size()) {
            val item = upstreamServers.getString(i)?.trim()
            if (!item.isNullOrEmpty()) {
                if (item.startsWith("sdns://", ignoreCase = true)) {
                    val parsed = com.fajostech.aegisguard.dns.DnsStamp.parse(item)
                    if (parsed != null) {
                        if (parsed.protocol == com.fajostech.aegisguard.dns.DnsStamp.StampProtocol.DOH &&
                            parsed.providerName.isNotBlank()
                        ) {
                            val path = parsed.path?.takeIf { it.isNotBlank() } ?: "/dns-query"
                            servers.add("https://${parsed.providerName}$path")
                        } else if (parsed.serverAddress.isNotBlank()) {
                            servers.add(parsed.serverAddress.substringBefore(":"))
                        }
                    }
                } else if (item.startsWith("https://", ignoreCase = true)) {
                    servers.add(item)
                } else if (!item.startsWith("http://", ignoreCase = true)) {
                    servers.add(item)
                }
            }
        }
        if (servers.isEmpty()) {
            servers.addAll(listOf("94.140.14.14", "94.140.15.15"))
        }

        val mode = try {
            BlockingMode.valueOf(blockingModeStr.uppercase())
        } catch (e: Exception) {
            BlockingMode.ADDRESS
        }

        LocalVpnService.currentConfig = LocalVpnService.currentConfig.copy(
            upstreamDnsServers = servers,
            blockingMode = mode
        )

        dnsPrefs.edit()
            .putString("upstream_servers_ordered", servers.joinToString(","))
            .putStringSet("upstream_servers", servers.toSet())
            .putString("blocking_mode", mode.name)
            .apply()

        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun setCategoryDomains(domains: ReadableArray, promise: Promise) {
        val list = mutableListOf<String>()
        for (i in 0 until domains.size()) {
            domains.getString(i)?.trim()?.lowercase()?.let {
                if (it.isNotEmpty()) list.add(it)
            }
        }
        LocalVpnService.filterEngine.setCategoryDomains(list)
        dnsPrefs.edit().putStringSet("category_domains", list.toSet()).apply()
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun setBedtimeSchedule(enabled: Boolean, startHour: Int, endHour: Int, domains: ReadableArray, promise: Promise) {
        val list = mutableListOf<String>()
        for (i in 0 until domains.size()) {
            domains.getString(i)?.trim()?.lowercase()?.let {
                if (it.isNotEmpty()) list.add(it)
            }
        }
        LocalVpnService.filterEngine.setBedtimeSchedule(enabled, startHour, endHour, list)
        dnsPrefs.edit()
            .putBoolean("schedule_enabled", enabled)
            .putInt("schedule_start_hour", startHour)
            .putInt("schedule_end_hour", endHour)
            .putStringSet("schedule_domains", list.toSet())
            .apply()
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun setExcludedDomains(domains: ReadableArray, promise: Promise) {
        val raw = mutableListOf<String>()
        for (i in 0 until domains.size()) {
            domains.getString(i)?.trim()?.lowercase()?.let {
                if (it.isNotEmpty()) raw.add(it)
            }
        }
        val safeList = sanitizeExcludedDomains(raw)
        LocalVpnService.filterEngine.setExcludedDomains(safeList)
        dnsPrefs.edit().putStringSet("excluded_domains", safeList.toSet()).apply()
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun addCustomApp(app: ReadableMap, domains: ReadableArray?, promise: Promise) {
        try {
            val pkg = if (app.hasKey("packageName")) app.getString("packageName")?.trim() else null
            val bypassed = if (app.hasKey("isVpnBypassed")) app.getBoolean("isVpnBypassed") else true
            if (!pkg.isNullOrEmpty()) {
                appManager.setAppBypass(pkg, bypassed)
            }
            if (domains != null && domains.size() > 0) {
                val incoming = mutableListOf<String>()
                for (i in 0 until domains.size()) {
                    domains.getString(i)?.trim()?.lowercase()?.let {
                        if (it.isNotEmpty()) incoming.add(it)
                    }
                }
                val existing = dnsPrefs.getStringSet("excluded_domains", emptySet()) ?: emptySet()
                val merged = sanitizeExcludedDomains((existing + incoming).distinct())
                LocalVpnService.filterEngine.setExcludedDomains(merged)
                dnsPrefs.edit().putStringSet("excluded_domains", merged.toSet()).apply()
            }
            reconfigureVpnIfRunning()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CUSTOM_APP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setFamilyProtectionEnabled(enabled: Boolean, promise: Promise) {
        LocalVpnService.filterEngine.enableFamilyFilter = enabled
        val servers = if (enabled) {
            listOf("94.140.14.15", "94.140.15.16")
        } else {
            listOf("94.140.14.14", "94.140.15.15")
        }
        LocalVpnService.currentConfig = LocalVpnService.currentConfig.copy(
            upstreamDnsServers = servers
        )
        dnsPrefs.edit()
            .putBoolean("family_protection_enabled", enabled)
            .putString("upstream_servers_ordered", servers.joinToString(","))
            .putStringSet("upstream_servers", servers.toSet())
            .apply()
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun isFamilyProtectionEnabled(promise: Promise) {
        promise.resolve(LocalVpnService.filterEngine.enableFamilyFilter)
    }

    @ReactMethod
    fun setGameAdsBypassEnabled(enabled: Boolean, promise: Promise) {
        LocalVpnService.filterEngine.gameAdsBypassEnabled = enabled
        dnsPrefs.edit().putBoolean("game_ads_bypass_enabled", enabled).apply()
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun isGameAdsBypassEnabled(promise: Promise) {
        promise.resolve(LocalVpnService.filterEngine.gameAdsBypassEnabled)
    }

    @ReactMethod
    fun setSafeSearchEnabled(enabled: Boolean, promise: Promise) {
        LocalVpnService.filterEngine.enableSafeSearch = enabled
        dnsPrefs.edit().putBoolean("safe_search_enabled", enabled).apply()
        reconfigureVpnIfRunning()
        promise.resolve(true)
    }

    @ReactMethod
    fun isSafeSearchEnabled(promise: Promise) {
        promise.resolve(LocalVpnService.filterEngine.enableSafeSearch)
    }

    @ReactMethod
    fun setThreatAlertsEnabled(enabled: Boolean, promise: Promise) {
        LocalVpnService.threatAlertsEnabled = enabled
        dnsPrefs.edit().putBoolean("threat_alerts_enabled", enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun isThreatAlertsEnabled(promise: Promise) {
        promise.resolve(LocalVpnService.threatAlertsEnabled)
    }

    @ReactMethod
    fun setLicenseState(isPremium: Boolean, promise: Promise) {
        val prev = LocalVpnService.filterEngine.isPremium
        LocalVpnService.filterEngine.isPremium = isPremium
        dnsPrefs.edit().putBoolean("is_premium", isPremium).apply()
        val effectiveServers = if (isPremium) {
            val orderedRaw = dnsPrefs.getString("upstream_servers_ordered", null)
            if (!orderedRaw.isNullOrBlank()) {
                orderedRaw.split(',').map { it.trim() }.filter { it.isNotEmpty() }
            } else {
                dnsPrefs.getStringSet("upstream_servers", null)?.toList()
                    ?: listOf("94.140.14.14", "94.140.15.15")
            }
        } else {
            listOf("1.1.1.1", "1.0.0.1")
        }
        LocalVpnService.currentConfig = LocalVpnService.currentConfig.copy(
            upstreamDnsServers = effectiveServers
        )
        if (prev != isPremium) {
            reconfigureVpnIfRunning()
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun isLicensePremium(promise: Promise) {
        promise.resolve(LocalVpnService.filterEngine.isPremium)
    }

    @ReactMethod
    fun setParentalLockEnabled(enabled: Boolean, promise: Promise) {
        dnsPrefs.edit().putBoolean("parental_lock_enabled", enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun isParentalLockEnabled(promise: Promise) {
        val locked = dnsPrefs.getBoolean("parental_lock_enabled", false)
        promise.resolve(locked)
    }

    @ReactMethod
    fun benchmarkDnsServers(servers: ReadableArray, promise: Promise) {
        scope.launch(Dispatchers.IO) {
            try {
                val resolver = com.fajostech.aegisguard.dns.ParallelDnsResolver()
                val serverList = mutableListOf<String>()
                for (i in 0 until servers.size()) {
                    val s = servers.getString(i)
                    if (!s.isNullOrBlank()) serverList.add(s)
                }

                val resultsArray = Arguments.createArray()
                for (srv in serverList) {
                    val latency = resolver.measureLatency(srv)
                    val map = Arguments.createMap().apply {
                        putString("server", srv)
                        putDouble("latencyMs", if (latency > 0) latency.toDouble() else -1.0)
                        putBoolean("isOnline", latency > 0)
                    }
                    resultsArray.pushMap(map)
                }
                promise.resolve(resultsArray)
            } catch (e: Exception) {
                promise.reject("BENCHMARK_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun testDomainFilter(domain: String, promise: Promise) {
        val eval = LocalVpnService.filterEngine.evaluate(domain.trim(), 1)
        val map = Arguments.createMap().apply {
            putString("domain", domain)
            putBoolean("isBlocked", eval.isBlocked)
            putString("matchedRule", eval.matchedRule ?: "")
            putBoolean("isRewrite", eval.isRewrite)
            putString("rewriteIp", eval.rewriteIp ?: "")
        }
        promise.resolve(map)
    }

    private fun launchVpnService() {
        val intent = Intent(reactContext, LocalVpnService::class.java).apply {
            action = LocalVpnService.ACTION_START
        }
        reactContext.startForegroundService(intent)
    }

    private fun reconfigureVpnIfRunning() {
        if (LocalVpnService.isServiceRunning) {
            mainHandler.removeCallbacks(reconfigureRunnable)
            mainHandler.postDelayed(reconfigureRunnable, 150)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private fun sendArrayEvent(eventName: String, params: WritableArray) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == VPN_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK) {
                launchVpnService()
                preparePromise?.resolve(true)
            } else {
                preparePromise?.reject("VPN_PERMISSION_DENIED", "User cancelled VPN dialog")
            }
            preparePromise = null
        }
    }

    override fun onNewIntent(intent: Intent) {}
}
