import Foundation
import NetworkExtension

/**
 * iOS NetworkExtension Packet Tunnel Provider matching AdGuard iOS core architecture.
 *
 * Runs in a sandboxed Network Extension process managed by iOS kernel.
 * Intercepts all system DNS traffic via virtual TUN interface with IP 10.0.0.2 and virtual DNS 198.18.53.53.
 */
class PacketTunnelProvider: NEPacketTunnelProvider {

    private let virtualDnsIp = "198.18.53.53"
    private var isTunnelRunning = false
    private var blockedRules: Set<String> = []
    private var totalQueries = 0
    private var blockedQueries = 0

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        loadFilterRules()

        let networkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.0.0.1")

        // 1. Configure IPv4 virtual interface address & routes
        let ipv4Settings = NEIPv4Settings(addresses: ["10.0.0.2"], subnetMasks: ["255.255.255.255"])
        ipv4Settings.includedRoutes = [NEIPv4Route(destinationAddress: virtualDnsIp, subnetMask: "255.255.255.255")]
        networkSettings.ipv4Settings = ipv4Settings

        // 2. Intercept all device DNS queries by pointing system resolver to virtual DNS
        let dnsSettings = NEDNSSettings(servers: [virtualDnsIp])
        dnsSettings.matchDomains = [""] // Matches all domains
        networkSettings.dnsSettings = dnsSettings

        // 3. Set standard MTU
        networkSettings.mtu = 1500

        setTunnelNetworkSettings(networkSettings) { [weak self] error in
            if let error = error {
                completionHandler(error)
                return
            }

            self?.isTunnelRunning = true
            completionHandler(nil)
            self?.startPacketProcessingLoop()
        }
    }

    private func loadFilterRules() {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        let rawRules = userDefaults?.string(forKey: "user_rules") ?? "doubleclick.net\ngoogle-analytics.com\nadservice.google.com\napp-measurement.com"
        
        for line in rawRules.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty && !trimmed.hasPrefix("!") && !trimmed.hasPrefix("#") {
                let cleaned = trimmed
                    .replacingOccurrences(of: "||", with: "")
                    .replacingOccurrences(of: "^", with: "")
                blockedRules.insert(cleaned.lowercased())
            }
        }
    }

    private func startPacketProcessingLoop() {
        guard isTunnelRunning else { return }

        packetFlow.readPackets { [weak self] (packets, protocols) in
            guard let self = self, self.isTunnelRunning else { return }

            var responsePackets: [Data] = []
            var responseProtocols: [NSNumber] = []

            for (index, packetData) in packets.enumerated() {
                if let response = self.handleIpPacket(packetData) {
                    responsePackets.append(response)
                    responseProtocols.append(protocols[index])
                }
            }

            if !responsePackets.isEmpty {
                self.packetFlow.writePackets(responsePackets, withProtocols: responseProtocols)
            }

            // Continue listening for packets
            self.startPacketProcessingLoop()
        }
    }

    /**
     * Parses IPv4 + UDP packet header, extracts DNS query domain, evaluates against rules,
     * and produces a synthetic 0.0.0.0 / NXDOMAIN response if blocked.
     */
    private func handleIpPacket(_ data: Data) -> Data? {
        // Minimal IPv4 (20 bytes) + UDP (8 bytes) + DNS Header (12 bytes) = 40 bytes
        guard data.count >= 40 else { return nil }

        let versionAndIHL = data[0]
        guard (versionAndIHL >> 4) == 4 else { return nil } // IPv4 only
        let ihl = Int(versionAndIHL & 0x0F) * 4
        let protocolNum = data[9]
        guard protocolNum == 17 else { return nil } // UDP only

        let udpOffset = ihl
        guard data.count >= udpOffset + 8 else { return nil }

        let destPort = (UInt16(data[udpOffset + 2]) << 8) | UInt16(data[udpOffset + 3])
        guard destPort == 53 else { return nil } // DNS traffic only

        let dnsOffset = udpOffset + 8
        guard data.count > dnsOffset + 12 else { return nil }

        // Extract DNS Transaction ID and Questions Count
        let txId = data.subdata(in: dnsOffset..<(dnsOffset + 2))
        let qdCount = (UInt16(data[dnsOffset + 4]) << 8) | UInt16(data[dnsOffset + 5])
        guard qdCount > 0 else { return nil }

        // Parse Question QNAME (domain)
        var cursor = dnsOffset + 12
        var domainParts: [String] = []

        while cursor < data.count {
            let labelLen = Int(data[cursor])
            if labelLen == 0 {
                cursor += 1
                break
            }
            cursor += 1
            if cursor + labelLen > data.count { break }
            if let label = String(data: data.subdata(in: cursor..<(cursor + labelLen)), encoding: .utf8) {
                domainParts.append(label)
            }
            cursor += labelLen
        }

        let domain = domainParts.joined(separator: ".").lowercased()
        totalQueries += 1

        let isBlocked = blockedRules.contains { domain == $0 || domain.hasSuffix("." + $0) }

        if isBlocked {
            blockedQueries += 1
            saveStats()
            return buildSyntheticBlockedResponse(originalPacket: data, ihl: ihl, udpOffset: udpOffset, dnsOffset: dnsOffset, txId: txId, qnameEndOffset: cursor)
        }

        return nil
    }

    private func buildSyntheticBlockedResponse(
        originalPacket: Data,
        ihl: Int,
        udpOffset: Int,
        dnsOffset: Int,
        txId: Data,
        qnameEndOffset: Int
    ) -> Data {
        // Construct IPv4 Response with swapped Src/Dst IP and Ports
        var resp = Data()

        // 1. IP Header (20 bytes)
        var ipHeader = originalPacket.subdata(in: 0..<ihl)
        // Swap IP src and dst
        let srcIp = ipHeader.subdata(in: 12..<16)
        let dstIp = ipHeader.subdata(in: 16..<20)
        ipHeader.replaceSubrange(12..<16, with: dstIp)
        ipHeader.replaceSubrange(16..<20, with: srcIp)

        // 2. DNS Answer (Standard QR=1, AA=1, RCODE=0, 1 Answer returning 0.0.0.0)
        var dnsResp = Data()
        dnsResp.append(txId)
        dnsResp.append(contentsOf: [0x81, 0x80]) // Flags: QR=1, RD=1, RA=1
        dnsResp.append(contentsOf: [0x00, 0x01]) // QDCOUNT = 1
        dnsResp.append(contentsOf: [0x00, 0x01]) // ANCOUNT = 1
        dnsResp.append(contentsOf: [0x00, 0x00]) // NSCOUNT = 0
        dnsResp.append(contentsOf: [0x00, 0x00]) // ARCOUNT = 0

        // Question section copy
        let questionData = originalPacket.subdata(in: (dnsOffset + 12)..<(qnameEndOffset + 4))
        dnsResp.append(questionData)

        // Answer section (Pointer to domain at 0xC00C, TYPE A, CLASS IN, TTL 3600, RDLENGTH 4, RDATA 0.0.0.0)
        dnsResp.append(contentsOf: [0xC0, 0x0C]) // Compression pointer
        dnsResp.append(contentsOf: [0x00, 0x01]) // TYPE A
        dnsResp.append(contentsOf: [0x00, 0x01]) // CLASS IN
        dnsResp.append(contentsOf: [0x00, 0x00, 0x0E, 0x10]) // TTL 3600s
        dnsResp.append(contentsOf: [0x00, 0x04]) // RDLENGTH 4
        dnsResp.append(contentsOf: [0x00, 0x00, 0x00, 0x00]) // 0.0.0.0

        // 3. UDP Header (8 bytes)
        var udpHeader = Data()
        let srcPort = originalPacket.subdata(in: udpOffset..<(udpOffset + 2))
        let dstPort = originalPacket.subdata(in: (udpOffset + 2)..<(udpOffset + 4))
        udpHeader.append(dstPort) // Swap ports
        udpHeader.append(srcPort)
        let udpLen = UInt16(8 + dnsResp.count)
        udpHeader.append(contentsOf: [UInt8(udpLen >> 8), UInt8(udpLen & 0xFF)])
        udpHeader.append(contentsOf: [0x00, 0x00]) // Checksum 0 (optional in IPv4 UDP)

        // Update IP total length and checksum
        let totalIpLen = UInt16(ihl + 8 + dnsResp.count)
        ipHeader[2] = UInt8(totalIpLen >> 8)
        ipHeader[3] = UInt8(totalIpLen & 0xFF)
        ipHeader[10] = 0
        ipHeader[11] = 0

        // Compute 16-bit one's complement IP checksum
        var sum: UInt32 = 0
        for i in stride(from: 0, to: ipHeader.count, by: 2) {
            let word = (UInt32(ipHeader[i]) << 8) | UInt32(ipHeader[i + 1])
            sum += word
        }
        while (sum >> 16) != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16)
        }
        let checksum = ~UInt16(sum)
        ipHeader[10] = UInt8(checksum >> 8)
        ipHeader[11] = UInt8(checksum & 0xFF)

        resp.append(ipHeader)
        resp.append(udpHeader)
        resp.append(dnsResp)
        return resp
    }

    private func saveStats() {
        let userDefaults = UserDefaults(suiteName: "group.com.fajostech.aegisguard")
        userDefaults?.set(totalQueries, forKey: "stats_total")
        userDefaults?.set(blockedQueries, forKey: "stats_blocked")
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        isTunnelRunning = false
        saveStats()
        completionHandler()
    }
}
