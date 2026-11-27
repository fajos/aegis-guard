package com.fajostech.aegisguard.vpn

import android.net.IpPrefix
import android.os.Build
import androidx.annotation.RequiresApi
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/**
 * Exact CIDR prefix subtraction utility for Android VPN routing.
 *
 * Used on Android 13+ (API 33+) together with `addRoute("0.0.0.0", 0)` /
 * `addRoute("::", 0)` and `builder.excludeRoute(IpPrefix)` so Android routes
 * every DNS server, DoH bypass IP, carrier DNS, and configured block range into
 * our TUN while allowing all normal app traffic to bypass the TUN directly on
 * the physical interface.
 */
object CidrExclude {

    data class Cidr4(val network: UInt, val prefixLen: Int) {
        private val mask: UInt get() = prefixMask4(prefixLen)
        val start: UInt get() = network and mask
        val end: UInt get() = start or mask.inv()

        fun toInetAddress(): InetAddress {
            val bytes = byteArrayOf(
                ((start shr 24) and 0xFFu).toByte(),
                ((start shr 16) and 0xFFu).toByte(),
                ((start shr 8) and 0xFFu).toByte(),
                (start and 0xFFu).toByte()
            )
            return InetAddress.getByAddress(bytes)
        }

        @RequiresApi(Build.VERSION_CODES.TIRAMISU)
        fun toIpPrefix(): IpPrefix = IpPrefix(toInetAddress(), prefixLen)
    }

    data class IpV6(val hi: ULong, val lo: ULong) : Comparable<IpV6> {
        override fun compareTo(other: IpV6): Int {
            if (hi != other.hi) return hi.compareTo(other.hi)
            return lo.compareTo(other.lo)
        }

        fun isMax(): Boolean = hi == ULong.MAX_VALUE && lo == ULong.MAX_VALUE

        fun addOne(): IpV6 = if (lo != ULong.MAX_VALUE) IpV6(hi, lo + 1uL) else IpV6(hi + 1uL, 0uL)

        fun subOne(): IpV6 = if (lo != 0uL) IpV6(hi, lo - 1uL) else IpV6(hi - 1uL, ULong.MAX_VALUE)

        companion object {
            val ZERO = IpV6(0uL, 0uL)
            val MAX = IpV6(ULong.MAX_VALUE, ULong.MAX_VALUE)
        }
    }

    data class Cidr6(val hi: ULong, val lo: ULong, val prefixLen: Int) {
        val start: IpV6
            get() {
                val (mHi, mLo) = prefixMask6(prefixLen)
                return IpV6(hi and mHi, lo and mLo)
            }

        val end: IpV6
            get() {
                val (mHi, mLo) = prefixMask6(prefixLen)
                val s = start
                return IpV6(s.hi or mHi.inv(), s.lo or mLo.inv())
            }

        fun toInetAddress(): InetAddress {
            val s = start
            val bytes = ByteArray(16)
            for (i in 0 until 8) {
                bytes[i] = ((s.hi shr ((7 - i) * 8)) and 0xFFuL).toByte()
                bytes[i + 8] = ((s.lo shr ((7 - i) * 8)) and 0xFFuL).toByte()
            }
            return InetAddress.getByAddress(bytes)
        }

        @RequiresApi(Build.VERSION_CODES.TIRAMISU)
        fun toIpPrefix(): IpPrefix = IpPrefix(toInetAddress(), prefixLen)
    }

    fun parseCidr4(cidr: String): Cidr4? {
        val parts = cidr.trim().split('/')
        val addrStr = parts[0]
        val prefixLen = if (parts.size > 1) parts[1].toIntOrNull() ?: return null else 32
        if (prefixLen !in 0..32) return null
        val addr = try { InetAddress.getByName(addrStr) } catch (_: Exception) { return null }
        if (addr !is Inet4Address) return null
        val b = addr.address
        val raw =
            ((b[0].toUInt() and 0xFFu) shl 24) or
                ((b[1].toUInt() and 0xFFu) shl 16) or
                ((b[2].toUInt() and 0xFFu) shl 8) or
                (b[3].toUInt() and 0xFFu)
        val mask = prefixMask4(prefixLen)
        return Cidr4(raw and mask, prefixLen)
    }

    fun parseCidr6(cidr: String): Cidr6? {
        val parts = cidr.trim().split('/')
        val addrStr = parts[0]
        val prefixLen = if (parts.size > 1) parts[1].toIntOrNull() ?: return null else 128
        if (prefixLen !in 0..128) return null
        val addr = try { InetAddress.getByName(addrStr) } catch (_: Exception) { return null }
        if (addr !is Inet6Address) return null
        val b = addr.address
        var hi = 0uL
        var lo = 0uL
        for (i in 0 until 8) {
            hi = (hi shl 8) or (b[i].toULong() and 0xFFuL)
            lo = (lo shl 8) or (b[i + 8].toULong() and 0xFFuL)
        }
        val (mHi, mLo) = prefixMask6(prefixLen)
        return Cidr6(hi and mHi, lo and mLo, prefixLen)
    }

    /**
     * Given IPv4 CIDRs that MUST enter the TUN (`captured`), returns the complement list
     * covering everything in 0.0.0.0/0 EXCEPT `captured` (passed to `builder.excludeRoute`).
     */
    fun complementIPv4(captured: List<Cidr4>): List<Cidr4> {
        if (captured.isEmpty()) return listOf(Cidr4(0u, 0))
        val intervals = captured.map { it.start to it.end }.sortedBy { it.first }
        val merged = mutableListOf<Pair<UInt, UInt>>()
        for (iv in intervals) {
            if (merged.isEmpty()) {
                merged.add(iv)
            } else {
                val last = merged.last()
                val adjacentOrOverlap = iv.first <= last.second ||
                    (last.second != 0xFFFF_FFFFu && iv.first == last.second + 1u)
                if (adjacentOrOverlap) {
                    merged[merged.lastIndex] = last.first to maxOf(last.second, iv.second)
                } else {
                    merged.add(iv)
                }
            }
        }

        val result = mutableListOf<Cidr4>()
        var cursor = 0u
        var exhausted = false
        for ((exStart, exEnd) in merged) {
            if (cursor < exStart) {
                emitRange4(cursor, exStart - 1u, result)
            }
            if (exEnd == 0xFFFF_FFFFu) {
                exhausted = true
                break
            }
            val next = exEnd + 1u
            if (next > cursor) cursor = next
        }
        if (!exhausted) {
            emitRange4(cursor, 0xFFFF_FFFFu, result)
        }
        return result
    }

    /**
     * Given IPv6 CIDRs that MUST enter the TUN (`captured`), returns the complement list
     * covering everything in ::/0 EXCEPT `captured` (passed to `builder.excludeRoute`).
     */
    fun complementIPv6(captured: List<Cidr6>): List<Cidr6> {
        if (captured.isEmpty()) return listOf(Cidr6(0uL, 0uL, 0))
        val intervals = captured.map { it.start to it.end }.sortedBy { it.first }
        val merged = mutableListOf<Pair<IpV6, IpV6>>()
        for (iv in intervals) {
            if (merged.isEmpty()) {
                merged.add(iv)
            } else {
                val last = merged.last()
                val adjacentOrOverlap = iv.first <= last.second ||
                    (!last.second.isMax() && iv.first == last.second.addOne())
                if (adjacentOrOverlap) {
                    merged[merged.lastIndex] = last.first to maxOf(last.second, iv.second)
                } else {
                    merged.add(iv)
                }
            }
        }

        val result = mutableListOf<Cidr6>()
        var cursor = IpV6.ZERO
        var exhausted = false
        for ((exStart, exEnd) in merged) {
            if (cursor < exStart) {
                emitRange6(cursor, exStart.subOne(), result)
            }
            if (exEnd.isMax()) {
                exhausted = true
                break
            }
            val next = exEnd.addOne()
            if (next > cursor) cursor = next
        }
        if (!exhausted) {
            emitRange6(cursor, IpV6.MAX, result)
        }
        return result
    }

    private fun prefixMask4(prefixLen: Int): UInt = when {
        prefixLen <= 0 -> 0u
        prefixLen >= 32 -> 0xFFFF_FFFFu
        else -> 0xFFFF_FFFFu shl (32 - prefixLen)
    }

    private fun prefixMask6(prefixLen: Int): Pair<ULong, ULong> = when {
        prefixLen <= 0 -> 0uL to 0uL
        prefixLen < 64 -> (ULong.MAX_VALUE shl (64 - prefixLen)) to 0uL
        prefixLen == 64 -> ULong.MAX_VALUE to 0uL
        prefixLen < 128 -> ULong.MAX_VALUE to (ULong.MAX_VALUE shl (128 - prefixLen))
        else -> ULong.MAX_VALUE to ULong.MAX_VALUE
    }

    private fun emitRange4(rangeStart: UInt, rangeEnd: UInt, out: MutableList<Cidr4>) {
        var cur = rangeStart
        while (cur <= rangeEnd) {
            val alignBits = if (cur == 0u) 32 else cur.countTrailingZeroBits()
            val remaining = (rangeEnd - cur).toULong() + 1uL
            val maxSizeBits = 63 - remaining.countLeadingZeroBits()
            val stepBits = minOf(alignBits, maxSizeBits)
            val prefixLen = 32 - stepBits
            out.add(Cidr4(cur, prefixLen))

            val blockLast = cur or prefixMask4(prefixLen).inv()
            if (blockLast >= rangeEnd || blockLast == 0xFFFF_FFFFu) break
            cur = blockLast + 1u
        }
    }

    private fun emitRange6(rangeStart: IpV6, rangeEnd: IpV6, out: MutableList<Cidr6>) {
        var cur = rangeStart
        while (cur <= rangeEnd) {
            val alignBits = when {
                cur.lo != 0uL -> cur.lo.countTrailingZeroBits()
                cur.hi != 0uL -> 64 + cur.hi.countTrailingZeroBits()
                else -> 128
            }

            val dLo = rangeEnd.lo - cur.lo
            val borrow = if (rangeEnd.lo < cur.lo) 1uL else 0uL
            val dHi = rangeEnd.hi - cur.hi - borrow
            val diff = IpV6(dHi, dLo)

            val maxSizeBits = if (diff.isMax()) {
                128
            } else {
                val count = diff.addOne()
                if (count.hi != 0uL) {
                    64 + (63 - count.hi.countLeadingZeroBits())
                } else {
                    63 - count.lo.countLeadingZeroBits()
                }
            }

            val stepBits = minOf(alignBits, maxSizeBits)
            val prefixLen = 128 - stepBits
            out.add(Cidr6(cur.hi, cur.lo, prefixLen))

            val (mHi, mLo) = prefixMask6(prefixLen)
            val blockLast = IpV6(cur.hi or mHi.inv(), cur.lo or mLo.inv())
            if (blockLast >= rangeEnd || blockLast.isMax()) break
            cur = blockLast.addOne()
        }
    }
}
