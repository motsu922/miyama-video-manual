import { VIDEO_SOURCE_MAX_BYTES } from './videoLibrary.ts'

export function planVideoCompression(duration: number, width: number, height: number, hasAudio: boolean, attempt = 0, limitBytes = VIDEO_SOURCE_MAX_BYTES) {
  if (![duration, width, height, limitBytes].every(value => Number.isFinite(value) && value > 0)) throw new Error('動画の長さや解像度を取得できません。')
  const audioBitrate = hasAudio ? 64000 : 0
  const budget = limitBytes * .85 * 8 / duration
  const videoBitrate = Math.floor(Math.min(2500000, budget - audioBitrate) * Math.pow(.5, attempt))
  if (videoBitrate < 32000) throw new Error('動画が長すぎるため、このサイズには圧縮できません。動画を分割してから登録してください。')
  const longSide = videoBitrate < 500000 ? 640 : 1280
  const shortSide = videoBitrate < 500000 ? 360 : 720
  const scale = Math.min(1, longSide / Math.max(width, height), shortSide / Math.min(width, height))
  return { videoBitrate, audioBitrate, width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2), frameRate: 30 }
}
