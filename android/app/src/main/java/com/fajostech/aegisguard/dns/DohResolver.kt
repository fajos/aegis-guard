package com.fajostech.aegisguard.dns

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Encrypted DNS-over-HTTPS (DoH) resolver, matching AdGuard's native DnsLibs DoH upstream capabilities.
 */
class DohResolver(
    private val dohUrl: String = "https://dns.adguard-dns.com/dns-query",
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()
) {
    private val dnsMediaType = "application/dns-message".toMediaType()

    fun resolve(queryBytes: ByteArray): ByteArray? {
        val requestBody = queryBytes.toRequestBody(dnsMediaType)
        val request = Request.Builder()
            .url(dohUrl)
            .post(requestBody)
            .addHeader("Accept", "application/dns-message")
            .build()

        return try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    response.body?.bytes()
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
    }
}
