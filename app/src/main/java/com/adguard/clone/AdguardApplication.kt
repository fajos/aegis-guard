package com.fajostech.aegisguard

import android.app.Application
import com.fajostech.aegisguard.appmanagement.AppManager
import com.fajostech.aegisguard.filter.FilterRepository
import com.fajostech.aegisguard.vpn.LocalVpnService

class AdguardApplication : Application() {

    companion object {
        lateinit var instance: AdguardApplication
            private set
    }

    lateinit var appManager: AppManager
    lateinit var filterRepository: FilterRepository

    override fun onCreate() {
        super.onCreate()
        instance = this

        appManager = AppManager(this)
        filterRepository = FilterRepository(this)

        // Initialize default filters into the filter engine
        filterRepository.initializeDefaults(LocalVpnService.filterEngine)
    }
}
