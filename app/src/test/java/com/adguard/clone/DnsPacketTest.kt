package com.fajostech.aegisguard

import com.fajostech.aegisguard.dns.DnsPacket
import com.fajostech.aegisguard.dns.DnsQuestion
import com.fajostech.aegisguard.filter.BlockingMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream

class DnsPacketTest {

    @Test
    fun testParseDnsQueryAndSynthesizeBlockedResponse() {
        // Construct a DNS query for "doubleclick.net" (type A)
        val baos = ByteArrayOutputStream()
        val dos = DataOutputStream(baos)

        val txId = 0x1234
        val flags = 0x0100 // Standard query, recursion desired
        dos.writeShort(txId)
        dos.writeShort(flags)
        dos.writeShort(1) // 1 question
        dos.writeShort(0) // 0 answers
        dos.writeShort(0)
        dos.writeShort(0)

        // Write "doubleclick.net" -> 11 doubleclick 3 net 0
        val labels = listOf("doubleclick", "net")
        for (l in labels) {
            dos.writeByte(l.length)
            dos.write(l.toByteArray(Charsets.US_ASCII))
        }
        dos.writeByte(0) // End of name

        dos.writeShort(DnsQuestion.TYPE_A)
        dos.writeShort(DnsQuestion.CLASS_IN)

        val queryBytes = baos.toByteArray()

        // Parse query
        val parsed = DnsPacket.parse(queryBytes)
        assertNotNull(parsed)
        assertEquals(txId, parsed!!.transactionId)
        assertEquals(1, parsed.questions.size)
        assertEquals("doubleclick.net", parsed.questions[0].name)
        assertEquals(DnsQuestion.TYPE_A, parsed.questions[0].type)

        // Synthesize blocked response (ADDRESS mode -> 0.0.0.0)
        val responseBytes = DnsPacket.createBlockedResponse(parsed, BlockingMode.ADDRESS, 3600L)
        assertNotNull(responseBytes)
        assertTrue(responseBytes.size > queryBytes.size)

        // Verify response header
        val respParsed = DnsPacket.parse(responseBytes)
        assertNotNull(respParsed)
        assertEquals(txId, respParsed!!.transactionId)
        assertTrue(respParsed.isResponse)
        assertEquals(0, respParsed.rcode) // NoError with 0.0.0.0
    }

    @Test
    fun testSynthesizeNxdomainResponse() {
        val baos = ByteArrayOutputStream()
        val dos = DataOutputStream(baos)
        dos.writeShort(0xABCD)
        dos.writeShort(0x0100)
        dos.writeShort(1)
        dos.writeShort(0)
        dos.writeShort(0)
        dos.writeShort(0)

        val labels = listOf("malicious-ad", "com")
        for (l in labels) {
            dos.writeByte(l.length)
            dos.write(l.toByteArray(Charsets.US_ASCII))
        }
        dos.writeByte(0)
        dos.writeShort(DnsQuestion.TYPE_A)
        dos.writeShort(DnsQuestion.CLASS_IN)

        val query = DnsPacket.parse(baos.toByteArray())!!
        val nxdomainBytes = DnsPacket.createBlockedResponse(query, BlockingMode.NXDOMAIN)

        val resp = DnsPacket.parse(nxdomainBytes)!!
        assertEquals(0xABCD, resp.transactionId)
        assertTrue(resp.isResponse)
        assertEquals(DnsPacket.RCODE_NXDOMAIN, resp.rcode)
    }
}
