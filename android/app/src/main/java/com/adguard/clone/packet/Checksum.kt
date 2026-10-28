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
     * Calculates the UDP checksum with IPv4 pseudo-header (RFC 768).
     */
    fun calculateUdpChecksum(
        srcIp: ByteArray,
        dstIp: ByteArray,
        udpPacket: ByteArray,
        udpOffset: Int,
        udpLength: Int
    ): Int {
        var sum = 0

        // Pseudo-header:
        // Source IP (4 bytes)
        for (i in 0 until 4 step 2) {
            val word = ((srcIp[i].toInt() and 0xFF) shl 8) or (srcIp[i + 1].toInt() and 0xFF)
            sum += word
        }

        // Destination IP (4 bytes)
        for (i in 0 until 4 step 2) {
            val word = ((dstIp[i].toInt() and 0xFF) shl 8) or (dstIp[i + 1].toInt() and 0xFF)
            sum += word
        }

        // Zero (1 byte) + Protocol (1 byte, 17 for UDP)
        sum += 17

        // UDP Length (2 bytes)
        sum += udpLength

        // UDP Header + Data
        var i = udpOffset
        val end = udpOffset + udpLength
        while (i < end - 1) {
            val word = ((udpPacket[i].toInt() and 0xFF) shl 8) or (udpPacket[i + 1].toInt() and 0xFF)
            sum += word
            i += 2
        }

        if (i < end) {
            val word = (udpPacket[i].toInt() and 0xFF) shl 8
            sum += word
        }

        while ((sum shr 16) > 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }

        val res = (sum.inv()) and 0xFFFF
        return if (res == 0) 0xFFFF else res
    }
}
