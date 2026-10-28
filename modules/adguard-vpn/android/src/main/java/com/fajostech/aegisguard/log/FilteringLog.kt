package com.fajostech.aegisguard.log

import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Thread-safe filtering log matching AdGuard's FilteringLogAction and events logger.
 * Uses lock-free collections to avoid blocking packet-processing worker threads.
 */
object FilteringLog {
    private const val MAX_LOG_SIZE = 200
    private val entries = ConcurrentLinkedDeque<QueryLogEntry>()
    private val listeners = CopyOnWriteArrayList<(QueryLogEntry) -> Unit>()

    fun addEntry(entry: QueryLogEntry) {
        entries.addFirst(entry)
        while (entries.size > MAX_LOG_SIZE) {
            try {
                entries.removeLast()
            } catch (e: Exception) {
                break
            }
        }
        notifyListeners(entry)
    }

    fun getRecentEntries(): List<QueryLogEntry> = entries.toList()

    fun clear() {
        entries.clear()
    }

    fun addListener(listener: (QueryLogEntry) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (QueryLogEntry) -> Unit) {
        listeners.remove(listener)
    }

    private fun notifyListeners(entry: QueryLogEntry) {
        for (listener in listeners) {
            try {
                listener(entry)
            } catch (e: Exception) {
                // Non-fatal: listener error must not stall packet processing
            }
        }
    }
}
