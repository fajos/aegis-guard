package com.fajostech.aegisguard.ui

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.fajostech.aegisguard.AdguardApplication
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.appmanagement.AppInfo
import com.google.android.material.switchmaterial.SwitchMaterial
import kotlinx.coroutines.launch

class AppsActivity : AppCompatActivity() {

    private lateinit var etSearch: EditText
    private lateinit var progressBar: ProgressBar
    private lateinit var rvApps: RecyclerView
    private val adapter = AppsAdapter()
    private var allApps = listOf<AppInfo>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_apps)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "App Management"

        etSearch = findViewById(R.id.etSearchApp)
        progressBar = findViewById(R.id.pbLoadingApps)
        rvApps = findViewById(R.id.rvApps)

        rvApps.layoutManager = LinearLayoutManager(this)
        rvApps.adapter = adapter

        loadApps()

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                filter(s.toString())
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        })
    }

    private fun loadApps() {
        progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            allApps = AdguardApplication.instance.appManager.getInstalledApps()
            progressBar.visibility = View.GONE
            adapter.submitList(allApps)
        }
    }

    private fun filter(query: String) {
        val q = query.trim().lowercase()
        val filtered = if (q.isEmpty()) {
            allApps
        } else {
            allApps.filter {
                it.appName.lowercase().contains(q) || it.packageName.lowercase().contains(q)
            }
        }
        adapter.submitList(filtered)
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }

    inner class AppsAdapter : RecyclerView.Adapter<AppsAdapter.ViewHolder>() {
        private var items = listOf<AppInfo>()

        fun submitList(newItems: List<AppInfo>) {
            items = newItems
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_app_management, parent, false)
            return ViewHolder(v)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            holder.bind(items[position])
        }

        override fun getItemCount(): Int = items.size

        inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            private val ivIcon: ImageView = view.findViewById(R.id.ivAppIcon)
            private val tvName: TextView = view.findViewById(R.id.tvAppName)
            private val tvPackage: TextView = view.findViewById(R.id.tvPackageName)
            private val switchFilter: SwitchMaterial = view.findViewById(R.id.switchFilterApp)

            fun bind(app: AppInfo) {
                tvName.text = app.appName
                tvPackage.text = app.packageName
                if (app.icon != null) {
                    ivIcon.setImageDrawable(app.icon)
                } else {
                    ivIcon.setImageResource(android.R.drawable.sym_def_app_icon)
                }

                switchFilter.setOnCheckedChangeListener(null)
                switchFilter.isChecked = app.isFiltered

                switchFilter.setOnCheckedChangeListener { _, isChecked ->
                    app.isFiltered = isChecked
                    app.isVpnBypassed = !isChecked
                    AdguardApplication.instance.appManager.setAppBypass(app.packageName, !isChecked)
                }
            }
        }
    }
}
