package com.fajostech.aegisguard.vpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Boot receiver modeling AdGuard's BootUpReceiver + StartOnBootService.
 * Restores protection immediately upon device startup.
 */
class BootUpReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootUpReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val intentAction = intent.action
        if (Intent.ACTION_BOOT_COMPLETED == intentAction || "android.intent.action.QUICKBOOT_POWERON" == intentAction) {
            Log.i(TAG, "Device booted, starting Aegis Guard VPN service...")
            val serviceIntent = Intent(context, LocalVpnService::class.java).apply {
                action = LocalVpnService.ACTION_START
            }
            context.startForegroundService(serviceIntent)
        }
    }
}
