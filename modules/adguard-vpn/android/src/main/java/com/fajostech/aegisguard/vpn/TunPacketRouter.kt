package com.fajostech.aegisguard.vpn

import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import com.fajostech.aegisguard.dns.DnsPacket
import com.fajostech.aegisguard.dns.ParallelDnsResolver
import com.fajostech.aegisguard.filter.BlockingMode
import com.fajostech.aegisguard.filter.DnsFilterEngine
import com.fajostech.aegisguard.log.FilteringLog
import com.fajostech.aegisguard.log.QueryLogEntry
import com.fajostech.aegisguard.packet.Checksum
import com.fajostech.aegisguard.packet.IpPacket
import com.fajostech.aegisguard.packet.UdpPacket
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
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

        if (ipPacket.isTcp) {
            sendTcpResetForBlockedConnection(ipPacket, outputStream)
            return
        }

        // Filter only UDP packets from here on
        if (!ipPacket.isUdp) return

        val udpPacket = UdpPacket.parse(ipPacket.payload, 0, ipPacket.payload.size) ?: return

        // Check if destination is DNS port (port 53); non-53 UDP (e.g. QUIC/443 to DoH resolvers) is dropped immediately
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

    /**
     * Immediately responds with TCP RST (or RST+ACK for incoming SYN) when a client attempts
     * to open a bypassed encrypted DNS (DoH :443, DoT :853) or blocked AS13414 TCP socket
     * routed into the TUN, preventing 5-10s handshake stalls and forcing immediate DNS fallback.
     */
    private fun sendTcpResetForBlockedConnection(ipPacket: IpPacket, outputStream: FileOutputStream) {
        val tcp = ipPacket.payload
        if (tcp.size < 20) return

        val tcpHeaderLen = ((tcp[12].toInt() and 0xF0) ushr 4) * 4
        if (tcpHeaderLen < 20 || tcp.size < tcpHeaderLen) return

        val flags = tcp[13].toInt() and 0xFF
        // Never reply to an incoming RST to prevent RST loops
        if ((flags and 0x04) != 0) return

        val clientSrcPort = ((tcp[0].toInt() and 0xFF) shl 8) or (tcp[1].toInt() and 0xFF)
        val clientDstPort = ((tcp[2].toInt() and 0xFF) shl 8) or (tcp[3].toInt() and 0xFF)

        val seqNum =
            ((tcp[4].toLong() and 0xFFL) shl 24) or
                ((tcp[5].toLong() and 0xFFL) shl 16) or
                ((tcp[6].toLong() and 0xFFL) shl 8) or
                (tcp[7].toLong() and 0xFFL)
        val ackNum =
            ((tcp[8].toLong() and 0xFFL) shl 24) or
                ((tcp[9].toLong() and 0xFFL) shl 16) or
                ((tcp[10].toLong() and 0xFFL) shl 8) or
                (tcp[11].toLong() and 0xFFL)

        val hasAck = (flags and 0x10) != 0
        val hasSyn = (flags and 0x02) != 0
        val hasFin = (flags and 0x01) != 0
        val segDataLen = (tcp.size - tcpHeaderLen).toLong()

        val replyFlags: Int
        val replySeq: Long
        val replyAck: Long
        if (hasAck && !hasSyn) {
            replyFlags = 0x04 // RST
            replySeq = ackNum
            replyAck = 0L
        } else {
            replyFlags = 0x14 // RST | ACK
            replySeq = if (hasAck) ackNum else 0L
            replyAck = (seqNum + segDataLen + (if (hasSyn) 1L else 0L) + (if (hasFin) 1L else 0L)) and 0xFFFFFFFFL
        }

        val replySrcIp = ipPacket.destIp
        val replyDstIp = ipPacket.sourceIp

        val tcpReply = ByteArray(20)
        val buf = ByteBuffer.wrap(tcpReply)
        buf.putShort(clientDstPort.toShort())
        buf.putShort(clientSrcPort.toShort())
        buf.putInt(replySeq.toInt())
        buf.putInt(replyAck.toInt())
        buf.put(0x50.toByte()) // Data offset = 5 (20 bytes)
        buf.put(replyFlags.toByte())
        buf.putShort(0.toShort()) // Window size = 0
        buf.putShort(0.toShort()) // Placeholder checksum
        buf.putShort(0.toShort()) // Urgent pointer

        val csum = Checksum.calculateTransportChecksum(
            srcIp = replySrcIp,
            dstIp = replyDstIp,
            protocol = IpPacket.PROTOCOL_TCP,
            segment = tcpReply,
            offset = 0,
            length = tcpReply.size,
            forceNonZero = false
        )
        buf.putShort(16, csum.toShort())

        val ipReply = IpPacket.buildAuto(
            srcIp = replySrcIp,
            dstIp = replyDstIp,
            protocol = IpPacket.PROTOCOL_TCP,
            payload = tcpReply
        )

        synchronized(outputStream) {
            try {
                outputStream.write(ipReply)
                outputStream.flush()
            } catch (e: IOException) {
                Log.e(TAG, "Error writing TCP RST to TUN", e)
            }
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
        if (eval.isBlocked && eval.isThreatAlert && vpnService is LocalVpnService) {
            vpnService.notifyThreatBlocked(domain, eval.matchedRule ?: "Phishing Shield")
        }

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
                if (dnsResponseBytes != null) {
                    upstreamUsed = config.upstreamDnsServers.firstOrNull() ?: "Upstream"
                } else {
                    // Upstream timed out: synthesize quick fallback response instead of leaving client in silence
                    dnsResponseBytes = DnsPacket.createBlockedResponse(
                        request = dnsPacket,
                        blockingMode = BlockingMode.REFUSED,
                        ttl = 5L
                    )
                    upstreamUsed = "Upstream (Timeout)"
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error resolving DNS query for $domain", e)
            dnsResponseBytes = try {
                DnsPacket.createBlockedResponse(
                    request = dnsPacket,
                    blockingMode = BlockingMode.REFUSED,
                    ttl = 5L
                )
            } catch (ex: Exception) {
                null
            }
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

        val ipReply = IpPacket.buildAuto(
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
