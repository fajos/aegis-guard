package com.fajostech.aegisguard.dns

import android.net.VpnService
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.TimeUnit
import javax.net.SocketFactory

/**
 * Encrypted DNS-over-HTTPS (DoH) resolver with VPN-protected sockets and
 * bootstrap hostname resolution so DoH requests never loop back through TUN.
 */
class DohResolver(
    private val dohUrl: String = "https://dns.adguard-dns.com/dns-query",
    private val vpnService: VpnService? = null,
    private val client: OkHttpClient = buildProtectedClient(vpnService)
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
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private val BOOTSTRAP_IPS: Map<String, List<String>> = mapOf(
            "dns.adguard-dns.com" to listOf("94.140.14.14", "94.140.15.15"),
            "family.adguard-dns.com" to listOf("94.140.14.15", "94.140.15.16"),
            "unfiltered.adguard-dns.com" to listOf("94.140.14.140", "94.140.14.141"),
            "dns.google" to listOf("8.8.8.8", "8.8.4.4"),
            "cloudflare-dns.com" to listOf("1.1.1.1", "1.0.0.1"),
            "family.cloudflare-dns.com" to listOf("1.1.1.3", "1.0.0.3"),
            "security.cloudflare-dns.com" to listOf("1.1.1.2", "1.0.0.2"),
            "dns.quad9.net" to listOf("9.9.9.9", "149.112.112.112"),
            "doh.opendns.com" to listOf("208.67.222.222", "208.67.220.220"),
            "dns.nextdns.io" to listOf("45.90.28.0", "45.90.30.0")
        )

        fun buildProtectedClient(vpnService: VpnService?): OkHttpClient {
            val baseFactory = SocketFactory.getDefault()
            val protectedFactory = object : SocketFactory() {
                private fun protectSocket(socket: Socket): Socket {
                    if (vpnService != null && !vpnService.protect(socket)) {
                        try { socket.close() } catch (_: Exception) {}
                        throw java.io.IOException("Failed to protect DoH socket")
                    }
                    return socket
                }

                override fun createSocket(): Socket = protectSocket(baseFactory.createSocket())
                override fun createSocket(host: String?, port: Int): Socket = protectSocket(baseFactory.createSocket(host, port))
                override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket =
                    protectSocket(baseFactory.createSocket(host, port, localHost, localPort))
                override fun createSocket(host: InetAddress?, port: Int): Socket = protectSocket(baseFactory.createSocket(host, port))
                override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket =
                    protectSocket(baseFactory.createSocket(address, port, localAddress, localPort))
            }

            val bootstrapDns = object : Dns {
                override fun lookup(hostname: String): List<InetAddress> {
                    val key = hostname.lowercase()
                    val known = BOOTSTRAP_IPS[key]
                    if (known != null) {
                        return known.mapNotNull { ip ->
                            try { InetAddress.getByName(ip) } catch (_: Exception) { null }
                        }.ifEmpty { Dns.SYSTEM.lookup(hostname) }
                    }
                    // Resolve unknown custom DoH hostnames via a protected UDP/53 query to 94.140.14.14
                    val udpResolved = resolveHostnameDirect(hostname, vpnService)
                    return if (udpResolved.isNotEmpty()) udpResolved else Dns.SYSTEM.lookup(hostname)
                }
            }

            return OkHttpClient.Builder()
                .socketFactory(protectedFactory)
                .dns(bootstrapDns)
                .connectTimeout(3, TimeUnit.SECONDS)
                .readTimeout(3, TimeUnit.SECONDS)
                .build()
        }

        private fun resolveHostnameDirect(hostname: String, vpnService: VpnService?): List<InetAddress> {
            return try {
                val query = buildSimpleAQuery(hostname)
                val resolver = ParallelDnsResolver(
                    upstreamServers = listOf("94.140.14.14", "1.1.1.1"),
                    vpnService = vpnService,
                    timeoutMs = 1500
                )
                val resp = resolver.resolve(query, hostname, 1) ?: return emptyList()
                extractARecordsFromDnsWire(resp)
            } catch (_: Exception) {
                emptyList()
            }
        }

        private fun buildSimpleAQuery(hostname: String): ByteArray {
            val out = java.io.ByteArrayOutputStream()
            val dos = java.io.DataOutputStream(out)
            dos.writeShort(0x4242) // txId
            dos.writeShort(0x0100) // Standard query, RD=1
            dos.writeShort(1)      // QDCOUNT
            dos.writeShort(0)      // ANCOUNT
            dos.writeShort(0)      // NSCOUNT
            dos.writeShort(0)      // ARCOUNT
            for (label in hostname.trimEnd('.').split('.')) {
                val bytes = label.toByteArray(Charsets.US_ASCII)
                dos.writeByte(bytes.size)
                dos.write(bytes)
            }
            dos.writeByte(0)
            dos.writeShort(1) // TYPE A
            dos.writeShort(1) // CLASS IN
            return out.toByteArray()
        }

        private fun extractARecordsFromDnsWire(data: ByteArray): List<InetAddress> {
            if (data.size < 12) return emptyList()
            val buf = java.nio.ByteBuffer.wrap(data)
            buf.short // txId
            buf.short // flags
            val qdCount = buf.short.toInt() and 0xFFFF
            val anCount = buf.short.toInt() and 0xFFFF
            buf.short // nsCount
            buf.short // arCount

            fun skipName(): Boolean {
                var guard = 0
                while (buf.hasRemaining() && guard++ < 128) {
                    val len = buf.get().toInt() and 0xFF
                    if (len == 0) return true
                    if ((len and 0xC0) == 0xC0) {
                        if (!buf.hasRemaining()) return false
                        buf.get()
                        return true
                    }
                    if (buf.remaining() < len) return false
                    buf.position(buf.position() + len)
                }
                return false
            }

            for (i in 0 until qdCount) {
                if (!skipName() || buf.remaining() < 4) return emptyList()
                buf.position(buf.position() + 4)
            }

            val result = mutableListOf<InetAddress>()
            for (i in 0 until anCount) {
                if (!skipName() || buf.remaining() < 10) break
                val rType = buf.short.toInt() and 0xFFFF
                buf.short // class
                buf.int // ttl
                val rdLen = buf.short.toInt() and 0xFFFF
                if (buf.remaining() < rdLen) break
                val rdata = ByteArray(rdLen)
                buf.get(rdata)
                if ((rType == 1 && rdLen == 4) || (rType == 28 && rdLen == 16)) {
                    try {
                        result.add(InetAddress.getByAddress(rdata))
                    } catch (_: Exception) {}
                }
            }
            return result
        }
    }
}
