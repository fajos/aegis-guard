package com.fajostech.aegisguard.packet

import java.net.InetAddress
import java.nio.ByteBuffer

/**
 * Representation of an IPv4 (RFC 791) or IPv6 (RFC 8200) packet.
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
    val isTcp: Boolean get() = protocol == PROTOCOL_TCP

    val sourceAddress: String get() = formatIp(sourceIp)
    val destAddress: String get() = formatIp(destIp)

    companion object {
        const val PROTOCOL_ICMP = 1
        const val PROTOCOL_TCP = 6
        const val PROTOCOL_UDP = 17

        const val MIN_IPV4_HEADER_SIZE = 20
        const val MIN_IPV6_HEADER_SIZE = 40

        fun parse(data: ByteArray, offset: Int = 0, length: Int = data.size): IpPacket? {
            if (length < 1) return null

            val firstByte = data[offset].toInt() and 0xFF
            val version = firstByte ushr 4

            return when (version) {
                4 -> parseV4(data, offset, length)
                6 -> parseV6(data, offset, length)
                else -> null
            }
        }

        private fun parseV4(data: ByteArray, offset: Int, length: Int): IpPacket? {
            if (length < MIN_IPV4_HEADER_SIZE) return null

            val buffer = ByteBuffer.wrap(data, offset, length)
            val verIhl = buffer.get().toInt() and 0xFF
            val ihl = (verIhl and 0x0F) * 4
            if (ihl < MIN_IPV4_HEADER_SIZE || length < ihl) return null

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

            val payloadLen = minOf(totalLen - ihl, length - ihl).coerceAtLeast(0)
            val payload = ByteArray(payloadLen)
            buffer.get(payload)

            return IpPacket(
                version = 4,
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

        private fun parseV6(data: ByteArray, offset: Int, length: Int): IpPacket? {
            if (length < MIN_IPV6_HEADER_SIZE) return null

            val vtf = ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
            val tc = (vtf ushr 4) and 0xFF
            val declaredPayloadLen = ((data[offset + 4].toInt() and 0xFF) shl 8) or (data[offset + 5].toInt() and 0xFF)
            var nextHeader = data[offset + 6].toInt() and 0xFF
            val hopLimit = data[offset + 7].toInt() and 0xFF

            val srcIp = ByteArray(16)
            val dstIp = ByteArray(16)
            System.arraycopy(data, offset + 8, srcIp, 0, 16)
            System.arraycopy(data, offset + 24, dstIp, 0, 16)

            val packetEnd = minOf(MIN_IPV6_HEADER_SIZE + declaredPayloadLen, length)
            if (packetEnd < MIN_IPV6_HEADER_SIZE) return null

            var headerCursor = MIN_IPV6_HEADER_SIZE
            while (nextHeader == 0 || nextHeader == 43 || nextHeader == 60) {
                if (headerCursor + 2 > packetEnd) return null
                val extNext = data[offset + headerCursor].toInt() and 0xFF
                val extLen = ((data[offset + headerCursor + 1].toInt() and 0xFF) + 1) * 8
                if (extLen <= 0 || headerCursor + extLen > packetEnd) return null
                nextHeader = extNext
                headerCursor += extLen
            }

            val payloadLen = (packetEnd - headerCursor).coerceAtLeast(0)
            val payload = ByteArray(payloadLen)
            System.arraycopy(data, offset + headerCursor, payload, 0, payloadLen)

            return IpPacket(
                version = 6,
                headerLength = headerCursor,
                tos = tc,
                totalLength = headerCursor + payloadLen,
                identification = 0,
                flags = 0,
                fragmentOffset = 0,
                ttl = hopLimit,
                protocol = nextHeader,
                checksum = 0,
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

        /**
         * Builds an IPv6 packet wrapping the given upper-layer payload.
         */
        fun buildV6(
            srcIp: ByteArray,
            dstIp: ByteArray,
            protocol: Int,
            payload: ByteArray,
            hopLimit: Int = 64
        ): ByteArray {
            val totalLength = MIN_IPV6_HEADER_SIZE + payload.size
            val packet = ByteArray(totalLength)
            val buffer = ByteBuffer.wrap(packet)

            buffer.putInt(6 shl 28) // Version 6, TC=0, Flow=0
            buffer.putShort(payload.size.toShort())
            buffer.put(protocol.toByte())
            buffer.put(hopLimit.toByte())
            buffer.put(srcIp)
            buffer.put(dstIp)
            buffer.put(payload)
            return packet
        }

        /**
         * Builds either an IPv4 or IPv6 packet based on address length.
         */
        fun buildAuto(
            srcIp: ByteArray,
            dstIp: ByteArray,
            protocol: Int,
            payload: ByteArray,
            ttl: Int = 64
        ): ByteArray = if (srcIp.size == 16 && dstIp.size == 16) {
            buildV6(srcIp, dstIp, protocol, payload, ttl)
        } else {
            build(srcIp, dstIp, protocol, payload, ttl = ttl)
        }

        private fun formatIp(ip: ByteArray): String {
            return try {
                InetAddress.getByAddress(ip).hostAddress ?: ""
            } catch (_: Exception) {
                if (ip.size == 4) {
                    "${ip[0].toInt() and 0xFF}.${ip[1].toInt() and 0xFF}.${ip[2].toInt() and 0xFF}.${ip[3].toInt() and 0xFF}"
                } else {
                    ""
                }
            }
        }
    }
}
