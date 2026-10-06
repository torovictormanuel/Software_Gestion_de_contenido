// HIM Product Media · Tailwind (tema "Ivory & Gold")
// Los colores apuntan a las variables CSS de design/tokens-ivory.css, así el
// mismo build sirve para el tema claro y el oscuro.
//
// Con el CDN (index.html actual): pegá el objeto `theme` dentro de
//   <script>tailwind.config = { theme: { ... } }</script>
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        ivory: 'var(--bg)',
        surface: { DEFAULT: 'var(--panel)', raised: 'var(--panel2)', sunken: 'var(--sunken)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        ink: { DEFAULT: 'var(--text)', muted: 'var(--muted)', dim: 'var(--dim)' },
        gold: {
          DEFAULT: 'var(--gold)',      // #C59B27
          light: 'var(--gold-light)',  // #DFB035
          pale: 'var(--gold-pale)',    // #F3E5AB
          deep: 'var(--gold-deep)',    // #BF953F
          ink: 'var(--gold-ink)',      // texto dorado accesible
          soft: 'var(--gold-soft)',
        },
        success: { DEFAULT: 'var(--success)', ink: 'var(--success-ink)', soft: 'var(--success-soft)' },
        up: 'var(--up)',
        down: 'var(--down)',
        youtube: { DEFAULT: 'var(--youtube)', soft: 'var(--youtube-soft)' },
        instagram: { DEFAULT: 'var(--instagram)', ink: 'var(--instagram-ink)', soft: 'var(--instagram-soft)' },
        tiktok: { DEFAULT: 'var(--tiktok)', ink: 'var(--tiktok-ink)' },
      },
      backgroundImage: {
        'gold-grad': 'var(--gold-grad)',
      },
      boxShadow: {
        card: 'var(--shadow-md)',
        lift: 'var(--shadow-lg)',
        gold: 'var(--gold-glow)',
        focus: 'var(--focus-ring)',
      },
      borderRadius: {
        card: 'var(--radius-md)',
        panel: 'var(--radius-lg)',
      },
      fontFamily: {
        display: ['Outfit', 'Plus Jakarta Sans', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
};
