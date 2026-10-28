package com.fajostech.aegisguard.dns

import java.util.concurrent.ConcurrentHashMap

/**
 * High-performance DNS Cache matching AdGuard's native DnsCache and isOptimisticCache.
 */
class DnsCache(
    private val maxSize: Int = 10000,
    private val isOptimistic: Boolean = true
) {
    data class CacheEntry(
        val responseBytes: ByteArray,
        val expiryTimeMs: Long,
        val optimisticExpiryTimeMs: Long
    )

    private val cache = ConcurrentHashMap<String, CacheEntry>()

    fun get(domain: String, qtype: Int): ByteArray? {
        val key = makeKey(domain, qtype)
        val entry = cache[key] ?: return null
        val now = System.currentTimeMillis()

        if (now < entry.expiryTimeMs) {
            return entry.responseBytes
        }

        // Optimistic cache: serve slightly expired entries if within optimistic window (up to 1 hour past TTL)
        if (isOptimistic && now < entry.optimisticExpiryTimeMs) {
            return entry.responseBytes
        }

        cache.remove(key)
        return null
    }

    fun put(domain: String, qtype: Int, responseBytes: ByteArray, ttlSecs: Long) {
        if (cache.size >= maxSize) {
            // Evict oldest roughly
            val firstKey = cache.keys().nextElement()
            if (firstKey != null) cache.remove(firstKey)
        }

        val now = System.currentTimeMillis()
        val ttlMs = Math.max(5L, ttlSecs) * 1000L
        val expiry = now + ttlMs
        val optimisticExpiry = expiry + (3600L * 1000L) // 1-hour optimistic window

        val key = makeKey(domain, qtype)
        cache[key] = CacheEntry(responseBytes, expiry, optimisticExpiry)
    }

    fun clear() {
        cache.clear()
    }

    fun size(): Int = cache.size

    private fun makeKey(domain: String, qtype: Int): String {
        return "${domain.lowercase()}_$qtype"
    }
}
