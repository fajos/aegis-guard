package com.fajostech.aegisguard.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.log.QueryLogEntry
import com.fajostech.aegisguard.stats.StatisticsManager
import com.fajostech.aegisguard.vpn.LocalVpnService
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class StatsViewModel : ViewModel() {

    data class UiState(
        val isRunning: Boolean = false,
        val totalQueries: Long = 0,
        val blockedQueries: Long = 0,
        val dataSavedText: String = "0 KB",
        val ruleCount: Int = 0,
        val recentLogs: List<QueryLogEntry> = emptyList()
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        startPolling()
    }

    private fun startPolling() {
        viewModelScope.launch {
            while (true) {
                val engine = LocalVpnService.filterEngine
                val bytes = StatisticsManager.getEstimatedDataSavedBytes()
                val dataText = if (bytes > 1024 * 1024) {
                    "%.1f MB".format(bytes.toFloat() / (1024 * 1024))
                } else {
                    "${bytes / 1024} KB"
                }

                _uiState.value = UiState(
                    isRunning = LocalVpnService.isServiceRunning,
                    totalQueries = engine.totalQueries.get(),
                    blockedQueries = engine.blockedQueries.get(),
                    dataSavedText = dataText,
                    ruleCount = engine.getRuleCount(),
                    recentLogs = FilteringLog.getRecentEntries().take(15)
                )
                delay(1000)
            }
        }
    }
}
