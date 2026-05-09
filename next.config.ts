import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev access from LAN devices and ngrok tunnels.
  // Add any other hosts you use here (LAN IPs or full hostnames).
  allowedDevOrigins: [
    "192.168.1.5",
    "8be7-136-226-251-16.ngrok-free.app",
  ],
};

export default nextConfig;
