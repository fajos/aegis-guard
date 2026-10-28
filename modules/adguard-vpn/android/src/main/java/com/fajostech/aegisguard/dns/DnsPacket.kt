package com.fajostech.aegisguard.dns

import com.fajostech.aegisguard.filter.BlockingMode
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.net.InetAddress
import java.nio.ByteBuffer

/**
 * DNS Wire-format parser and synthesizer (RFC 1035).
 */
data class DnsPacket(
    val transactionId: Int,
    val flags: Int,
    val questions: List<DnsQuestion>,
    val answers: List<DnsRecord> = emptyList(),
    val rawBytes: ByteArray
) {
    val isResponse: Boolean get() = (flags and 0x8000) != 0
    val opcode: Int get() = (flags shr 11) and 0x0F
    val rcode: Int get() = flags and 0x0F

    val firstQuestion: DnsQuestion? get() = questions.firstOrNull()

    companion object {
        const val RCODE_NOERROR = 0
        const val RCODE_FORMERR = 1
        const val RCODE_SERVFAIL = 2
        const val RCODE_NXDOMAIN = 3
        const val RCODE_NOTIMP = 4
        const val RCODE_REFUSED = 5

        fun parse(data: ByteArray): DnsPacket? {
            if (data.size < 12) return null

            val buffer = ByteBuffer.wrap(data)
            val txId = buffer.short.toInt() and 0xFFFF
            val flags = buffer.short.toInt() and 0xFFFF
            val qdCount = buffer.short.toInt() and 0xFFFF
            val anCount = buffer.short.toInt() and 0xFFFF
            val nsCount = buffer.short.toInt() and 0xFFFF
            val arCount = buffer.short.toInt() and 0xFFFF

            val questions = ArrayList<DnsQuestion>(qdCount)
            for (i in 0 until qdCount) {
                val qName = readDomainName(buffer, data) ?: return null
                if (buffer.remaining() < 4) return null
                val qType = buffer.short.toInt() and 0xFFFF
                val qClass = buffer.short.toInt() and 0xFFFF
                questions.add(DnsQuestion(qName, qType, qClass))
            }

            return DnsPacket(
                transactionId = txId,
                flags = flags,
                questions = questions,
                rawBytes = data
            )
        }

        private fun readDomainName(buffer: ByteBuffer, fullData: ByteArray): String? {
            val sb = StringBuilder()
            var jumped = false
            var originalPos = -1
            var hops = 0

            while (buffer.hasRemaining()) {
                val len = buffer.get().toInt() and 0xFF
                if (len == 0) {
                    break // End of name
                }

                if ((len and 0xC0) == 0xC0) {
                    // Compression pointer
                    if (!buffer.hasRemaining()) return null
                    val b2 = buffer.get().toInt() and 0xFF
                    val offset = ((len and 0x3F) shl 8) or b2
                    if (!jumped) {
                        originalPos = buffer.position()
                        jumped = true
                    }
                    if (offset >= fullData.size || hops++ > 20) return null // Loop protection
                    buffer.position(offset)
                    continue
                }

                if (buffer.remaining() < len) return null
                val labelBytes = ByteArray(len)
                buffer.get(labelBytes)
                if (sb.isNotEmpty()) sb.append('.')
                sb.append(String(labelBytes, Charsets.US_ASCII))
            }

            if (jumped && originalPos != -1) {
                buffer.position(originalPos)
            }

            return sb.toString()
        }

        /**
         * Synthesizes an ad-blocked or rewritten DNS response.
         */
        fun createBlockedResponse(
            request: DnsPacket,
            blockingMode: BlockingMode = BlockingMode.ADDRESS,
            ttl: Long = 3600L,
            rewriteIp: String? = null,
            rewriteCname: String? = null
        ): ByteArray {
            val baos = ByteArrayOutputStream()
            val dos = DataOutputStream(baos)

            val question = request.firstQuestion

            val reqRD = request.flags and 0x0100
            val opcode = (request.flags shr 11) and 0x0F

            val rcode = if (rewriteIp != null || rewriteCname != null) {
                RCODE_NOERROR
            } else {
                when (blockingMode) {
                    BlockingMode.NXDOMAIN -> RCODE_NXDOMAIN
                    BlockingMode.REFUSED -> RCODE_REFUSED
                    BlockingMode.ADDRESS -> RCODE_NOERROR
                }
            }

            val respFlags = 0x8000 or (opcode shl 11) or 0x0400 or reqRD or 0x0080 or rcode
            val answers = ArrayList<ByteArray>()

            if (question != null) {
                if (rewriteIp != null) {
                    val addrBytes = try {
                        InetAddress.getByName(rewriteIp).address
                    } catch (e: Exception) {
                        byteArrayOf(0, 0, 0, 0)
                    }
                    val type = if (addrBytes.size == 16) DnsQuestion.TYPE_AAAA else DnsQuestion.TYPE_A
                    val record = DnsRecord(
                        name = question.name,
                        type = type,
                        rclass = DnsQuestion.CLASS_IN,
                        ttl = ttl,
                        rdata = addrBytes
                    )
                    answers.add(record.toByteArray())
                } else if (rewriteCname != null) {
                    val cnameBytes = encodeDomainLabels(rewriteCname)
                    val record = DnsRecord(
                        name = question.name,
                        type = DnsQuestion.TYPE_CNAME,
                        rclass = DnsQuestion.CLASS_IN,
                        ttl = ttl,
                        rdata = cnameBytes
                    )
                    answers.add(record.toByteArray())
                } else if (blockingMode == BlockingMode.ADDRESS) {
                    if (question.type == DnsQuestion.TYPE_A) {
                        val record = DnsRecord(
                            name = question.name,
                            type = DnsQuestion.TYPE_A,
                            rclass = DnsQuestion.CLASS_IN,
                            ttl = ttl,
                            rdata = byteArrayOf(0, 0, 0, 0)
                        )
                        answers.add(record.toByteArray())
                    } else if (question.type == DnsQuestion.TYPE_AAAA) {
                        val record = DnsRecord(
                            name = question.name,
                            type = DnsQuestion.TYPE_AAAA,
                            rclass = DnsQuestion.CLASS_IN,
                            ttl = ttl,
                            rdata = ByteArray(16)
                        )
                        answers.add(record.toByteArray())
                    }
                }
            }

            // Write Header
            dos.writeShort(request.transactionId)
            dos.writeShort(respFlags)
            dos.writeShort(request.questions.size) // QDCOUNT
            dos.writeShort(answers.size)          // ANCOUNT
            dos.writeShort(0)                     // NSCOUNT
            dos.writeShort(0)                     // ARCOUNT

            // Write Question Section
            if (request.questions.isNotEmpty() && request.rawBytes.size > 12) {
                var qEnd = 12
                val buf = ByteBuffer.wrap(request.rawBytes)
                buf.position(12)
                for (q in request.questions) {
                    readDomainName(buf, request.rawBytes)
                    buf.position(buf.position() + 4)
                }
                qEnd = buf.position()
                dos.write(request.rawBytes, 12, qEnd - 12)
            }

            // Write Answer Section
            for (ans in answers) {
                dos.write(ans)
            }

            return baos.toByteArray()
        }

        private fun encodeDomainLabels(domain: String): ByteArray {
            val baos = ByteArrayOutputStream()
            val labels = domain.split('.')
            for (l in labels) {
                val b = l.toByteArray(Charsets.US_ASCII)
                baos.write(b.size)
                baos.write(b)
            }
            baos.write(0)
            return baos.toByteArray()
        }
    }
}
