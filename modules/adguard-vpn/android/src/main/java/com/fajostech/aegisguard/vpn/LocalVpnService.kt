package com.fajostech.aegisguard.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.fajostech.aegisguard.appmanagement.AppManager
import com.fajostech.aegisguard.filter.BlockingMode
import com.fajostech.aegisguard.filter.DnsFilterEngine
import com.fajostech.aegisguard.filter.FilterRepository
import com.fajostech.aegisguard.stats.StatisticsManager
import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.util.concurrent.ConcurrentHashMap

/**
 * Android VPN Service mirroring Aegis Guard's LocalVpnService.
 * Intercepts dual-stack IPv4/IPv6 device DNS traffic plus hardcoded DoH/DoT
 * bypass endpoints without requiring root.
 */
class LocalVpnService : VpnService() {

    companion object {
        private const val TAG = "LocalVpnService"
        const val ACTION_START = "com.fajostech.aegisguard.ACTION_START"
        const val ACTION_STOP = "com.fajostech.aegisguard.ACTION_STOP"
        const val ACTION_RECONFIGURE = "com.fajostech.aegisguard.ACTION_RECONFIGURE"
        private const val NOTIFICATION_CHANNEL_ID = "adguard_vpn_channel"
        private const val THREAT_CHANNEL_ID = "aegis_threat_alerts"
        private const val NOTIFICATION_ID = 1001
        private const val THREAT_COOLDOWN_MS = 10 * 60 * 1000L

        private val PUBLIC_BYPASS_DNS_V4 = listOf(
            "8.8.8.8/32", "8.8.4.4/32",                   // Google DNS / DoH / DoT
            "1.1.1.1/32", "1.0.0.1/32",                   // Cloudflare Standard
            "1.1.1.2/32", "1.0.0.2/32",                   // Cloudflare Security
            "1.1.1.3/32", "1.0.0.3/32",                   // Cloudflare Family
            "9.9.9.9/32", "149.112.112.112/32",           // Quad9
            "9.9.9.10/32", "149.112.112.10/32",           // Quad9 Unsecured
            "9.9.9.11/32", "149.112.112.11/32",           // Quad9 ECS
            "208.67.222.222/32", "208.67.220.220/32",     // OpenDNS
            "208.67.222.123/32", "208.67.220.123/32",     // OpenDNS FamilyShield
            "94.140.14.14/32", "94.140.15.15/32",         // AdGuard Default (apps bypassing TUN DNS)
            "94.140.14.15/32", "94.140.15.16/32",         // AdGuard Family
            "94.140.14.140/32", "94.140.14.141/32",       // AdGuard Unfiltered
            "45.90.28.0/24", "45.90.30.0/24",             // NextDNS
            "185.228.168.0/24"                            // CleanBrowsing
        )

        private val PUBLIC_BYPASS_DNS_V6 = listOf(
            "2001:4860:4860::8888/128", "2001:4860:4860::8844/128", // Google
            "2606:4700:4700::1111/128", "2606:4700:4700::1001/128", // Cloudflare
            "2606:4700:4700::1112/128", "2606:4700:4700::1002/128",
            "2606:4700:4700::1113/128", "2606:4700:4700::1003/128",
            "2620:fe::fe/128", "2620:fe::9/128",                    // Quad9
            "2620:119:35::35/128", "2620:119:53::53/128",           // OpenDNS
            "2a10:50c0::ad1:ff/128", "2a10:50c0::ad2:ff/128",       // AdGuard
            "2a10:50c0::1:ff/128", "2a10:50c0::2:ff/128",
            "2a07:a8c0::/32", "2a07:a8c1::/32"                      // NextDNS
        )

        private val TWITTER_AS13414_CIDRS = listOf(
            "104.244.40.0/21",
            "199.16.156.0/22",
            "199.59.148.0/22",
            "192.133.76.0/22"
        )

        @Volatile
        var isServiceRunning = false
            private set

        @Volatile
        var threatAlertsEnabled = true

        private val threatCooldownMap = ConcurrentHashMap<String, Long>()

        val filterEngine = DnsFilterEngine()
        var currentConfig = VpnConfiguration()

        /**
         * Restores persisted DNS configuration, category blockers, family shield,
         * bedtime schedule, excluded domains, and license state from SharedPreferences.
         * Safe to call on boot/watchdog restart before React Native JS initializes.
         */
        fun syncPersistedState(context: Context) {
            try {
                val prefs = context.getSharedPreferences("adguard_dns_prefs", Context.MODE_PRIVATE)
                val isPremium = prefs.getBoolean("is_premium", true)
                filterEngine.isPremium = isPremium

                val orderedRaw = prefs.getString("upstream_servers_ordered", null)
                val savedServers = if (!orderedRaw.isNullOrBlank()) {
                    orderedRaw.split(',').map { it.trim() }.filter { it.isNotEmpty() }
                } else {
                    prefs.getStringSet("upstream_servers", null)?.toList()
                }
                val savedModeStr = prefs.getString("blocking_mode", null)
                val savedMode = if (savedModeStr != null) {
                    try { BlockingMode.valueOf(savedModeStr) } catch (_: Exception) { null }
                } else null

                val effectiveServers = if (!isPremium) {
                    listOf("1.1.1.1", "1.0.0.1")
                } else {
                    savedServers?.takeIf { it.isNotEmpty() } ?: currentConfig.upstreamDnsServers
                }

                currentConfig = currentConfig.copy(
                    upstreamDnsServers = effectiveServers,
                    blockingMode = savedMode ?: currentConfig.blockingMode
                )

                filterEngine.enableSafeSearch = prefs.getBoolean("safe_search_enabled", false)
                filterEngine.enableFamilyFilter = prefs.getBoolean("family_protection_enabled", false)
                filterEngine.gameAdsBypassEnabled = prefs.getBoolean("game_ads_bypass_enabled", false)

                val savedCats = prefs.getStringSet("category_domains", null)
                if (savedCats != null) {
                    filterEngine.setCategoryDomains(savedCats.toList())
                }

                val savedExcluded = prefs.getStringSet("excluded_domains", null)
                if (savedExcluded != null) {
                    filterEngine.setExcludedDomains(savedExcluded.toList())
                }

                val schedEnabled = prefs.getBoolean("schedule_enabled", false)
                val schedStart = prefs.getInt("schedule_start_hour", 22)
                val schedEnd = prefs.getInt("schedule_end_hour", 7)
                val schedDomains = prefs.getStringSet("schedule_domains", emptySet())?.toList() ?: emptyList()
                filterEngine.setBedtimeSchedule(schedEnabled, schedStart, schedEnd, schedDomains)

                threatAlertsEnabled = prefs.getBoolean("threat_alerts_enabled", true)
            } catch (e: Exception) {
                Log.w(TAG, "Failed restoring persisted VPN state", e)
            }
        }
    }

    private data class PhysicalNetworkSnapshot(
        val bestNetwork: Network?,
        val hasIpv4: Boolean,
        val hasIpv6: Boolean,
        val publicDnsV4: List<String>,
        val publicDnsV6: List<String>,
        val signature: String
    )

    private var vpnInterface: ParcelFileDescriptor? = null
    private var packetRouter: TunPacketRouter? = null
    private var routerThread: Thread? = null

    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var lastEstablishMs: Long = 0L
    @Volatile private var lastNetworkSignature: String = ""

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
            ACTION_RECONFIGURE -> {
                reconfigureVpn()
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

        syncPersistedState(this)
        try {
            if (filterEngine.getRuleCount() == 0) {
                FilterRepository(this).initializeDefaults(filterEngine)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not initialize filter defaults", e)
        }

        establishTunInterface()
    }

    private fun reconfigureVpn() {
        if (!isServiceRunning) {
            return
        }
        Log.i(TAG, "Reconfiguring VPN TUN interface with updated rules, routes & DNS settings")
        tearDownTunInterface()
        establishTunInterface()
    }

    private fun inspectPhysicalNetworks(): PhysicalNetworkSnapshot {
        var bestNetwork: Network? = null
        var bestScore = -1
        var hasIpv4 = false
        var hasIpv6 = false
        val dnsV4 = linkedSetOf<String>()
        val dnsV6 = linkedSetOf<String>()

        try {
            val allNetworks = connectivityManager.allNetworks
            for (net in allNetworks) {
                val caps = connectivityManager.getNetworkCapabilities(net) ?: continue
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)) continue

                val lp: LinkProperties? = try { connectivityManager.getLinkProperties(net) } catch (_: Exception) { null }
                var score = 1
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) score += 10
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) score += 4
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) score += 5

                if (score > bestScore) {
                    bestScore = score
                    bestNetwork = net
                }

                if (lp != null) {
                    for (la in lp.linkAddresses) {
                        val addr = la.address ?: continue
                        if (addr.isLoopbackAddress) continue
                        if (addr is Inet4Address) {
                            hasIpv4 = true
                        } else if (addr is Inet6Address && !addr.isLinkLocalAddress) {
                            hasIpv6 = true
                        }
                    }
                    for (dns in lp.dnsServers) {
                        val host = dns.hostAddress?.substringBefore('%') ?: continue
                        if (dns is Inet4Address && !dns.isLoopbackAddress && !dns.isSiteLocalAddress && !dns.isLinkLocalAddress) {
                            dnsV4.add(host)
                        } else if (dns is Inet6Address && !dns.isLoopbackAddress && !dns.isLinkLocalAddress) {
                            hasIpv6 = true
                            dnsV6.add(host)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error inspecting physical networks", e)
        }

        if (!hasIpv4 && !hasIpv6) {
            hasIpv4 = true
        }

        val sortedV4 = dnsV4.sorted()
        val sortedV6 = dnsV6.sorted()
        val sig = "v4=$hasIpv4|v6=$hasIpv6|d4=${sortedV4.joinToString(",")}|d6=${sortedV6.joinToString(",")}"
        return PhysicalNetworkSnapshot(
            bestNetwork = bestNetwork,
            hasIpv4 = hasIpv4,
            hasIpv6 = hasIpv6,
            publicDnsV4 = sortedV4,
            publicDnsV6 = sortedV6,
            signature = sig
        )
    }

    private fun establishTunInterface() {
        try {
            val snapshot = inspectPhysicalNetworks()
            lastNetworkSignature = snapshot.signature
            lastEstablishMs = System.currentTimeMillis()

            val builder = Builder()

            // 1. Session Name
            builder.setSession("Aegis Guard Protection")

            // 2. MTU & Unmetered flag
            builder.setMtu(currentConfig.mtu)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                builder.setMetered(false)
            }

            // 3. Dual-Stack Virtual Interface & Virtual DNS Servers
            builder.addAddress(currentConfig.virtualIp, currentConfig.virtualPrefixLength)
            builder.addDnsServer(currentConfig.virtualDnsServer)

            if (snapshot.hasIpv6) {
                builder.addAddress(currentConfig.virtualIp6, currentConfig.virtualPrefixLength6)
                builder.addDnsServer(currentConfig.virtualDnsServer6)
            }

            // 4. Build Bypass/DNS Capture CIDR sets
            val captureRaw4 = linkedSetOf("${currentConfig.virtualDnsServer}/32")
            captureRaw4.addAll(PUBLIC_BYPASS_DNS_V4)
            for (ip in snapshot.publicDnsV4) {
                captureRaw4.add("$ip/32")
            }
            val captureTwitter = filterEngine.isDomainBlocked("x.com") || filterEngine.isDomainBlocked("twitter.com")
            if (captureTwitter) {
                captureRaw4.addAll(TWITTER_AS13414_CIDRS)
            }
            val parsedCapture4 = captureRaw4.mapNotNull { CidrExclude.parseCidr4(it) }

            val parsedCapture6 = if (snapshot.hasIpv6) {
                val captureRaw6 = linkedSetOf("${currentConfig.virtualDnsServer6}/128")
                captureRaw6.addAll(PUBLIC_BYPASS_DNS_V6)
                for (ip in snapshot.publicDnsV6) {
                    captureRaw6.add("$ip/128")
                }
                captureRaw6.mapNotNull { CidrExclude.parseCidr6(it) }
            } else emptyList()

            // 5. Full Default Route + Complement Exclusions on Android 13+ (API 33+),
            //    Explicit DNS/Bypass Capture Routes on older Android releases.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                builder.addRoute("0.0.0.0", 0)
                val excludeV4 = CidrExclude.complementIPv4(parsedCapture4)
                for (ex in excludeV4) {
                    builder.excludeRoute(ex.toIpPrefix())
                }

                if (snapshot.hasIpv6 && parsedCapture6.isNotEmpty()) {
                    builder.addRoute("::", 0)
                    val excludeV6 = CidrExclude.complementIPv6(parsedCapture6)
                    for (ex in excludeV6) {
                        builder.excludeRoute(ex.toIpPrefix())
                    }
                }
            } else {
                for (c in parsedCapture4) {
                    builder.addRoute(c.toInetAddress(), c.prefixLen)
                }
                for (c in parsedCapture6) {
                    builder.addRoute(c.toInetAddress(), c.prefixLen)
                }
            }

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
                stopVpn()
                return
            }
            vpnInterface = pfd

            // Bind non-VPN underlying network immediately so upstream DNS sockets work cleanly
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1 && snapshot.bestNetwork != null) {
                try {
                    setUnderlyingNetworks(arrayOf(snapshot.bestNetwork))
                } catch (_: Exception) {}
            }

            // 9. Register underlying network listener (WiFi/Cellular roaming & DNS/IPv6 changes)
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
            Log.i(
                TAG,
                "Aegis Guard VPN active (v6=${snapshot.hasIpv6}, api=${Build.VERSION.SDK_INT}, rules=${filterEngine.getRuleCount()}, twitter=${captureTwitter})"
            )

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

    private fun tearDownTunInterface() {
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
    }

    private fun maybeReconfigureOnNetworkChange() {
        if (!isServiceRunning) return
        val now = System.currentTimeMillis()
        if (now - lastEstablishMs < 2000L) return
        val snapshot = inspectPhysicalNetworks()
        if (snapshot.bestNetwork != null) {
            try { setUnderlyingNetworks(arrayOf(snapshot.bestNetwork)) } catch (_: Exception) {}
        }
        if (snapshot.signature != lastNetworkSignature) {
            mainHandler.post {
                if (isServiceRunning) {
                    reconfigureVpn()
                }
            }
        }
    }

    private fun registerNetworkCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
                .build()

            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    val caps = connectivityManager.getNetworkCapabilities(network)
                    // CRITICAL: NEVER set the VPN itself as the underlying network to prevent routing loops!
                    if (caps != null && !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                        Log.d(TAG, "Active underlying network: $network")
                        setUnderlyingNetworks(arrayOf(network))
                        maybeReconfigureOnNetworkChange()
                    }
                }

                override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) {
                    val caps = connectivityManager.getNetworkCapabilities(network)
                    if (caps != null && !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                        maybeReconfigureOnNetworkChange()
                    }
                }

                override fun onLost(network: Network) {
                    setUnderlyingNetworks(null)
                    maybeReconfigureOnNetworkChange()
                }
            }
            try {
                connectivityManager.registerNetworkCallback(request, networkCallback!!)
            } catch (e: Exception) {
                Log.w(TAG, "Could not register network callback", e)
            }
        }
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping VPN service")
        isServiceRunning = false
        tearDownTunInterface()

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
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Aegis Guard Protection Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows status of Aegis Guard DNS protection"
            }
            manager.createNotificationChannel(channel)

            val threatChannel = NotificationChannel(
                THREAT_CHANNEL_ID,
                "Phishing & Scam Threat Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts immediately when a phishing, homograph, or scam domain is blocked"
            }
            manager.createNotificationChannel(threatChannel)
        }
    }

    fun notifyThreatBlocked(domain: String, rule: String) {
        if (!threatAlertsEnabled) return
        val now = System.currentTimeMillis()
        val lastAlert = threatCooldownMap[domain]
        if (lastAlert != null && (now - lastAlert) < THREAT_COOLDOWN_MS) return
        threatCooldownMap[domain] = now

        try {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = if (launchIntent != null) {
                PendingIntent.getActivity(
                    this, 200, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            } else null

            val notif = NotificationCompat.Builder(this, THREAT_CHANNEL_ID)
                .setContentTitle("Phishing / Threat Blocked")
                .setContentText("AegisGuard blocked dangerous domain: $domain")
                .setStyle(NotificationCompat.BigTextStyle().bigText("AegisGuard blocked a suspected phishing, homograph, or scam domain ($domain). Rule: $rule"))
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
            if (pendingIntent != null) {
                notif.setContentIntent(pendingIntent)
            }
            manager.notify((domain.hashCode() and 0x7FFFFFFF), notif.build())
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS not granted on Android 13+
        } catch (e: Exception) {
            Log.w(TAG, "Failed to post threat alert notification", e)
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
