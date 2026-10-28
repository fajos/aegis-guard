package com.fajostech.aegisguard.appmanagement

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppManager(private val context: Context) {

    private val prefs = context.getSharedPreferences("adguard_app_management", Context.MODE_PRIVATE)
    private val bypassedPackages = HashSet<String>()

    init {
        val saved = prefs.getStringSet("bypassed_packages", emptySet()) ?: emptySet()
        bypassedPackages.addAll(saved)
    }

    suspend fun getInstalledApps(): List<AppInfo> = withContext(Dispatchers.IO) {
        val pm = context.packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val result = ArrayList<AppInfo>()

        for (app in apps) {
            // Exclude AdGuard itself
            if (app.packageName == context.packageName) continue

            val appName = pm.getApplicationLabel(app).toString()
            val isSystem = (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val isBypassed = bypassedPackages.contains(app.packageName)
            val icon = try {
                pm.getApplicationIcon(app)
            } catch (e: Exception) {
                null
            }

            result.add(
                AppInfo(
                    appName = appName,
                    packageName = app.packageName,
                    icon = icon,
                    isSystemApp = isSystem,
                    isFiltered = !isBypassed,
                    isVpnBypassed = isBypassed
                )
            )
        }

        result.sortBy { it.appName.lowercase() }
        result
    }

    fun setAppBypass(packageName: String, bypass: Boolean) {
        if (bypass) {
            bypassedPackages.add(packageName)
        } else {
            bypassedPackages.remove(packageName)
        }
        prefs.edit().putStringSet("bypassed_packages", bypassedPackages).apply()
    }

    fun getBypassedPackages(): Set<String> = bypassedPackages.toSet()
}
