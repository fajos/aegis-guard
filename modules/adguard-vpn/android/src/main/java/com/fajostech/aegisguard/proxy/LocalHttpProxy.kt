package com.fajostech.aegisguard.proxy

import android.util.Log
import com.fajostech.aegisguard.filter.DnsFilterEngine
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Local HTTP & HTTPS Proxy server, mirroring AdGuard's Local Proxy architecture.
 */
class LocalHttpProxy(
    val port: Int = 8080,
    private val filterEngine: DnsFilterEngine
) : Runnable {

    companion object {
        private const val TAG = "LocalHttpProxy"
    }

    private val isRunning = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private val threadPool = Executors.newCachedThreadPool()

    fun start() {
        if (isRunning.compareAndSet(false, true)) {
            Thread(this, "LocalHttpProxyThread").start()
        }
    }

    fun stop() {
        isRunning.set(false)
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            // ignore
        }
        threadPool.shutdownNow()
    }

    override fun run() {
        try {
            val server = ServerSocket(port)
            serverSocket = server
            Log.i(TAG, "Local HTTP Proxy listening on 127.0.0.1:$port")

            while (isRunning.get()) {
                val clientSocket = server.accept()
                threadPool.execute { handleClient(clientSocket) }
            }
        } catch (e: Exception) {
            if (isRunning.get()) {
                Log.e(TAG, "Local proxy error", e)
            }
        }
    }

    private fun handleClient(client: Socket) {
        try {
            val reader = BufferedReader(InputStreamReader(client.getInputStream()))
            val firstLine = reader.readLine() ?: return
            val parts = firstLine.split(" ")
            if (parts.size < 2) return

            val method = parts[0].uppercase()
            val target = parts[1]

            val host = if (method == "CONNECT") {
                target.split(":")[0]
            } else {
                extractHost(reader) ?: target.split("/")[0]
            }

            // Evaluate host against AdGuard rules
            val eval = filterEngine.evaluate(host)
            if (eval.isBlocked) {
                Log.i(TAG, "Proxy blocked request: $host (Rule: ${eval.matchedRule})")
                val response = "HTTP/1.1 403 Forbidden\r\n" +
                        "Content-Type: text/html\r\n" +
                        "Connection: close\r\n\r\n" +
                        "<html><body><h1>AdGuard: Blocked by Rule</h1><p>Domain: $host</p></body></html>"
                client.getOutputStream().write(response.toByteArray())
                client.getOutputStream().flush()
                client.close()
                return
            }

            // If CONNECT method (HTTPS tunneling)
            if (method == "CONNECT") {
                val hostPort = target.split(":")
                val remoteHost = hostPort[0]
                val remotePort = if (hostPort.size > 1) hostPort[1].toInt() else 443

                val remoteSocket = Socket(remoteHost, remotePort)
                client.getOutputStream().write("HTTP/1.1 200 Connection Established\r\n\r\n".toByteArray())
                client.getOutputStream().flush()

                // Tunnel streams bidirectionally
                pipeStreams(client, remoteSocket)
            } else {
                client.close()
            }
        } catch (e: Exception) {
            try { client.close() } catch (ignored: Exception) {}
        }
    }

    private fun extractHost(reader: BufferedReader): String? {
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            if (line!!.isEmpty()) break
            if (line!!.startsWith("Host:", ignoreCase = true)) {
                return line!!.substring(5).trim().split(":")[0]
            }
        }
        return null
    }

    private fun pipeStreams(client: Socket, remote: Socket) {
        val t1 = Thread {
            try {
                client.getInputStream().copyTo(remote.getOutputStream())
            } catch (e: Exception) {}
            finally {
                try { remote.close() } catch (e: Exception) {}
            }
        }
        val t2 = Thread {
            try {
                remote.getInputStream().copyTo(client.getOutputStream())
            } catch (e: Exception) {}
            finally {
                try { client.close() } catch (e: Exception) {}
            }
        }
        t1.start()
        t2.start()
    }
}
