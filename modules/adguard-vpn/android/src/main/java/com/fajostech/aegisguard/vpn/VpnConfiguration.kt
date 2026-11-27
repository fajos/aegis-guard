package com.fajostech.aegisguard.vpn

import com.fajostech.aegisguard.filter.BlockingMode

data class VpnConfiguration(
    val virtualIp: String = "10.0.0.2",
    val virtualPrefixLength: Int = 30,
    val virtualDnsServer: String = "198.18.53.53", // AdGuard's designated virtual DNS IP (RFC 2544)
    val virtualIp6: String = "fd12:1:1:1::4",
    val virtualPrefixLength6: Int = 64,
    val virtualDnsServer6: String = "fd00:198:18::53",
    val mtu: Int = 1500,
    val upstreamDnsServers: List<String> = listOf("94.140.14.14", "94.140.15.15"),
    val blockingMode: BlockingMode = BlockingMode.ADDRESS,
    val blockedTtlSecs: Long = 60L,
    val disallowedApplications: Set<String> = emptySet()
)
