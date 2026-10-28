package com.fajostech.aegisguard.packet

import java.net.InetAddress
import java.nio.ByteBuffer

/**
 * Representation of an IPv4 Packet (RFC 791).
 */
data class IpPacket(
    val version: Int,
    val headerLength: Int,
    val tos: Int,
    val totalLength: Int,
    val identification: Int,
    val flags: Int,
    val fragmentOffset: Int,
    val ttl: Int,
    val protocol: Int,
    val checksum: Int,
    val sourceIp: ByteArray,
    val destIp: ByteArray,
    val payload: ByteArray
) {
    val isUdp: Boolean get() = protocol == PROTOCOL_UDP

    val sourceAddress: String get() = formatIp(sourceIp)
    val destAddress: String get() = formatIp(destIp)

    companion object {
        const val PROTOCOL_ICMP = 1
        const val PROTOCOL_TCP = 6
        const val PROTOCOL_UDP = 17

        const val MIN_IPV4_HEADER_SIZE = 20

        fun parse(data: ByteArray, offset: Int = 0, length: Int = data.size): IpPacket? {
            if (length < MIN_IPV4_HEADER_SIZE) return null

            val buffer = ByteBuffer.wrap(data, offset, length)
            val verIhl = buffer.get().toInt() and 0xFF
            val version = verIhl shr 4
            if (version != 4) return null // Only IPv4 supported in this handler

            val ihl = (verIhl and 0x0F) * 4
            if (length < ihl) return null

            val tos = buffer.get().toInt() and 0xFF
            val totalLen = buffer.short.toInt() and 0xFFFF
            val id = buffer.short.toInt() and 0xFFFF
            val flagsFrag = buffer.short.toInt() and 0xFFFF
            val flags = flagsFrag shr 13
            val fragOffset = flagsFrag and 0x1FFF
            val ttl = buffer.get().toInt() and 0xFF
            val proto = buffer.get().toInt() and 0xFF
            val csum = buffer.short.toInt() and 0xFFFF

            val srcIp = ByteArray(4)
            buffer.get(srcIp)

            val dstIp = ByteArray(4)
            buffer.get(dstIp)

            // Skip options if IHL > 20
            if (ihl > MIN_IPV4_HEADER_SIZE) {
                buffer.position(buffer.position() + (ihl - MIN_IPV4_HEADER_SIZE))
            }

            val payloadLen = Math.min(totalLen - ihl, length - ihl)
            val payload = ByteArray(payloadLen)
            buffer.get(payload)

            return IpPacket(
                version = version,
                headerLength = ihl,
                tos = tos,
                totalLength = totalLen,
                identification = id,
                flags = flags,
                fragmentOffset = fragOffset,
                ttl = ttl,
                protocol = proto,
                checksum = csum,
                sourceIp = srcIp,
                destIp = dstIp,
                payload = payload
            )
        }

        /**
         * Builds an IPv4 packet wrapping the given payload.
         */
        fun build(
            srcIp: ByteArray,
            dstIp: ByteArray,
            protocol: Int,
            payload: ByteArray,
            identification: Int = 0,
            ttl: Int = 64
        ): ByteArray {
            val totalLength = MIN_IPV4_HEADER_SIZE + payload.size
            val packet = ByteArray(totalLength)
            val buffer = ByteBuffer.wrap(packet)

            val verIhl = (4 shl 4) or (MIN_IPV4_HEADER_SIZE / 4)
            buffer.put(verIhl.toByte())
            buffer.put(0.toByte()) // TOS
            buffer.putShort(totalLength.toShort())
            buffer.putShort(identification.toShort())
            buffer.putShort(0x4000.toShort()) // Flags: Don't Fragment (DF)
            buffer.put(ttl.toByte())
            buffer.put(protocol.toByte())
            buffer.putShort(0.toShort()) // Placeholder checksum
            buffer.put(srcIp)
            buffer.put(dstIp)

            // Calculate header checksum
            val csum = Checksum.calculateChecksum(packet, 0, MIN_IPV4_HEADER_SIZE)
            buffer.putShort(10, csum.toShort())

            // Append payload
            buffer.put(payload)
            return packet
        }

        private fun formatIp(ip: ByteArray): String {
            return "${ip[0].toInt() and 0xFF}.${ip[1].toInt() and 0xFF}.${ip[2].toInt() and 0xFF}.${ip[3].toInt() and 0xFF}"
        }
    }
}
