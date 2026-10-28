package com.fajostech.aegisguard.filter

/**
 * Defines how blocked DNS queries are answered, matching AdGuard's DnsProxySettings$BlockingMode.
 */
enum class BlockingMode {
    /**
     * Responds with 0.0.0.0 for IPv4 queries (A) and :: for IPv6 queries (AAAA).
     * Fast, prevents client retries, standard AdGuard default.
     */
    ADDRESS,

    /**
     * Responds with RCODE 3 (Name Error / NXDOMAIN).
     * Signals to the client that the domain does not exist.
     */
    NXDOMAIN,

    /**
     * Responds with RCODE 5 (Query Refused).
     */
    REFUSED
}
