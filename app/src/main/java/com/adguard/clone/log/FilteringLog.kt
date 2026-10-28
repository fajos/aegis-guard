package com.fajostech.aegisguard.log

import java.util.concurrent.ConcurrentLinkedDeque

/**
 * Thread-safe filtering log matching AdGuard's FilteringLogAction and events logger.
 */
object FilteringLog {
    private const val MAX_LOG_SIZE = 200
    private val entries = ConcurrentLinkedDeque<QueryLogEntry>()
    private val listeners = mutableListOf<(QueryLogEntry) -> Unit>()

    @Synchronized
    fun addEntry(entry: QueryLogEntry) {
        entries.addFirst(entry)
        while (entries.size > MAX_LOG_SIZE) {
            entries.removeLast()
        }
        notifyListeners(entry)
    }

    fun getRecentEntries(): List<QueryLogEntry> = entries.toList()

    @Synchronized
    fun clear() {
        entries.clear()
    }

    @Synchronized
    fun addListener(listener: (QueryLogEntry) -> Unit) {
        listeners.add(listener)
    }

    @Synchronized
    fun removeListener(listener: (QueryLogEntry) -> Unit) {
        listeners.remove(listener)
    }

    private fun notifyListeners(entry: QueryLogEntry) {
        val copy = synchronized(this) { listeners.toList() }
        copy.forEach { it(entry) }
    }
}
