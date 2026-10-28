package com.fajostech.aegisguard.dns

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream

data class DnsRecord(
    val name: String,
    val type: Int,
    val rclass: Int,
    val ttl: Long,
    val rdata: ByteArray
) {
    fun toByteArray(): ByteArray {
        val baos = ByteArrayOutputStream()
        val dos = DataOutputStream(baos)

        // Write name as pointer to question (0xC00C is standard question offset)
        dos.writeShort(0xC00C)
        dos.writeShort(type)
        dos.writeShort(rclass)
        dos.writeInt(ttl.toInt())
        dos.writeShort(rdata.size)
        dos.write(rdata)

        return baos.toByteArray()
    }
}
