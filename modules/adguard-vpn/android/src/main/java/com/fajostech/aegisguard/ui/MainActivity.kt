package com.fajostech.aegisguard.ui

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.vpn.LocalVpnService
import com.google.android.material.switchmaterial.SwitchMaterial
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Main Controller Activity modeling AdGuard's MainActivity & VpnPrepareActivity.
 */
class MainActivity : AppCompatActivity() {

    private val viewModel: StatsViewModel by viewModels()
    private val logAdapter = QueryLogAdapter()

    private lateinit var tvStatusTitle: TextView
    private lateinit var tvStatusSubtitle: TextView
    private lateinit var switchVpn: SwitchMaterial
    private lateinit var tvBlockedCount: TextView
    private lateinit var tvTotalCount: TextView
    private lateinit var tvDataSaved: TextView
    private lateinit var tvRuleCount: TextView
    private lateinit var rvQueryLog: RecyclerView

    private lateinit var btnNavApps: Button
    private lateinit var btnNavFilters: Button
    private lateinit var btnNavDns: Button
    private lateinit var btnNavUserRules: Button
    private lateinit var btnNavQueryLog: Button

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            startVpnService()
        } else {
            Toast.makeText(this, "VPN permission is required to filter traffic", Toast.LENGTH_SHORT).show()
            switchVpn.isChecked = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        initNavigation()
        observeViewModel()
    }

    private fun initViews() {
        tvStatusTitle = findViewById(R.id.tvStatusTitle)
        tvStatusSubtitle = findViewById(R.id.tvStatusSubtitle)
        switchVpn = findViewById(R.id.switchVpn)
        tvBlockedCount = findViewById(R.id.tvBlockedCount)
        tvTotalCount = findViewById(R.id.tvTotalCount)
        tvDataSaved = findViewById(R.id.tvDataSaved)
        tvRuleCount = findViewById(R.id.tvRuleCount)
        rvQueryLog = findViewById(R.id.rvQueryLog)

        btnNavApps = findViewById(R.id.btnNavApps)
        btnNavFilters = findViewById(R.id.btnNavFilters)
        btnNavDns = findViewById(R.id.btnNavDns)
        btnNavUserRules = findViewById(R.id.btnNavUserRules)
        btnNavQueryLog = findViewById(R.id.btnNavQueryLog)

        rvQueryLog.layoutManager = LinearLayoutManager(this)
        rvQueryLog.adapter = logAdapter

        switchVpn.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                if (!LocalVpnService.isServiceRunning) {
                    prepareAndStartVpn()
                }
            } else {
                if (LocalVpnService.isServiceRunning) {
                    stopVpnService()
                }
            }
        }
    }

    private fun initNavigation() {
        btnNavApps.setOnClickListener {
            startActivity(Intent(this, AppsActivity::class.java))
        }
        btnNavFilters.setOnClickListener {
            startActivity(Intent(this, FiltersActivity::class.java))
        }
        btnNavDns.setOnClickListener {
            startActivity(Intent(this, DnsSettingsActivity::class.java))
        }
        btnNavUserRules.setOnClickListener {
            startActivity(Intent(this, UserRulesActivity::class.java))
        }
        btnNavQueryLog.setOnClickListener {
            startActivity(Intent(this, QueryLogActivity::class.java))
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            viewModel.uiState.collectLatest { state ->
                switchVpn.isChecked = state.isRunning
                if (state.isRunning) {
                    tvStatusTitle.text = getString(R.string.status_running)
                    tvStatusTitle.setTextColor(getColor(android.R.color.holo_green_dark))
                    tvStatusSubtitle.text = "Filtering active • ${state.ruleCount} rules loaded"
                } else {
                    tvStatusTitle.text = getString(R.string.status_stopped)
                    tvStatusTitle.setTextColor(getColor(android.R.color.darker_gray))
                    tvStatusSubtitle.text = "Tap below to enable local VPN ad-blocking"
                }

                tvBlockedCount.text = state.blockedQueries.toString()
                tvTotalCount.text = state.totalQueries.toString()
                tvDataSaved.text = state.dataSavedText
                tvRuleCount.text = state.ruleCount.toString()

                logAdapter.submitList(state.recentLogs)
            }
        }
    }

    private fun prepareAndStartVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnPermissionLauncher.launch(intent)
        } else {
            startVpnService()
        }
    }

    private fun startVpnService() {
        val serviceIntent = Intent(this, LocalVpnService::class.java).apply {
            action = LocalVpnService.ACTION_START
        }
        startService(serviceIntent)
    }

    private fun stopVpnService() {
        val serviceIntent = Intent(this, LocalVpnService::class.java).apply {
            action = LocalVpnService.ACTION_STOP
        }
        startService(serviceIntent)
    }
}
