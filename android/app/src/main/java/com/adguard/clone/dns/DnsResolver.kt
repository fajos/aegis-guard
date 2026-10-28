package com.fajostech.aegisguard.dns

import android.net.VpnService
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException

/**
 * Resolves allowed DNS queries via upstream UDP DNS servers.
 * Employs VpnService.protect() to prevent the socket from being routed back into the TUN interface.
 */
class DnsResolver(
    private val upstreamServers: List<String> = listOf("94.140.14.14", "1.1.1.1", "8.8.8.8"),
    private val vpnService: VpnService? = null,
    private val timeoutMs: Int = 3000
) {
    fun resolve(queryBytes: ByteArray): ByteArray? {
        for (server in upstreamServers) {
            try {
                val socket = DatagramSocket()
                vpnService?.protect(socket)
                socket.soTimeout = timeoutMs

                val serverAddr = InetAddress.getByName(server)
                val outPacket = DatagramPacket(queryBytes, queryBytes.size, serverAddr, 53)
                socket.send(outPacket)

                val inBuffer = ByteArray(2048)
                val inPacket = DatagramPacket(inBuffer, inBuffer.size)
                socket.receive(inPacket)

                socket.close()

                val result = ByteArray(inPacket.length)
                System.arraycopy(inBuffer, 0, result, 0, inPacket.length)
                return result
            } catch (e: SocketTimeoutException) {
                // Try next upstream
                continue
            } catch (e: Exception) {
                continue
            }
        }
        return null
    }
}
