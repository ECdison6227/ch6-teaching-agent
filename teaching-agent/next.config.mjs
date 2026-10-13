/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 允许服务端读取本地内容文件（知识库/题库）
    serverActions: { bodySizeLimit: "10mb" },
  },
  async redirects() {
    return [{ source: "/study", destination: "/", permanent: false }];
  },
};

export default nextConfig;
