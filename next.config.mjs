/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure the bundled font ships with the cover-generation serverless function
  // (it reads the .ttf from disk at runtime to render text as vector paths).
  outputFileTracingIncludes: {
    '/api/generate-cover': ['./assets/fonts/**'],
  },
};

export default nextConfig;
