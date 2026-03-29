import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Snapshot',
    short_name: 'Snapshot',
    description: 'Photo-powered English learning',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f1e8',
    theme_color: '#95c755',
    icons: [
      {
        src: '/icon?size=512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
