package com.fajostech.aegisguard.packet

import java.nio.ByteBuffer

/**
 * Standard 16-bit one's complement Internet checksum calculation (RFC 1071).
 */
object Checksum {

    fun calculateChecksum(data: ByteArray, offset: Int, length: Int): Int {
        var sum = 0
        var i = offset
        val end = offset + length

        while (i < end - 1) {
            val byte1 = data[i].toInt() and 0xFF
            val byte2 = data[i + 1].toInt() and 0xFF
            val word = (byte1 shl 8) or byte2
            sum += word
            i += 2
        }

        if (i < end) {
            val byte1 = data[i].toInt() and 0xFF
            val word = byte1 shl 8
            sum += word
        }

        while ((sum shr 16) > 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }

        return (sum.inv()) and 0xFFFF
    }

    /**
     * Calculates the UDP checksum with IPv4/IPv6 pseudo-header (RFC 768 / RFC 8200).
     */
    fun calculateUdpChecksum(
        srcIp: ByteArray,
        dstIp: ByteArray,
        udpPacket: ByteArray,
        udpOffset: Int,
        udpLength: Int
    ): Int = calculateTransportChecksum(
        srcIp = srcIp,
        dstIp = dstIp,
        protocol = 17,
        segment = udpPacket,
        offset = udpOffset,
        length = udpLength,
        forceNonZero = true
    )

    /**
     * Calculates a TCP (protocol 6) or UDP (protocol 17) transport checksum
     * over either an IPv4 (4-byte) or IPv6 (16-byte) pseudo-header.
     */
    fun calculateTransportChecksum(
        srcIp: ByteArray,
        dstIp: ByteArray,
        protocol: Int,
        segment: ByteArray,
        offset: Int,
        length: Int,
        forceNonZero: Boolean = (protocol == 17)
    ): Int {
        var sum = 0

        for (i in 0 until srcIp.size step 2) {
            val word = ((srcIp[i].toInt() and 0xFF) shl 8) or (srcIp[i + 1].toInt() and 0xFF)
            sum += word
        }

        for (i in 0 until dstIp.size step 2) {
            val word = ((dstIp[i].toInt() and 0xFF) shl 8) or (dstIp[i + 1].toInt() and 0xFF)
            sum += word
        }

        if (srcIp.size == 16) {
            // IPv6 pseudo-header uses 32-bit upper-layer packet length + Next Header
            sum += (length ushr 16) and 0xFFFF
            sum += length and 0xFFFF
            sum += protocol and 0xFF
        } else {
            // IPv4 pseudo-header uses Protocol + 16-bit length
            sum += protocol and 0xFF
            sum += length and 0xFFFF
        }

        var i = offset
        val end = offset + length
        while (i < end - 1) {
            val word = ((segment[i].toInt() and 0xFF) shl 8) or (segment[i + 1].toInt() and 0xFF)
            sum += word
            i += 2
        }

        if (i < end) {
            val word = (segment[i].toInt() and 0xFF) shl 8
            sum += word
        }

        while ((sum shr 16) > 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }

        val res = (sum.inv()) and 0xFFFF
        return if (forceNonZero && res == 0) 0xFFFF else res
    }
}
