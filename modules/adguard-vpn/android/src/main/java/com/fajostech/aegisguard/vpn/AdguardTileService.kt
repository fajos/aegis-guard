package com.fajostech.aegisguard.vpn

import android.content.Intent
import android.graphics.drawable.Icon
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi
import com.fajostech.aegisguard.ui.MainActivity

/**
 * Quick Settings Tile Service modeling AdGuard's com.adguard.android.service.AdguardTileService.
 * Allows quick toggle from the Android Quick Settings shade.
 */
@RequiresApi(Build.VERSION_CODES.N)
class AdguardTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        val running = LocalVpnService.isServiceRunning
        if (running) {
            val stopIntent = Intent(this, LocalVpnService::class.java).apply {
                action = LocalVpnService.ACTION_STOP
            }
            startService(stopIntent)
        } else {
            val prepareIntent = VpnService.prepare(this)
            if (prepareIntent != null) {
                // Must open activity to request VPN permission
                val intent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivityAndCollapse(intent)
                return
            }
            val startIntent = Intent(this, LocalVpnService::class.java).apply {
                action = LocalVpnService.ACTION_START
            }
            startForegroundService(startIntent)
        }
        updateTileState()
    }

    private fun updateTileState() {
        val tile = qsTile ?: return
        val isRunning = LocalVpnService.isServiceRunning

        tile.state = if (isRunning) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = if (isRunning) "AdGuard: Protected" else "AdGuard: Paused"
        tile.updateTile()
    }
}
