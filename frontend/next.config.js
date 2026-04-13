/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config, { dev, isServer }) => {
    // Handle PixiJS and other canvas libraries
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      dns: false,
      'pg-hstore': false,
      'pg-native': false,
    };

    // Enable polling for hot reloading in Docker on Windows
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: /node_modules/,
      };
    }

    return config;
  },
  transpilePackages: ['@coffee-canvas/shared'],
};

module.exports = nextConfig;
