package com.fajostech.aegisguard.proxy

import android.content.Context
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.cert.X509v3CertificateBuilder
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.io.File
import java.io.FileOutputStream
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.Date

/**
 * Manages local Root Certificate Authority generation for HTTPS filtering,
 * matching AdGuard's HttpsCaInstallationActivity.
 */
class CertificateManager(private val context: Context) {

    private val caFile = File(context.filesDir, "adguard_ca.crt")
    private val keyFile = File(context.filesDir, "adguard_ca.key")

    fun getOrGenerateCaCertificate(): X509Certificate {
        val keyPairGen = KeyPairGenerator.getInstance("RSA")
        keyPairGen.initialize(2048)
        val keyPair = keyPairGen.generateKeyPair()

        val issuer = X500Name("CN=AdGuard Personal Root CA, O=AdGuard Software Ltd, C=CY")
        val serial = BigInteger.valueOf(System.currentTimeMillis())
        val notBefore = Date(System.currentTimeMillis() - 24 * 60 * 60 * 1000L)
        val notAfter = Date(System.currentTimeMillis() + 10L * 365 * 24 * 60 * 60 * 1000L) // 10 years

        val certBuilder: X509v3CertificateBuilder = JcaX509v3CertificateBuilder(
            issuer,
            serial,
            notBefore,
            notAfter,
            issuer,
            keyPair.public
        )

        val signer = JcaContentSignerBuilder("SHA256withRSA").build(keyPair.private)
        val cert = JcaX509CertificateConverter().getCertificate(certBuilder.build(signer))

        // Save certificate to app storage for export
        FileOutputStream(caFile).use { it.write(cert.encoded) }

        return cert
    }

    fun getCaCertificateFile(): File = caFile
}
