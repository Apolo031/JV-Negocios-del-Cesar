/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse usa pdfjs-dist internamente. Si Next lo empaqueta con webpack
  // en vez de dejarlo como un require() normal de Node, termina resolviendo
  // la build pensada para navegador (que necesita DOMMatrix, que no existe
  // en el runtime serverless de Vercel) en vez de la build para Node — por
  // eso se marca como paquete externo. (Next 14 usa esta clave bajo
  // "experimental"; en Next 15+ se llama "serverExternalPackages" sin más.)
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
  },
};

module.exports = nextConfig;
