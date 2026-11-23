// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'

/** Loudness of a microphone track, from -60 dB (empty bar) to 0 dB (full). */
export function LevelMeter({ track }: { track?: MediaStreamTrack }) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!track || typeof AudioContext === 'undefined') return
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(new MediaStream([track])).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const s of samples) sum += s * s
      const rms = Math.sqrt(sum / samples.length)
      const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity
      setLevel(Math.max(0, Math.min(1, (db + 60) / 60)))
    }, 50)
    return () => {
      window.clearInterval(timer)
      setLevel(0)
      void context.close()
    }
  }, [track])

  return (
    <meter className="level-meter" aria-label="Microphone level" min={0} max={1} value={level} />
  )
}
