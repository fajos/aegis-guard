package com.fajostech.aegisguard.stats

import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.log.QueryLogEntry
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

object StatisticsManager {

    val totalQueries = AtomicLong(0)
    val blockedQueries = AtomicLong(0)
    private val domainCounts = ConcurrentHashMap<String, AtomicLong>()
    private val blockedDomainCounts = ConcurrentHashMap<String, AtomicLong>()

    init {
        FilteringLog.addListener { entry ->
            recordQuery(entry)
        }
    }

    private fun recordQuery(entry: QueryLogEntry) {
        totalQueries.incrementAndGet()
        domainCounts.computeIfAbsent(entry.domain) { AtomicLong(0) }.incrementAndGet()

        if (entry.isBlocked) {
            blockedQueries.incrementAndGet()
            blockedDomainCounts.computeIfAbsent(entry.domain) { AtomicLong(0) }.incrementAndGet()
        }
    }

    fun getEstimatedDataSavedBytes(): Long {
        // Average ad / tracking resource payload is ~50 KB
        return blockedQueries.get() * 50 * 1024L
    }

    fun getBlockRate(): Float {
        val total = totalQueries.get()
        if (total == 0L) return 0f
        return (blockedQueries.get().toFloat() / total.toFloat()) * 100f
    }

    fun getTopBlockedDomains(limit: Int = 10): List<Pair<String, Long>> {
        return blockedDomainCounts.entries
            .map { it.key to it.value.get() }
            .sortedByDescending { it.second }
            .take(limit)
    }

    fun getTopQueriedDomains(limit: Int = 10): List<Pair<String, Long>> {
        return domainCounts.entries
            .map { it.key to it.value.get() }
            .sortedByDescending { it.second }
            .take(limit)
    }

    fun reset() {
        totalQueries.set(0)
        blockedQueries.set(0)
        domainCounts.clear()
        blockedDomainCounts.clear()
    }
}
