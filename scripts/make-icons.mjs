// Generates a transparent logo + PWA icons from src/assets/logo-source.jpg
import sharp from 'sharp'

const src = 'src/assets/logo-source.jpg'
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const out = Buffer.alloc(info.width * info.height * 4)
for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  // white -> transparent, un-premultiply the colour against white
  let a = 255 - Math.min(r, g, b)
  a = a < 6 ? 0 : Math.min(255, Math.round(a * 1.0))
  if (a === 0) { out[j] = out[j + 1] = out[j + 2] = out[j + 3] = 0; continue }
  const k = 255 / a
  out[j] = Math.max(0, Math.min(255, Math.round(255 - (255 - r) * k)))
  out[j + 1] = Math.max(0, Math.min(255, Math.round(255 - (255 - g) * k)))
  out[j + 2] = Math.max(0, Math.min(255, Math.round(255 - (255 - b) * k)))
  out[j + 3] = a
}
const transparent = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
// crop to the artwork (it sits in the middle of a lot of white)
const art = await transparent.clone().extract({ left: 230, top: 150, width: 570, height: 680 }).png().toBuffer()
await sharp(art).resize({ height: 512 }).png().toFile('src/assets/logo.png')

const square = async (size, pad, bg, file) => {
  const inner = Math.round(size * (1 - pad * 2))
  const logo = await sharp(art).resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: 'center' }]).png().toFile(file)
}
const white = { r: 255, g: 255, b: 255, alpha: 1 }
await square(192, 0.12, white, 'public/pwa-192.png')
await square(512, 0.12, white, 'public/pwa-512.png')
await square(512, 0.22, white, 'public/pwa-maskable-512.png')
await square(180, 0.12, white, 'public/apple-touch-icon.png')
await square(64, 0.06, { r: 0, g: 0, b: 0, alpha: 0 }, 'public/favicon.png')
console.log('icons done')

// Android draws a notification's small icon as a single-colour silhouette (only the alpha channel counts).
{
  const { data, info } = await sharp('src/assets/logo.png').resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 255 }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile('public/notif-badge.png')
  console.log('badge done')
}
