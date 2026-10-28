package com.fajostech.aegisguard.vpn

import com.fajostech.aegisguard.filter.BlockingMode

data class VpnConfiguration(
    val virtualIp: String = "10.0.0.2",
    val virtualPrefixLength: Int = 32,
    val virtualDnsServer: String = "198.18.53.53", // AdGuard's designated virtual DNS IP (RFC 2544)
    val mtu: Int = 1500,
    val upstreamDnsServers: List<String> = listOf("94.140.14.14", "1.1.1.1", "8.8.8.8"),
    val blockingMode: BlockingMode = BlockingMode.ADDRESS,
    val blockedTtlSecs: Long = 3600L,
    val disallowedApplications: Set<String> = emptySet()
)
