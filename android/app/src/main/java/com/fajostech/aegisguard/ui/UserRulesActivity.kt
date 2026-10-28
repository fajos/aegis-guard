package com.fajostech.aegisguard.ui

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.fajostech.aegisguard.AdguardApplication
import com.fajostech.aegisguard.R
import com.fajostech.aegisguard.vpn.LocalVpnService

class UserRulesActivity : AppCompatActivity() {

    private lateinit var etRules: EditText
    private lateinit var btnSave: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user_rules)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Custom User Rules"

        etRules = findViewById(R.id.etUserRules)
        btnSave = findViewById(R.id.btnSaveUserRules)

        val repo = AdguardApplication.instance.filterRepository
        etRules.setText(repo.getUserRules())

        btnSave.setOnClickListener {
            val content = etRules.text.toString()
            val engine = LocalVpnService.filterEngine
            repo.saveUserRules(content, engine)
            Toast.makeText(this, "Rules saved! Active rules: ${engine.getRuleCount()}", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
