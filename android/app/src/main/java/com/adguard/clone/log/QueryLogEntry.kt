package com.fajostech.aegisguard.log

data class QueryLogEntry(
    val id: Long = System.currentTimeMillis(),
    val timestamp: Long = System.currentTimeMillis(),
    val domain: String,
    val queryType: String,
    val isBlocked: Boolean,
    val matchedRule: String? = null,
    val durationMs: Long = 0L,
    val upstream: String? = null
)
