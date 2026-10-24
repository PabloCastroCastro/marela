import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Iconos de la PWA a partir de public/logo.svg: npm run iconos (genera los PNG y el favicon en public/)
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#9dad6f' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#9dad6f' } },
  },
  images: ['public/logo.svg'],
})
