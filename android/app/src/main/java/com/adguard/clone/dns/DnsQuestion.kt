package com.fajostech.aegisguard.dns

data class DnsQuestion(
    val name: String,
    val type: Int,
    val qclass: Int
) {
    companion object {
        const val TYPE_A = 1
        const val TYPE_NS = 2
        const val TYPE_CNAME = 5
        const val TYPE_SOA = 6
        const val TYPE_PTR = 12
        const val TYPE_MX = 15
        const val TYPE_TXT = 16
        const val TYPE_AAAA = 28
        const val TYPE_HTTPS = 65
        const val TYPE_ANY = 255

        const val CLASS_IN = 1
    }
}
