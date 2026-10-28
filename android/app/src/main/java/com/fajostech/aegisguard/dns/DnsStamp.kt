package com.fajostech.aegisguard.dns

import android.util.Base64
import java.nio.ByteBuffer

/**
 * DNS Stamp Parser matching AdGuard's official sdns:// specification (RFC DNS Stamps).
 * Models com.adguard.dnslibs.proxy.DnsStamp.
 */
data class DnsStamp(
    val protocol: StampProtocol,
    val serverAddress: String,
    val providerName: String,
    val path: String? = null,
    val publicKeyHashes: List<ByteArray> = emptyList()
) {
    enum class StampProtocol(val id: Byte) {
        PLAIN(0x00),
        DNSCRYPT(0x01),
        DOH(0x02),
        DOT(0x03),
        DOQ(0x04)
    }

    companion object {
        fun parse(stampStr: String): DnsStamp? {
            val trimmed = stampStr.trim()
            if (!trimmed.startsWith("sdns://")) return null

            val b64 = trimmed.substring(7)
            val decoded = try {
                Base64.decode(b64, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            } catch (e: Exception) {
                return null
            }

            if (decoded.isEmpty()) return null
            val buffer = ByteBuffer.wrap(decoded)

            val protoByte = buffer.get()
            val proto = StampProtocol.values().find { it.id == protoByte } ?: return null

            return when (proto) {
                StampProtocol.PLAIN -> parsePlain(buffer)
                StampProtocol.DOH -> parseDoh(buffer)
                StampProtocol.DOT -> parseDot(buffer)
                StampProtocol.DNSCRYPT -> parseDnsCrypt(buffer)
                StampProtocol.DOQ -> parseDoq(buffer)
            }
        }

        private fun parseDoh(buffer: ByteBuffer): DnsStamp? {
            if (buffer.remaining() < 8) return null
            val props = buffer.long // props (DNSSEC, NoLog, NoFilter)
            val addr = readLpString(buffer) ?: return null
            val hashes = readHashes(buffer)
            val hostName = readLpString(buffer) ?: return null
            val path = readLpString(buffer) ?: "/dns-query"

            return DnsStamp(
                protocol = StampProtocol.DOH,
                serverAddress = addr,
                providerName = hostName,
                path = path,
                publicKeyHashes = hashes
            )
        }

        private fun parseDot(buffer: ByteBuffer): DnsStamp? {
            if (buffer.remaining() < 8) return null
            buffer.long // props
            val addr = readLpString(buffer) ?: return null
            val hashes = readHashes(buffer)
            val hostName = readLpString(buffer) ?: return null

            return DnsStamp(
                protocol = StampProtocol.DOT,
                serverAddress = addr,
                providerName = hostName,
                publicKeyHashes = hashes
            )
        }

        private fun parseDoq(buffer: ByteBuffer): DnsStamp? {
            if (buffer.remaining() < 8) return null
            buffer.long // props
            val addr = readLpString(buffer) ?: return null
            val hashes = readHashes(buffer)
            val hostName = readLpString(buffer) ?: return null

            return DnsStamp(
                protocol = StampProtocol.DOQ,
                serverAddress = addr,
                providerName = hostName,
                publicKeyHashes = hashes
            )
        }

        private fun parsePlain(buffer: ByteBuffer): DnsStamp? {
            if (buffer.remaining() < 8) return null
            buffer.long // props
            val addr = readLpString(buffer) ?: return null
            return DnsStamp(
                protocol = StampProtocol.PLAIN,
                serverAddress = addr,
                providerName = addr
            )
        }

        private fun parseDnsCrypt(buffer: ByteBuffer): DnsStamp? {
            if (buffer.remaining() < 8) return null
            buffer.long // props
            val addr = readLpString(buffer) ?: return null
            if (buffer.remaining() < 32) return null
            val pk = ByteArray(32)
            buffer.get(pk)
            val providerName = readLpString(buffer) ?: return null

            return DnsStamp(
                protocol = StampProtocol.DNSCRYPT,
                serverAddress = addr,
                providerName = providerName,
                publicKeyHashes = listOf(pk)
            )
        }

        private fun readLpString(buffer: ByteBuffer): String? {
            if (!buffer.hasRemaining()) return null
            val len = buffer.get().toInt() and 0xFF
            if (buffer.remaining() < len) return null
            val bytes = ByteArray(len)
            buffer.get(bytes)
            return String(bytes, Charsets.UTF_8)
        }

        private fun readHashes(buffer: ByteBuffer): List<ByteArray> {
            val list = mutableListOf<ByteArray>()
            while (buffer.hasRemaining()) {
                val len = buffer.get().toInt() and 0xFF
                val isLast = (len and 0x80) == 0
                val actualLen = len and 0x7F
                if (buffer.remaining() < actualLen) break
                val hash = ByteArray(actualLen)
                buffer.get(hash)
                list.add(hash)
                if (isLast) break
            }
            return list
        }
    }
}
