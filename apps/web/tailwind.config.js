/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '420px',
      },
      colors: {
        // Fonds anthracite chauds, légèrement teintés (gris-brun), pour un rendu RPG/HUD premium.
        'bg-0': '#0c0a08',
        'bg-1': '#15120e',
        'bg-2': '#1d1914',
        'bg-3': '#2a241c',
        border: '#3a3022',
        'border-strong': '#5c4a2a',

        // « teal » conservé comme NOM d'API (utilisé partout dans le code), mais
        // remappé sur la palette d'accent via variables CSS : OR en babyfoot,
        // ROUGE en mode smash ([data-game] dans index.css). Accents primaires/CTA.
        teal: {
          DEFAULT: 'rgb(var(--accent-teal) / <alpha-value>)',
          dim: 'rgb(var(--accent-teal-dim) / <alpha-value>)',
          deep: 'rgb(var(--accent-teal-deep) / <alpha-value>)',
        },
        // Accent saturé (« gold ») — bordures décoratives, titres, glyphes.
        // Pilotée par variable → vire au rouge en mode smash.
        gold: {
          DEFAULT: 'rgb(var(--accent-gold) / <alpha-value>)',
          dim: 'rgb(var(--accent-gold-dim) / <alpha-value>)',
          deep: 'rgb(var(--accent-gold-deep) / <alpha-value>)',
        },
        // Cuivre / laiton — pour tuyaux décoratifs, accents secondaires.
        brass: {
          DEFAULT: '#c08a4a',
          dim: '#8a5e2a',
          deep: '#4a3014',
        },
        // Acier brossé — plaques de stats.
        steel: {
          DEFAULT: '#7d7468',
          light: '#a8a094',
          dark: '#3d362c',
        },

        // Rouge plus sourd, plus dramatique (sang séché plutôt que néon).
        red: '#ff5366',
        'red-deep': '#b8253a',

        // Vert utilisé pour le badge TOP %.
        accent: '#7fd66e',

        // #7d6e54 ne passait pas le contraste AA (3.3–4.0:1 sur les fonds
        // sombres) alors qu'il porte du texte de 9-11px partout. #988768 garde
        // la teinte bronze mais atteint ≥4.6:1 sur bg-0…bg-3.
        muted: '#988768',
        'muted-2': '#a89880',
        text: '#ede4d3',
        'text-strong': '#fff7e4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
        // Display = typo gaming (titres, ELO, scores, brand).
        display: ['"Orbitron"', '"Rajdhani"', '"Russo One"', 'Inter', 'system-ui', 'sans-serif'],
        // Gaming = typo HUD / RPG (sections, labels héroïques).
        gaming: ['"Rajdhani"', '"Russo One"', 'Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
        tabbar: 'calc(60px + env(safe-area-inset-bottom))',
        mheader: 'calc(56px + env(safe-area-inset-top))',
      },
      minHeight: {
        dvh: '100dvh',
        svh: '100svh',
        lvh: '100lvh',
      },
      height: {
        dvh: '100dvh',
        svh: '100svh',
        lvh: '100lvh',
      },
      maxHeight: {
        dvh: '100dvh',
        svh: '100svh',
      },
      boxShadow: {
        // Glow doré — utilisé partout pour le hover/focus premium.
        'teal-glow': '0 0 18px rgba(245, 185, 66, 0.45), 0 0 36px rgba(245, 185, 66, 0.18)',
        'teal-glow-lg': '0 0 32px rgba(245, 185, 66, 0.55), 0 0 64px rgba(245, 185, 66, 0.25)',
        'gold-glow': '0 0 20px rgba(255, 201, 74, 0.5), 0 0 40px rgba(255, 201, 74, 0.2)',
        'gold-glow-lg': '0 0 38px rgba(255, 201, 74, 0.6), 0 0 76px rgba(255, 201, 74, 0.3)',
        'brass-glow': '0 0 14px rgba(192, 138, 74, 0.4)',
        'red-glow': '0 0 18px rgba(255, 83, 102, 0.45)',

        sheet:
          '0 -8px 32px rgba(0, 0, 0, 0.65), 0 -2px 8px rgba(0, 0, 0, 0.4), 0 -1px 0 rgba(255, 201, 74, 0.12) inset',
        'card-hover': '0 14px 28px -10px rgba(255, 201, 74, 0.3)',
        // Effet "plaque en relief" — pour les stat cards en acier brossé.
        'plate':
          'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)',
        'plate-gold':
          'inset 0 1px 0 rgba(255, 215, 120, 0.5), inset 0 -1px 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(255, 201, 74, 0.2), 0 4px 14px rgba(255, 201, 74, 0.18)',
        // Bordure "rivet" cartouche RPG.
        'rivet':
          'inset 0 0 0 1px rgba(255, 201, 74, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.4), 0 8px 22px rgba(0, 0, 0, 0.55)',
      },
      backdropBlur: {
        xs: '2px',
      },
      backgroundImage: {
        // Grillage technique — texture HUD subtile pour les fonds.
        'mesh-grid':
          "linear-gradient(rgba(255, 201, 74, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 201, 74, 0.06) 1px, transparent 1px)",
        // Plaque d'acier brossée verticale.
        'plate-steel':
          'linear-gradient(180deg, #2e2a22 0%, #211d17 22%, #1a1612 50%, #211d17 78%, #2e2a22 100%)',
        // Plaque dorée polie.
        'plate-gold':
          'linear-gradient(180deg, #f5d27a 0%, #c79122 22%, #8a5e10 50%, #c79122 78%, #f5d27a 100%)',
        // Tube en laiton (pour bordures décoratives latérales).
        'pipe-brass':
          'linear-gradient(90deg, #2a1f12 0%, #7a5a2a 18%, #d4a056 38%, #f5d28a 50%, #d4a056 62%, #7a5a2a 82%, #2a1f12 100%)',
        // Vignette gold douce pour le hero.
        'gold-vignette':
          'radial-gradient(ellipse at center, rgba(255, 201, 74, 0.10) 0%, rgba(255, 201, 74, 0.04) 35%, transparent 70%)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'sheet-down': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'bead-pulse': {
          '0%': { transform: 'scale(0.85)', opacity: '0.4' },
          '60%': { transform: 'scale(1.12)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'send-away': {
          '0%': {
            opacity: '1',
            transform:
              'perspective(700px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)',
          },
          '30%': {
            opacity: '1',
            transform:
              'perspective(700px) rotateX(3deg) rotateY(-6deg) translateY(-6px) scale(1.02)',
          },
          '100%': {
            opacity: '0',
            transform:
              'perspective(700px) rotateX(-8deg) rotateY(14deg) translateY(-28px) scale(0.87)',
          },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        // Rotation centrée (translate inclus pour ne pas être écrasé) — effet soleil.
        'spin-sun': {
          from: { transform: 'translate(-50%, -50%) rotate(0deg)' },
          to: { transform: 'translate(-50%, -50%) rotate(360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Segments colorés qui défilent le long du tracé SVG ∞.
        // strokeDashoffset 0 → -490 = une période complète du path (≈ 2 lobes).
        'rgb-path-travel': {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '-490' },
        },
        'glow-pulse': {
          '0%, 100%': {
            boxShadow:
              '0 0 18px rgba(245, 185, 66, 0.45), 0 0 36px rgba(245, 185, 66, 0.2)',
          },
          '50%': {
            boxShadow:
              '0 0 32px rgba(255, 201, 74, 0.65), 0 0 64px rgba(255, 201, 74, 0.32)',
          },
        },
        'tab-bounce': {
          '0%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-2px) scale(1.08)' },
          '100%': { transform: 'translateY(0) scale(1)' },
        },
        // Nouveau : gear-spin (rouage RPG très lent).
        'gear-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // Nouveau : sweep gold (reflet doré qui passe sur une plaque).
        'gold-sweep': {
          '0%': { transform: 'translateX(-100%) skewX(-12deg)' },
          '60%': { transform: 'translateX(220%) skewX(-12deg)' },
          '100%': { transform: 'translateX(220%) skewX(-12deg)' },
        },
        // Nouveau : pulse-ring (anneau qui se dilate, pour CTA pulsant).
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '70%': { transform: 'scale(1.1)', opacity: '0' },
          '100%': { transform: 'scale(1.1)', opacity: '0' },
        },
        // Nouveau : ember (flamme/braise subtile pour les éléments en feu).
        ember: {
          '0%, 100%': {
            opacity: '0.7',
            filter: 'brightness(1) drop-shadow(0 0 6px rgba(255, 201, 74, 0.55))',
          },
          '50%': {
            opacity: '1',
            filter: 'brightness(1.15) drop-shadow(0 0 14px rgba(255, 201, 74, 0.85))',
          },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        pop: 'pop 160ms ease-out',
        'slide-down': 'slide-down 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        'sheet-down': 'sheet-down 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'bead-pulse': 'bead-pulse 180ms ease-out',
        spin: 'spin 0.7s linear infinite',
        'spin-sun': 'spin-sun 44s linear infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'glow-pulse': 'glow-pulse 2.2s ease-in-out infinite',
        'tab-bounce': 'tab-bounce 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'gear-spin': 'gear-spin 40s linear infinite',
        'gold-sweep': 'gold-sweep 3.6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        ember: 'ember 2.2s ease-in-out infinite',
        'rgb-path-travel': 'rgb-path-travel 3s linear infinite',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top)' },
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom)' },
        '.pl-safe': { paddingLeft: 'env(safe-area-inset-left)' },
        '.pr-safe': { paddingRight: 'env(safe-area-inset-right)' },
        '.px-safe': {
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        },
        '.py-safe': {
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.mt-safe': { marginTop: 'env(safe-area-inset-top)' },
        '.mb-safe': { marginBottom: 'env(safe-area-inset-bottom)' },
        '.top-safe': { top: 'env(safe-area-inset-top)' },
        '.bottom-safe': { bottom: 'env(safe-area-inset-bottom)' },
        '.h-screen-dvh': { height: '100dvh' },
        '.tap-transparent': { '-webkit-tap-highlight-color': 'transparent' },
        '.no-callout': { '-webkit-touch-callout': 'none' },
        '.no-zoom': { 'font-size': '16px' },
      });
    },
  ],
};
