package com.fajostech.aegisguard

import android.app.Application
import com.fajostech.aegisguard.appmanagement.AppManager
import com.fajostech.aegisguard.bridge.AdGuardVpnPackage
import com.fajostech.aegisguard.filter.FilterRepository
import com.fajostech.aegisguard.vpn.LocalVpnService
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

    companion object {
        lateinit var instance: MainApplication
            private set
    }

    lateinit var appManager: AppManager
    lateinit var filterRepository: FilterRepository

    private val mReactNativeHost: ReactNativeHost = object : ReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages.toMutableList()
            // Add custom native bridge package
            packages.add(AdGuardVpnPackage())
            return packages
        }

        override fun getJSMainModuleName(): String = "index"
    }

    override val reactNativeHost: ReactNativeHost
        get() = mReactNativeHost

    override fun onCreate() {
        super.onCreate()
        instance = this
        SoLoader.init(this, false)

        appManager = AppManager(this)
        filterRepository = FilterRepository(this)
        filterRepository.initializeDefaults(LocalVpnService.filterEngine)
    }
}
