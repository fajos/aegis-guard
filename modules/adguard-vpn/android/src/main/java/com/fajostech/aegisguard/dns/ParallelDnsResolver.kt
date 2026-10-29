package com.fajostech.aegisguard.dns

import android.net.VpnService
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException

/**
 * High-performance Parallel DNS Resolver matching AdGuard's isEnableParallelUpstreamQueries.
 * Races upstream servers concurrently and returns the fastest verified response.
 */
class ParallelDnsResolver(
    private val upstreamServers: List<String> = listOf("94.140.14.14", "1.1.1.1", "8.8.8.8"),
    private val vpnService: VpnService? = null,
    private val timeoutMs: Int = 2000,
    private val dnsCache: DnsCache = DnsCache()
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    fun resolve(queryBytes: ByteArray, domain: String, qtype: Int): ByteArray? {
        // 1. Check cache first
        val cached = dnsCache.get(domain, qtype)
        if (cached != null) {
            // Rewrite transaction ID from query into cached response
            if (cached.size >= 2 && queryBytes.size >= 2) {
                val adapted = cached.clone()
                adapted[0] = queryBytes[0]
                adapted[1] = queryBytes[1]
                return adapted
            }
            return cached
        }

        // Filter out any virtual or loopback IPs to avoid recursive routing loops
        val validUpstreams = upstreamServers
            .filter { it != "198.18.53.53" && it != "127.0.0.1" && it != "0.0.0.0" && it.isNotBlank() }
            .ifEmpty { listOf("94.140.14.14", "1.1.1.1", "8.8.8.8") }

        // 2. Race parallel upstreams with hard timeout
        return runBlocking {
            val winner = CompletableDeferred<ByteArray?>()
            val jobs = mutableListOf<Job>()

            for (server in validUpstreams) {
                val job = scope.launch {
                    val result = querySingleUpstream(server, queryBytes)
                    if (result != null && !winner.isCompleted) {
                        winner.complete(result)
                    }
                }
                jobs.add(job)
            }

            val fastestResponse = try {
                withTimeoutOrNull(timeoutMs.toLong()) {
                    winner.await()
                }
            } catch (e: Exception) {
                null
            }

            // Cancel any remaining slower queries
            jobs.forEach { it.cancel() }

            if (fastestResponse != null) {
                dnsCache.put(domain, qtype, fastestResponse, 300L)
            }

            fastestResponse
        }
    }

    private fun querySingleUpstream(server: String, queryBytes: ByteArray): ByteArray? {
        if (server == "198.18.53.53" || server == "127.0.0.1" || server == "0.0.0.0") return null
        var socket: DatagramSocket? = null
        try {
            socket = DatagramSocket()
            val protected = vpnService?.protect(socket) ?: true
            if (!protected) {
                socket.close()
                return null
            }
            socket.soTimeout = timeoutMs

            val serverAddr = InetAddress.getByName(server)
            val outPacket = DatagramPacket(queryBytes, queryBytes.size, serverAddr, 53)
            socket.send(outPacket)

            val inBuffer = ByteArray(2048)
            val inPacket = DatagramPacket(inBuffer, inBuffer.size)
            socket.receive(inPacket)

            val result = ByteArray(inPacket.length)
            System.arraycopy(inBuffer, 0, result, 0, inPacket.length)
            return result
        } catch (e: SocketTimeoutException) {
            return null
        } catch (e: Exception) {
            return null
        } finally {
            try { socket?.close() } catch (e: Exception) {}
        }
    }

    fun measureLatency(server: String): Long {
        if (server == "198.18.53.53" || server == "127.0.0.1" || server == "0.0.0.0" || server.isBlank()) return -1L
        var socket: DatagramSocket? = null
        return try {
            socket = DatagramSocket()
            val protected = vpnService?.protect(socket) ?: true
            if (!protected) {
                socket.close()
                return -1L
            }
            socket.soTimeout = 1800

            // Standard DNS query for "example.com" (IN A, TXID 0x1234)
            val testQuery = byteArrayOf(
                0x12, 0x34, // Transaction ID
                0x01, 0x00, // Flags: Standard query, RD
                0x00, 0x01, // Questions: 1
                0x00, 0x00, // Answer RRs: 0
                0x00, 0x00, // Authority RRs: 0
                0x00, 0x00, // Additional RRs: 0
                0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, // "example"
                0x03, 0x63, 0x6f, 0x6d, // "com"
                0x00,       // Root
                0x00, 0x01, // Type: A
                0x00, 0x01  // Class: IN
            )

            val serverAddr = InetAddress.getByName(server)
            val outPacket = DatagramPacket(testQuery, testQuery.size, serverAddr, 53)

            val startNano = System.nanoTime()
            socket.send(outPacket)

            val inBuffer = ByteArray(512)
            val inPacket = DatagramPacket(inBuffer, inBuffer.size)
            socket.receive(inPacket)
            val elapsedMs = (System.nanoTime() - startNano) / 1_000_000L

            if (elapsedMs < 1L) 1L else elapsedMs
        } catch (e: Exception) {
            -1L
        } finally {
            try { socket?.close() } catch (e: Exception) {}
        }
    }
}
