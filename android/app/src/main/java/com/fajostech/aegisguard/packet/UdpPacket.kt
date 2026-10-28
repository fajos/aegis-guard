package com.fajostech.aegisguard.packet

import java.nio.ByteBuffer

/**
 * Representation of a UDP Datagram (RFC 768).
 */
data class UdpPacket(
    val sourcePort: Int,
    val destPort: Int,
    val length: Int,
    val checksum: Int,
    val payload: ByteArray
) {
    companion object {
        const val HEADER_SIZE = 8

        fun parse(data: ByteArray, offset: Int, length: Int): UdpPacket? {
            if (length < HEADER_SIZE) return null

            val buffer = ByteBuffer.wrap(data, offset, length)
            val srcPort = buffer.short.toInt() and 0xFFFF
            val dstPort = buffer.short.toInt() and 0xFFFF
            val udpLen = buffer.short.toInt() and 0xFFFF
            val csum = buffer.short.toInt() and 0xFFFF

            val payloadLength = length - HEADER_SIZE
            val payload = ByteArray(payloadLength)
            buffer.get(payload)

            return UdpPacket(
                sourcePort = srcPort,
                destPort = dstPort,
                length = udpLen,
                checksum = csum,
                payload = payload
            )
        }

        /**
         * Builds a complete raw UDP datagram byte array.
         */
        fun build(
            srcPort: Int,
            dstPort: Int,
            payload: ByteArray,
            srcIp: ByteArray? = null,
            dstIp: ByteArray? = null
        ): ByteArray {
            val totalLength = HEADER_SIZE + payload.size
            val packet = ByteArray(totalLength)
            val buffer = ByteBuffer.wrap(packet)

            buffer.putShort(srcPort.toShort())
            buffer.putShort(dstPort.toShort())
            buffer.putShort(totalLength.toShort())
            buffer.putShort(0.toShort()) // Placeholder for checksum
            buffer.put(payload)

            if (srcIp != null && dstIp != null) {
                val csum = Checksum.calculateUdpChecksum(srcIp, dstIp, packet, 0, totalLength)
                buffer.putShort(6, csum.toShort())
            }

            return packet
        }
    }
}
