import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const size = 64
const pixels = Buffer.alloc(size * size * 4)
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const dx = x - size / 2 + 0.5
    const dy = y - size / 2 + 0.5
    const distance = Math.sqrt(dx * dx + dy * dy)
    const index = (y * size + x) * 4
    const button = distance < 29
    const ring = distance >= 25 && distance < 29
    const exclamation = x >= 29 && x <= 34 && ((y >= 17 && y <= 38) || (y >= 44 && y <= 49))
    pixels[index] = button ? (ring ? 255 : 210) : 11
    pixels[index + 1] = button ? (ring ? 95 : 24) : 14
    pixels[index + 2] = button ? (ring ? 112 : 56) : 19
    pixels[index + 3] = exclamation ? 255 : 255
    if (exclamation) {
      pixels[index] = 255
      pixels[index + 1] = 235
      pixels[index + 2] = 235
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buffer) => buffer.reduce((crc, byte) => crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8), 0xffffffff) ^ 0xffffffff
const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type)
  const payload = Buffer.concat([typeBuffer, data])
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  payload.copy(result, 4)
  result.writeUInt32BE(crc32(payload) >>> 0, 8 + data.length)
  return result
}

const rawPixels = Buffer.concat(Array.from({ length: size }, (_, y) => Buffer.concat([
  Buffer.from([0]),
  pixels.subarray(y * size * 4, (y + 1) * size * 4),
])))

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', (() => { const b = Buffer.alloc(13); b.writeUInt32BE(size, 0); b.writeUInt32BE(size, 4); b[8] = 8; b[9] = 6; return b })()),
  chunk('IDAT', deflateSync(rawPixels)),
  chunk('IEND', Buffer.alloc(0)),
])

const ico = Buffer.alloc(22 + png.length)
ico.writeUInt16LE(0, 0)
ico.writeUInt16LE(1, 2)
ico.writeUInt16LE(1, 4)
ico[6] = size
ico[7] = size
ico.writeUInt16LE(1, 10)
ico.writeUInt16LE(32, 12)
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18)
png.copy(ico, 22)

mkdirSync('src-tauri/icons', { recursive: true })
writeFileSync('src-tauri/icons/icon.ico', ico)
console.log('Generated src-tauri/icons/icon.ico')
