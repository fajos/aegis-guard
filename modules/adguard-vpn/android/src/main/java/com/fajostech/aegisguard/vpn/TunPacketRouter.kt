package com.fajostech.aegisguard.vpn

import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import com.fajostech.aegisguard.dns.DnsPacket
import com.fajostech.aegisguard.dns.ParallelDnsResolver
import com.fajostech.aegisguard.filter.DnsFilterEngine
import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.log.QueryLogEntry
import com.fajostech.aegisguard.packet.IpPacket
import com.fajostech.aegisguard.packet.UdpPacket
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * High-performance TUN interface packet processor, equivalent to AdGuard's
 * native DnsTunListener and NativeTcpIpStackImpl.
 */
class TunPacketRouter(
    private val pfd: ParcelFileDescriptor,
    private val filterEngine: DnsFilterEngine,
    private val config: VpnConfiguration,
    private val vpnService: VpnService
) : Runnable {

    companion object {
        private const val TAG = "TunPacketRouter"
        private const val DNS_PORT = 53
    }

    private val isRunning = AtomicBoolean(false)
    private val parallelResolver = ParallelDnsResolver(
        upstreamServers = config.upstreamDnsServers,
        vpnService = vpnService
    )

    private val workerPool: ExecutorService = Executors.newCachedThreadPool()

    override fun run() {
        isRunning.set(true)
        Log.i(TAG, "TUN packet router thread started")

        val inputStream = FileInputStream(pfd.fileDescriptor)
        val outputStream = FileOutputStream(pfd.fileDescriptor)
        val buffer = ByteArray(config.mtu)

        while (isRunning.get()) {
            try {
                val length = inputStream.read(buffer)
                if (length <= 0) continue

                handlePacket(buffer, length, outputStream)
            } catch (e: IOException) {
                if (!isRunning.get()) break
                Log.e(TAG, "Error reading from TUN interface", e)
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected packet processing error", e)
            }
        }

        Log.i(TAG, "TUN packet router thread terminated")
    }

    private fun handlePacket(data: ByteArray, length: Int, outputStream: FileOutputStream) {
        val ipPacket = IpPacket.parse(data, 0, length) ?: return

        // Filter only UDP packets
        if (!ipPacket.isUdp) return

        val udpPacket = UdpPacket.parse(ipPacket.payload, 0, ipPacket.payload.size) ?: return

        // Check if destination is DNS port (port 53)
        if (udpPacket.destPort != DNS_PORT) return

        val dnsPayload = udpPacket.payload
        val clientSrcPort = udpPacket.sourcePort
        val clientDstPort = udpPacket.destPort
        val clientSrcIp = ipPacket.sourceIp
        val clientDstIp = ipPacket.destIp

        workerPool.execute {
            processDnsQuery(
                dnsPayload = dnsPayload,
                clientSrcPort = clientSrcPort,
                clientDstPort = clientDstPort,
                clientSrcIp = clientSrcIp,
                clientDstIp = clientDstIp,
                outputStream = outputStream
            )
        }
    }

    private fun processDnsQuery(
        dnsPayload: ByteArray,
        clientSrcPort: Int,
        clientDstPort: Int,
        clientSrcIp: ByteArray,
        clientDstIp: ByteArray,
        outputStream: FileOutputStream
    ) {
        val dnsPacket = DnsPacket.parse(dnsPayload) ?: return
        val question = dnsPacket.firstQuestion ?: return
        val domain = question.name
        val startTime = System.currentTimeMillis()

        // Evaluate domain against AdGuard filtering rules
        val eval = filterEngine.evaluate(domain, question.type)

        var dnsResponseBytes: ByteArray? = null
        var upstreamUsed: String? = null

        try {
            if (eval.isBlocked) {
                // Generate synthetic blocked answer or rewrite
                dnsResponseBytes = DnsPacket.createBlockedResponse(
                    request = dnsPacket,
                    blockingMode = eval.blockingMode,
                    ttl = eval.ttl,
                    rewriteIp = eval.rewriteIp,
                    rewriteCname = eval.rewriteCname
                )
                upstreamUsed = if (eval.isRewrite) "DNS Rewrite" else "Local Filter"
            } else {
                // Forward to real upstream DNS server via parallel protected sockets
                dnsResponseBytes = parallelResolver.resolve(dnsPayload, domain, question.type)
                upstreamUsed = if (dnsResponseBytes != null) {
                    config.upstreamDnsServers.firstOrNull() ?: "Upstream"
                } else {
                    "Upstream (Timeout)"
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error resolving DNS query for $domain", e)
            dnsResponseBytes = null
            upstreamUsed = "Error"
        }

        val duration = System.currentTimeMillis() - startTime

        // Guaranteed log entry
        FilteringLog.addEntry(
            QueryLogEntry(
                domain = domain,
                queryType = if (question.type == 28) "AAAA" else if (question.type == 65) "HTTPS" else "A",
                isBlocked = eval.isBlocked,
                matchedRule = eval.matchedRule,
                durationMs = duration,
                upstream = upstreamUsed ?: "Unknown"
            )
        )

        if (dnsResponseBytes != null) {
            sendResponseToTun(
                dnsResponsePayload = dnsResponseBytes,
                clientSrcPort = clientSrcPort,
                clientDstPort = clientDstPort,
                clientSrcIp = clientSrcIp,
                clientDstIp = clientDstIp,
                outputStream = outputStream
            )
        }
    }

    private fun sendResponseToTun(
        dnsResponsePayload: ByteArray,
        clientSrcPort: Int,
        clientDstPort: Int,
        clientSrcIp: ByteArray,
        clientDstIp: ByteArray,
        outputStream: FileOutputStream
    ) {
        val replySrcIp = clientDstIp
        val replyDstIp = clientSrcIp
        val replySrcPort = clientDstPort
        val replyDstPort = clientSrcPort

        val udpReply = UdpPacket.build(
            srcPort = replySrcPort,
            dstPort = replyDstPort,
            payload = dnsResponsePayload,
            srcIp = replySrcIp,
            dstIp = replyDstIp
        )

        val ipReply = IpPacket.build(
            srcIp = replySrcIp,
            dstIp = replyDstIp,
            protocol = IpPacket.PROTOCOL_UDP,
            payload = udpReply
        )

        synchronized(outputStream) {
            try {
                outputStream.write(ipReply)
                outputStream.flush()
            } catch (e: IOException) {
                Log.e(TAG, "Error writing reply packet to TUN", e)
            }
        }
    }

    fun stop() {
        isRunning.set(false)
        workerPool.shutdownNow()
    }
}
