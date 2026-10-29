import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from 'mediabunny'
import { VIDEO_SOURCE_MAX_BYTES } from './videoLibrary'
import { planVideoCompression } from './videoCompressionPlan'

export type CompressionProgress = { percent: number; attempt: number }

export async function compressVideoFile(file: File, signal: AbortSignal, onProgress: (progress: CompressionProgress) => void, limitBytes = VIDEO_SOURCE_MAX_BYTES): Promise<File> {
  signal.throwIfAborted()
  if (!globalThis.VideoEncoder || !globalThis.VideoDecoder) throw new Error('このブラウザでは動画を圧縮できません。PCの対応ブラウザで開いてください。')
  if (limitBytes <= 0 || limitBytes > VIDEO_SOURCE_MAX_BYTES) throw new Error('圧縮サイズの指定が不正です。')
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  let conversion: Conversion | undefined
  const abort = () => { if (conversion) void conversion.cancel().catch(() => {}); else input.dispose() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const videos = await input.getVideoTracks()
    const audios = await input.getAudioTracks()
    if (videos.length !== 1 || audios.length > 1) throw new Error('映像1トラック・音声1トラックまでの動画に対応しています。別の形式で書き出してから選んでください。')
    const duration = await input.computeDuration()
    const width = await videos[0].getDisplayWidth()
    const height = await videos[0].getDisplayHeight()
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted()
      onProgress({ percent: 0, attempt: attempt + 1 })
      const plan = planVideoCompression(duration, width, height, audios.length > 0, attempt, limitBytes)
      const quality = new Quality({ bitrate: plan.videoBitrate, bitrateMode: 'constant' })
      const audioQuality = new Quality({ bitrate: plan.audioBitrate || 64000 })
      const mp4 = await canEncodeVideo('avc', { ...plan, quality }) && (!audios.length || await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, quality: audioQuality }))
      if (!mp4 && (!await canEncodeVideo('vp9', { ...plan, quality }) || (audios.length && !await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000, quality: audioQuality })))) throw new Error('この端末では映像・音声を圧縮できません。PCの別の対応ブラウザでお試しください。')
      signal.throwIfAborted()
      const target = new BufferTarget()
      let overLimit = false
      target.on('write', ({ end }) => {
        if (end >= limitBytes) { overLimit = true; throw new Error('圧縮サイズを再調整します。') }
      })
      const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat(), target })
      try {
        conversion = await Conversion.init({ input, output, tracks: 'primary',
          video: { codec: mp4 ? 'avc' : 'vp9', quality, width: plan.width, height: plan.height, fit: 'contain', frameRate: plan.frameRate, forceTranscode: true },
          audio: { codec: mp4 ? 'aac' : 'opus', quality: audioQuality, numberOfChannels: 2, sampleRate: 48000, forceTranscode: true },
          tags: {},
        })
        signal.throwIfAborted()
        if (!conversion.isValid || conversion.discardedTracks.some(item => item.track.type === 'video' || item.track.type === 'audio')) throw new Error('映像または音声を変換できない形式です。音声を失わないよう圧縮を中止しました。')
        conversion.onProgress = progress => onProgress({ percent: Math.min(99, Math.round(progress * 100)), attempt: attempt + 1 })
        await conversion.execute()
        signal.throwIfAborted()
        if (!target.buffer?.byteLength) throw new Error('圧縮した動画を作成できませんでした。')
        if (target.buffer.byteLength >= limitBytes) { overLimit = true; continue }
        const result = new File([target.buffer], `${file.name.replace(/\.[^.]+$/, '')}-compressed.${mp4 ? 'mp4' : 'webm'}`, { type: mp4 ? 'video/mp4' : 'video/webm' })
        onProgress({ percent: 100, attempt: attempt + 1 })
        return result
      } catch (error) {
        if (signal.aborted) throw new DOMException('圧縮を中止しました。', 'AbortError')
        if (!overLimit) throw error
      } finally {
        if (conversion && conversion.state !== 'done') await conversion.cancel().catch(() => {})
        conversion = undefined
      }
    }
    throw new Error('500MB未満に圧縮できませんでした。動画を分割してから登録してください。')
  } finally {
    signal.removeEventListener('abort', abort)
    input.dispose()
  }
}
