package com.fajostech.aegisguard.ui

import android.app.AlertDialog
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fajostech.aegisguard.AdguardApplication
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.log.QueryLogEntry
import com.fajostech.aegisguard.vpn.LocalVpnService

class QueryLogActivity : AppCompatActivity() {

    private lateinit var etSearch: EditText
    private lateinit var btnAll: Button
    private lateinit var btnBlocked: Button
    private lateinit var btnAllowed: Button
    private lateinit var rvLog: RecyclerView

    private val adapter = QueryLogAdapter { entry ->
        showEntryDetailsDialog(entry)
    }

    private var filterMode: FilterMode = FilterMode.ALL
    private var searchQuery: String = ""

    enum class FilterMode { ALL, BLOCKED, ALLOWED }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_query_log)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Filtering Log"

        etSearch = findViewById(R.id.etSearchQueryLog)
        btnAll = findViewById(R.id.btnFilterAll)
        btnBlocked = findViewById(R.id.btnFilterBlocked)
        btnAllowed = findViewById(R.id.btnFilterAllowed)
        rvLog = findViewById(R.id.rvFullQueryLog)

        rvLog.layoutManager = LinearLayoutManager(this)
        rvLog.adapter = adapter

        btnAll.setOnClickListener {
            filterMode = FilterMode.ALL
            refreshList()
        }
        btnBlocked.setOnClickListener {
            filterMode = FilterMode.BLOCKED
            refreshList()
        }
        btnAllowed.setOnClickListener {
            filterMode = FilterMode.ALLOWED
            refreshList()
        }

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                searchQuery = s.toString().trim().lowercase()
                refreshList()
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        })

        refreshList()
    }

    private fun refreshList() {
        var list = FilteringLog.getRecentEntries()

        list = when (filterMode) {
            FilterMode.ALL -> list
            FilterMode.BLOCKED -> list.filter { it.isBlocked }
            FilterMode.ALLOWED -> list.filter { !it.isBlocked }
        }

        if (searchQuery.isNotEmpty()) {
            list = list.filter { it.domain.lowercase().contains(searchQuery) }
        }

        adapter.submitList(list)
    }

    private fun showEntryDetailsDialog(entry: QueryLogEntry) {
        val statusText = if (entry.isBlocked) "BLOCKED" else "ALLOWED"
        val ruleText = entry.matchedRule ?: "None"
        val upstreamText = entry.upstream ?: "Local Cache"

        val message = "Domain: ${entry.domain}\n" +
                "Status: $statusText\n" +
                "Query Type: ${entry.queryType}\n" +
                "Rule: $ruleText\n" +
                "Upstream: $upstreamText\n" +
                "Response Time: ${entry.durationMs}ms"

        val actionBtnText = if (entry.isBlocked) "Unblock Domain (Add Exception)" else "Block Domain (Add Rule)"

        AlertDialog.Builder(this)
            .setTitle("DNS Request Details")
            .setMessage(message)
            .setPositiveButton(actionBtnText) { _, _ ->
                val repo = AdguardApplication.instance.filterRepository
                val engine = LocalVpnService.filterEngine
                val currentRules = repo.getUserRules()

                val newRule = if (entry.isBlocked) {
                    "@@||${entry.domain}^"
                } else {
                    "||${entry.domain}^"
                }

                val updatedRules = if (currentRules.isEmpty()) newRule else "$currentRules\n$newRule"
                repo.saveUserRules(updatedRules, engine)

                Toast.makeText(this, "Generated Rule: $newRule", Toast.LENGTH_SHORT).show()
                refreshList()
            }
            .setNegativeButton("Close", null)
            .show()
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
