package com.fajostech.aegisguard.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.fajostech.aegisguard.appmanagement.AppManager
import com.fajostech.aegisguard.filter.DnsFilterEngine
import com.fajostech.aegisguard.filter.FilterRepository
import com.fajostech.aegisguard.stats.StatisticsManager
import java.io.IOException

/**
 * Android VPN Service mirroring Aegis Guard's LocalVpnService.
 * Intercepts local device DNS traffic without requiring root.
 */
class LocalVpnService : VpnService() {

    companion object {
        private const val TAG = "LocalVpnService"
        const val ACTION_START = "com.fajostech.aegisguard.ACTION_START"
        const val ACTION_STOP = "com.fajostech.aegisguard.ACTION_STOP"
        private const val NOTIFICATION_CHANNEL_ID = "adguard_vpn_channel"
        private const val NOTIFICATION_ID = 1001

        @Volatile
        var isServiceRunning = false
            private set

        val filterEngine = DnsFilterEngine()
        var currentConfig = VpnConfiguration()
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var packetRouter: TunPacketRouter? = null
    private var routerThread: Thread? = null

    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onCreate() {
        super.onCreate()
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_START -> {
                startVpn()
            }
            ACTION_STOP -> {
                stopVpn()
            }
        }
        return START_STICKY
    }

    private fun startVpn() {
        if (isServiceRunning) {
            Log.d(TAG, "VPN service is already running")
            return
        }

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        try {
            if (filterEngine.getRuleCount() == 0) {
                FilterRepository(this).initializeDefaults(filterEngine)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not initialize filter defaults", e)
        }

        try {
            val builder = Builder()

            // 1. Session Name
            builder.setSession("Aegis Guard Protection")

            // 2. MTU
            builder.setMtu(currentConfig.mtu)

            // 3. Virtual IP Address
            builder.addAddress(currentConfig.virtualIp, currentConfig.virtualPrefixLength)

            // 4. Virtual DNS Server (198.18.53.53 matching Aegis Guard)
            builder.addDnsServer(currentConfig.virtualDnsServer)

            // 5. Route DNS traffic to TUN
            builder.addRoute(currentConfig.virtualDnsServer, 32)

            // 6. Split Tunneling: Exclude this app & user bypassed apps
            try {
                builder.addDisallowedApplication(packageName)
                val appManager = AppManager(this)
                val bypassed = appManager.getBypassedPackages()
                for (app in bypassed) {
                    try {
                        builder.addDisallowedApplication(app)
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to exclude app: $app", e)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to configure excluded applications", e)
            }

            // 7. Configure PendingIntent for notification click
            val configureIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (configureIntent != null) {
                val pendingIntent = PendingIntent.getActivity(
                    this, 0, configureIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.setConfigureIntent(pendingIntent)
            }

            // 8. Establish TUN interface
            val pfd = builder.establish()
            if (pfd == null) {
                Log.e(TAG, "Failed to establish TUN interface")
                stopSelf()
                return
            }
            vpnInterface = pfd

            // 9. Register underlying network listener (WiFi/Cellular roaming)
            registerNetworkCallback()

            // 10. Start Packet Router Loop
            val router = TunPacketRouter(
                pfd = pfd,
                filterEngine = filterEngine,
                config = currentConfig,
                vpnService = this
            )
            packetRouter = router
            routerThread = Thread(router, "TunPacketRouterThread").apply {
                isDaemon = true
                start()
            }

            isServiceRunning = true
            Log.i(TAG, "Aegis Guard VPN service successfully established and active")

            // Start Watchdog service
            try {
                val watchdog = Intent(this, WatchdogService::class.java)
                startService(watchdog)
            } catch (e: Exception) {}

        } catch (e: Exception) {
            Log.e(TAG, "Error starting VPN service", e)
            stopVpn()
        }
    }

    private fun registerNetworkCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.d(TAG, "Active network changed: $network")
                    setUnderlyingNetworks(arrayOf(network))

                    // Extract device's active network DNS servers (e.g. Wi-Fi router or cellular DNS)
                    try {
                        val lp = connectivityManager.getLinkProperties(network)
                        val systemDns = lp?.dnsServers?.mapNotNull { it.hostAddress } ?: emptyList()
                        if (systemDns.isNotEmpty()) {
                            val merged = (systemDns + currentConfig.upstreamDnsServers).distinct()
                            currentConfig = currentConfig.copy(upstreamDnsServers = merged)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not extract system DNS servers", e)
                    }
                }

                override fun onLost(network: Network) {
                    setUnderlyingNetworks(null)
                }
            }
            connectivityManager.registerNetworkCallback(request, networkCallback!!)
        }
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping VPN service")
        isServiceRunning = false

        networkCallback?.let {
            try { connectivityManager.unregisterNetworkCallback(it) } catch (e: Exception) {}
            networkCallback = null
        }

        packetRouter?.stop()
        packetRouter = null

        routerThread?.interrupt()
        routerThread = null

        try {
            vpnInterface?.close()
        } catch (e: IOException) {
            Log.e(TAG, "Error closing VPN interface", e)
        }
        vpnInterface = null

        // Stop watchdog
        try {
            stopService(Intent(this, WatchdogService::class.java))
        } catch (e: Exception) {}

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onRevoke() {
        Log.w(TAG, "VPN permission revoked by user or system")
        stopVpn()
        super.onRevoke()
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Aegis Guard Protection Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows status of Aegis Guard DNS protection"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val stopIntent = Intent(this, LocalVpnService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val blocked = filterEngine.blockedQueries.get()
        val kbSaved = StatisticsManager.getEstimatedDataSavedBytes() / 1024

        val builder = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Aegis Guard Protection Active")
            .setContentText("$blocked ads blocked • ~${kbSaved} KB data saved")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Pause", stopPendingIntent)
            .setOngoing(true)

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent)
        }

        return builder.build()
    }
}
