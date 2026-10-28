package com.fajostech.aegisguard.bridge

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import com.fajostech.aegisguard.MainApplication
import com.fajostech.aegisguard.filter.AdBlockRule
import com.fajostech.aegisguard.filter.BlockingMode
import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.stats.StatisticsManager
import com.fajostech.aegisguard.vpn.LocalVpnService
import com.fajostech.aegisguard.vpn.VpnConfiguration
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * React Native Bridge Module providing complete AdGuard DNS filtering,
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

    init {
        reactContext.addActivityEventListener(this)

        // Stream live DNS queries to React Native JS listeners
        FilteringLog.addListener { entry ->
            val params = Arguments.createMap().apply {
                putString("domain", entry.domain)
                putString("queryType", entry.queryType)
                putBoolean("isBlocked", entry.isBlocked)
                putString("matchedRule", entry.matchedRule)
                putDouble("durationMs", entry.durationMs.toDouble())
                putString("upstream", entry.upstream)
                putDouble("timestamp", entry.timestamp.toDouble())
            }
            sendEvent("onQueryLogged", params)
        }
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(LocalVpnService.isServiceRunning)
    }

    @ReactMethod
    fun startVpn(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Current activity is null")
            return
        }

        val prepareIntent = VpnService.prepare(activity)
        if (prepareIntent != null) {
            preparePromise = promise
            activity.startActivityForResult(prepareIntent, VPN_REQUEST_CODE)
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
            val currentRules = MainApplication.instance.filterRepository.getUserRules()
            val newRules = if (currentRules.isBlank()) ruleString else "$currentRules\n$ruleString"
            MainApplication.instance.filterRepository.saveUserRules(newRules, LocalVpnService.filterEngine)
            promise.resolve(true)
        } else {
            promise.reject("INVALID_RULE", "Could not parse rule: $ruleString")
        }
    }

    @ReactMethod
    fun getUserRules(promise: Promise) {
        val rules = MainApplication.instance.filterRepository.getUserRules()
        promise.resolve(rules)
    }

    @ReactMethod
    fun saveUserRules(rulesText: String, promise: Promise) {
        MainApplication.instance.filterRepository.saveUserRules(rulesText, LocalVpnService.filterEngine)
        promise.resolve(true)
    }

    @ReactMethod
    fun getFilterSubscriptions(promise: Promise) {
        val subscriptions = MainApplication.instance.filterRepository.getSubscriptions()
        val array = Arguments.createArray()
        for (sub in subscriptions) {
            val map = Arguments.createMap().apply {
                putInt("id", sub.id)
                putString("name", sub.name)
                putString("description", sub.description)
                putString("url", sub.url)
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
        val sub = MainApplication.instance.filterRepository.getSubscriptions().find { it.id == id.toInt() }
        if (sub != null) {
            sub.isEnabled = enabled
            MainApplication.instance.filterRepository.reloadAll(LocalVpnService.filterEngine)
            promise.resolve(true)
        } else {
            promise.reject("NOT_FOUND", "Subscription with id $id not found")
        }
    }

    @ReactMethod
    fun updateFilterSubscriptions(promise: Promise) {
        scope.launch {
            try {
                val subs = MainApplication.instance.filterRepository.getSubscriptions()
                var updated = 0
                for (sub in subs) {
                    if (sub.isEnabled) {
                        val ok = MainApplication.instance.filterRepository.updateSubscription(sub, LocalVpnService.filterEngine)
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
                val apps = MainApplication.instance.appManager.getInstalledApps()
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
        MainApplication.instance.appManager.setAppBypass(packageName, bypass)
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
            servers.add(upstreamServers.getString(i))
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
        promise.resolve(true)
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

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
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

    override fun onNewIntent(intent: Intent?) {}
}
