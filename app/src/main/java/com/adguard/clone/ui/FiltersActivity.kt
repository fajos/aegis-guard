package com.fajostech.aegisguard.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fajostech.aegisguard.AdguardApplication
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.filter.FilterSubscription
import com.fajostech.aegisguard.vpn.LocalVpnService
import com.google.android.material.switchmaterial.SwitchMaterial
import kotlinx.coroutines.launch

class FiltersActivity : AppCompatActivity() {

    private lateinit var rvFilters: RecyclerView
    private lateinit var btnUpdateAll: Button
    private val adapter = FiltersAdapter()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_filters)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Filter Subscriptions"

        rvFilters = findViewById(R.id.rvFilters)
        btnUpdateAll = findViewById(R.id.btnUpdateAllFilters)

        rvFilters.layoutManager = LinearLayoutManager(this)
        rvFilters.adapter = adapter

        val repo = AdguardApplication.instance.filterRepository
        adapter.submitList(repo.getSubscriptions())

        btnUpdateAll.setOnClickListener {
            updateAllSubscriptions()
        }
    }

    private fun updateAllSubscriptions() {
        val repo = AdguardApplication.instance.filterRepository
        val engine = LocalVpnService.filterEngine

        lifecycleScope.launch {
            Toast.makeText(this@FiltersActivity, "Updating filters...", Toast.LENGTH_SHORT).show()
            for (sub in repo.getSubscriptions()) {
                if (sub.isEnabled) {
                    repo.updateSubscription(sub, engine)
                }
            }
            adapter.notifyDataSetChanged()
            Toast.makeText(this@FiltersActivity, "Filters updated successfully!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }

    inner class FiltersAdapter : RecyclerView.Adapter<FiltersAdapter.ViewHolder>() {
        private var items = listOf<FilterSubscription>()

        fun submitList(newItems: List<FilterSubscription>) {
            items = newItems
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_filter_subscription, parent, false)
            return ViewHolder(v)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            holder.bind(items[position])
        }

        override fun getItemCount(): Int = items.size

        inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            private val tvName: TextView = view.findViewById(R.id.tvFilterName)
            private val tvDesc: TextView = view.findViewById(R.id.tvFilterDesc)
            private val tvCount: TextView = view.findViewById(R.id.tvFilterRuleCount)
            private val switchEnabled: SwitchMaterial = view.findViewById(R.id.switchFilterEnabled)
            private val btnUpdate: Button = view.findViewById(R.id.btnUpdateSingleFilter)

            fun bind(sub: FilterSubscription) {
                tvName.text = sub.name
                tvDesc.text = sub.description
                tvCount.text = "${sub.ruleCount} active rules"

                switchEnabled.setOnCheckedChangeListener(null)
                switchEnabled.isChecked = sub.isEnabled

                switchEnabled.setOnCheckedChangeListener { _, isChecked ->
                    sub.isEnabled = isChecked
                    val repo = AdguardApplication.instance.filterRepository
                    val engine = LocalVpnService.filterEngine
                    repo.reloadAll(engine)
                }

                btnUpdate.setOnClickListener {
                    lifecycleScope.launch {
                        val repo = AdguardApplication.instance.filterRepository
                        val engine = LocalVpnService.filterEngine
                        val ok = repo.updateSubscription(sub, engine)
                        if (ok) {
                            Toast.makeText(this@FiltersActivity, "${sub.name} updated", Toast.LENGTH_SHORT).show()
                            notifyDataSetChanged()
                        } else {
                            Toast.makeText(this@FiltersActivity, "Failed to update ${sub.name}", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        }
    }
}
