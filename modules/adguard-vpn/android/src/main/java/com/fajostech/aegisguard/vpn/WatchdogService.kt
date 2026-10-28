package com.fajostech.aegisguard.vpn

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Watchdog Service modeling AdGuard's WatchdogService.
 * Ensures local VPN stability and restarts the service if it unexpectedly drops.
 */
class WatchdogService : Service() {

    companion object {
        private const val TAG = "WatchdogService"
        private const val CHECK_INTERVAL_MS = 15000L
    }

    private val scope = CoroutineScope(Dispatchers.Default)
    private var job: Job? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (job == null) {
            job = scope.launch {
                while (isActive) {
                    delay(CHECK_INTERVAL_MS)
                    checkVpnHealth()
                }
            }
        }
        return START_STICKY
    }

    private fun checkVpnHealth() {
        if (!LocalVpnService.isServiceRunning) {
            Log.w(TAG, "Watchdog detected VPN is not running, initiating auto-recovery...")
            val restartIntent = Intent(this, LocalVpnService::class.java).apply {
                action = LocalVpnService.ACTION_START
            }
            startService(restartIntent)
        }
    }

    override fun onDestroy() {
        job?.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
