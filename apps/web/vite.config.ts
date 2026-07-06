import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { execSync } from 'node:child_process';

// MAJOR.MINOR à bumper manuellement lors d'une refonte majeure.
// BUILD = nombre de commits git → s'incrémente automatiquement à chaque commit.
const RELEASE = '1.3';

function formatDate(raw: string): string {
  // raw = "2026-05-29 14:30:22 +0200"
  const [datePart = '', timePart = ''] = raw.trim().split(' ');
  const [year = '', month = '1', day = '1'] = datePart.split('-');
  const hhmm = timePart.slice(0, 5); // "14:30"
  const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  const monthName = MONTHS[parseInt(month, 10) - 1];
  return `${parseInt(day, 10)} ${monthName} ${year} · ${hhmm}`;
}

function getGitVersion(env: Record<string, string>): { version: string; date: string } {
  // 1. Build-args injectés (Docker / CI) : prioritaires car `git` est absent
  //    de l'image alpine et `.git` est exclu du contexte (.dockerignore).
  const injectedBuild = env.VITE_APP_BUILD;
  if (injectedBuild) {
    const rawDate = env.VITE_APP_DATE;
    const now = new Date();
    return {
      version: `${RELEASE}.${injectedBuild}`,
      date: formatDate(rawDate || now.toISOString().replace('T', ' ').replace('Z', ' +0000')),
    };
  }

  // 2. git local (dev) : nombre de commits → build number.
  try {
    const opts = { encoding: 'utf8' as const, stdio: 'pipe' as const };
    const build = execSync('git rev-list --count HEAD', opts).trim();
    const rawDate = execSync('git log -1 --format=%ci', opts).trim();
    return { version: `${RELEASE}.${build}`, date: formatDate(rawDate) };
  } catch (e) {
    console.warn('[vite] git version detection failed:', e);
    const now = new Date();
    const fallbackDate = formatDate(now.toISOString().replace('T', ' ').replace('Z', ' +0000'));
    return { version: `${RELEASE}.?`, date: fallbackDate };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL ?? 'http://localhost:3000';
  const { version, date } = getGitVersion(env);

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
      'import.meta.env.VITE_APP_DATE': JSON.stringify(date),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png', 'manifest.webmanifest'],
        // On utilise le manifest.webmanifest custom dans /public — pas celui généré.
        manifest: false,
        devOptions: {
          enabled: false, // SW désactivé en dev pour éviter les caches collants
          type: 'module',
        },
        workbox: {
          // PAS de `png` ici : les portraits Smash/SF + décors pèsent >30 Mo et
          // étaient précachés d'office pour TOUS les visiteurs (34 Mo au premier
          // chargement). Les images passent en cache runtime (règle ci-dessous) :
          // téléchargées à la demande, cachées ensuite. Les petites icônes du
          // manifest restent précachées via includeAssets.
          globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
          // Handlers Web Push (affichage + clic) injectés dans le SW généré.
          importScripts: ['sw-push.js'],
          // Ne pas mettre en cache les appels API (cookies-based auth, données live).
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // Images locales (portraits smash/sf, décors, grades…) : à la
              // demande, cache-first, plafonné. Même origine uniquement — ne
              // touche pas au CDN 42 (cf. avertissement plus bas).
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && /\.(png|jpg|jpeg|webp)$/.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'local-images',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            // ⚠️ NE PAS remettre de règle runtimeCaching sur cdn.intra.42.fr.
            // Les avatars 42 ne DOIVENT PAS être interceptés par le SW : dès que
            // le SW refait le fetch lui-même (quelle que soit la stratégie —
            // CacheFirst, SWR, NetworkFirst), la requête réémise vers le CDN 42
            // casse (Referer/Sec-Fetch altérés → 403 anti-hotlink → réponse
            // opaque vide → onError → pp absente). Symptôme : la photo
            // disparaissait au Ctrl+R (SW actif) et revenait au Ctrl+Shift+R
            // (SW bypassé), y compris en navigation privée (donc pas un cache
            // périmé : l'interception elle-même est le bug). En l'absence de
            // règle, Workbox ne fait pas respondWith() pour ces URLs → la
            // requête part en NATIF (Referer intact) à chaque chargement, comme
            // un hard reload. Le cache HTTP du navigateur gère la perf via les
            // en-têtes du CDN. Filet anti-hoquet transitoire : réessai dans
            // Avatar.tsx (suffixe _r=).
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      proxy: {
        // Proxy /api/* during dev so cookies stay first-party on localhost:5173.
        '/api': {
          target: apiBase,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      target: 'esnext',
      // Pas de sourcemaps en prod : ~10 Mo servis publiquement (code source
      // lisible par n'importe qui) sans bénéfice utilisateur.
      sourcemap: false,
      outDir: 'dist',
      rollupOptions: {
        output: {
          // Vendors lourds isolés dans leurs propres chunks : cache long (ne
          // changent qu'aux bumps de version) et téléchargement parallèle.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-motion': ['framer-motion'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
  };
});
