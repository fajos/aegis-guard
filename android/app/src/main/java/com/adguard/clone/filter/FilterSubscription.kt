package com.fajostech.aegisguard.filter

data class FilterSubscription(
    val id: Int,
    val name: String,
    val description: String,
    val url: String?,
    var isEnabled: Boolean = true,
    var ruleCount: Int = 0,
    var lastUpdated: Long = 0L,
    val isCustom: Boolean = false
)
