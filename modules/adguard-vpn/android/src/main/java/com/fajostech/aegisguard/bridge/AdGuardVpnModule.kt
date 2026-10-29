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

    init {
        reactContext.addActivityEventListener(this)

        // Initialize default and user-configured filter rules
        try {
            filterRepository.initializeDefaults(LocalVpnService.filterEngine)
        } catch (e: Exception) {
            // Non-fatal fallback
        }

        // Restore persisted DNS settings
        try {
            val savedServers = dnsPrefs.getStringSet("upstream_servers", null)?.toList()
            val savedModeStr = dnsPrefs.getString("blocking_mode", null)
            val savedMode = if (savedModeStr != null) try { BlockingMode.valueOf(savedModeStr) } catch (e: Exception) { null } else null

            if (savedServers != null || savedMode != null) {
                LocalVpnService.currentConfig = LocalVpnService.currentConfig.copy(
                    upstreamDnsServers = savedServers ?: LocalVpnService.currentConfig.upstreamDnsServers,
                    blockingMode = savedMode ?: LocalVpnService.currentConfig.blockingMode
                )
            }

            // Restore SafeSearch state
            val safeSearch = dnsPrefs.getBoolean("safe_search_enabled", false)
            LocalVpnService.filterEngine.enableSafeSearch = safeSearch
        } catch (e: Exception) {}

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
            LocalVpnService.filterEngine.loadRulesFromString(ruleString)
            val currentRules = filterRepository.getUserRules()
            val newRules = if (currentRules.isBlank()) ruleString else "$currentRules\n$ruleString"
            filterRepository.saveUserRules(newRules, LocalVpnService.filterEngine)
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

    @ReactMethod
    fun setDnsSettings(upstreamServers: ReadableArray, blockingModeStr: String, promise: Promise) {
        val servers = mutableListOf<String>()
        for (i in 0 until upstreamServers.size()) {
            val item = upstreamServers.getString(i)
            if (item != null) servers.add(item)
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
            .putStringSet("upstream_servers", servers.toSet())
            .putString("blocking_mode", mode.name)
            .apply()

        promise.resolve(true)
    }

    @ReactMethod
    fun setSafeSearchEnabled(enabled: Boolean, promise: Promise) {
        LocalVpnService.filterEngine.enableSafeSearch = enabled
        dnsPrefs.edit().putBoolean("safe_search_enabled", enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun isSafeSearchEnabled(promise: Promise) {
        promise.resolve(LocalVpnService.filterEngine.enableSafeSearch)
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
