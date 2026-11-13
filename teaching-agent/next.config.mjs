const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
if (basePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)) throw new Error("NEXT_PUBLIC_BASE_PATH 必须是 /teachdemo 这样的站内路径");

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  // Allow isolated verification builds while an existing dev server stays open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // 允许服务端读取本地内容文件（知识库/题库）
    serverActions: { bodySizeLimit: "10mb" },
  },
  async redirects() {
    // 旧地址（含 nginx 的 /rc-beam → /beam-lab）统一指到新路由
    return [
      { source: "/study", destination: "/slides", permanent: true },
      { source: "/beam-lab", destination: "/lab", permanent: true },
      { source: "/self-test", destination: "/practice", permanent: true },
      { source: "/linked-practice", destination: "/practice?tab=linked", permanent: true },
      { source: "/reinforcement-demo", destination: "/demo", permanent: true },
    ];
  },
};

export default nextConfig;
