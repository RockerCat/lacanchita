import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Las ilustraciones de torneo (hasta 5 MB) se suben mediante una Server Action; el límite por defecto es 1 MB.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
