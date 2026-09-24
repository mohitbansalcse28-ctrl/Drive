/**
 * Resolves once `video` has actually started decoding (its clock moved past 0).
 *
 * Why: Chromium's demuxer can't use a seek index that lives at the end of the file (MKV
 * "Cues", common in camera/phone recordings) until playback is running. A seek issued
 * before that — e.g. resuming at 15:00 right on `loadedmetadata` — makes it scan the whole
 * file from the start, which takes seconds on a large video. The same seek a few frames
 * into playback is instant. The video is played muted if needed; callers restore sound.
 */
export function whenSeekable(video: HTMLVideoElement, timeoutMs = 2000): Promise<void> {
  if (video.currentTime > 0 && video.readyState >= 2) return Promise.resolve()
  return new Promise((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      video.removeEventListener('timeupdate', onTime)
      resolve()
    }
    const onTime = () => video.currentTime > 0 && finish()
    const timer = setTimeout(finish, timeoutMs)
    video.addEventListener('timeupdate', onTime)
    if (video.paused) {
      video.muted = true
      video.play().catch(finish)
    }
  })
}
