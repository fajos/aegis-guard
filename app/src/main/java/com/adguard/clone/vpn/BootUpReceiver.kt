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
        val action = intent.action
        if (Intent.ACTION_BOOT_COMPLETED == action || "android.intent.action.QUICKBOOT_POWERON" == action) {
            Log.i(TAG, "Device booted, starting AdGuard VPN service...")
            val serviceIntent = Intent(context, LocalVpnService::class.java).apply {
                action = LocalVpnService.ACTION_START
            }
            context.startForegroundService(serviceIntent)
        }
    }
}
