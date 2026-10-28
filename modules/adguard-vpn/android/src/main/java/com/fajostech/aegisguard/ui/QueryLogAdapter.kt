package com.fajostech.aegisguard.ui

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.log.QueryLogEntry

class QueryLogAdapter(
    private val onItemClick: ((QueryLogEntry) -> Unit)? = null
) : RecyclerView.Adapter<QueryLogAdapter.ViewHolder>() {

    private var items = listOf<QueryLogEntry>()

    fun submitList(newItems: List<QueryLogEntry>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_query_log, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val entry = items[position]
        holder.bind(entry)
        holder.itemView.setOnClickListener {
            onItemClick?.invoke(entry)
        }
    }

    override fun getItemCount(): Int = items.size

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val tvBadge: TextView = view.findViewById(R.id.tvStatusBadge)
        private val tvDomain: TextView = view.findViewById(R.id.tvDomain)
        private val tvRule: TextView = view.findViewById(R.id.tvRule)
        private val tvLatency: TextView = view.findViewById(R.id.tvLatency)

        fun bind(entry: QueryLogEntry) {
            tvDomain.text = entry.domain
            tvLatency.text = "${entry.durationMs}ms"

            if (entry.isBlocked) {
                tvBadge.text = "BLOCKED"
                tvBadge.setBackgroundColor(Color.parseColor("#E53935"))
                tvRule.text = "Rule: ${entry.matchedRule ?: "Blocklist"}"
                tvRule.visibility = View.VISIBLE
            } else {
                tvBadge.text = "ALLOWED"
                tvBadge.setBackgroundColor(Color.parseColor("#43A047"))
                tvRule.text = "Upstream: ${entry.upstream ?: "Direct"}"
                tvRule.visibility = View.VISIBLE
            }
        }
    }
}
