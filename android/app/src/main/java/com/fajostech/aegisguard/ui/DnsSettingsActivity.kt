package com.fajostech.aegisguard.ui

import android.os.Bundle
import android.widget.RadioButton
import android.widget.RadioGroup
import androidx.appcompat.app.AppCompatActivity
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.vpn.LocalVpnService
import com.google.android.material.switchmaterial.SwitchMaterial

class DnsSettingsActivity : AppCompatActivity() {

    private lateinit var rgDns: RadioGroup
    private lateinit var switchParallel: SwitchMaterial
    private lateinit var switchOptimistic: SwitchMaterial
    private lateinit var switchBlockEch: SwitchMaterial
    private lateinit var switchBlockIpv6: SwitchMaterial

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_dns_settings)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "DNS Settings"

        rgDns = findViewById(R.id.rgDnsProviders)
        switchParallel = findViewById(R.id.switchParallelDns)
        switchOptimistic = findViewById(R.id.switchOptimisticCache)
        switchBlockEch = findViewById(R.id.switchBlockEch)
        switchBlockIpv6 = findViewById(R.id.switchBlockIpv6)

        val config = LocalVpnService.currentConfig
        val engine = LocalVpnService.filterEngine

        switchBlockEch.isChecked = engine.blockEch
        switchBlockIpv6.isChecked = engine.blockIpv6

        switchBlockEch.setOnCheckedChangeListener { _, isChecked ->
            engine.blockEch = isChecked
        }

        switchBlockIpv6.setOnCheckedChangeListener { _, isChecked ->
            engine.blockIpv6 = isChecked
        }

        rgDns.setOnCheckedChangeListener { _, checkedId ->
            val upstreams = when (checkedId) {
                R.id.rbAdguardDns -> listOf("94.140.14.14", "94.140.15.15")
                R.id.rbAdguardFamily -> listOf("94.140.14.15", "94.140.15.16")
                R.id.rbCloudflareDns -> listOf("1.1.1.1", "1.0.0.1")
                R.id.rbGoogleDns -> listOf("8.8.8.8", "8.8.4.4")
                else -> listOf("94.140.14.14", "1.1.1.1")
            }
            LocalVpnService.currentConfig = config.copy(upstreamDnsServers = upstreams)
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
