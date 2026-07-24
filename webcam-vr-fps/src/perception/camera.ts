export interface CameraStream {
  video: HTMLVideoElement
  stream: MediaStream
  dispose(): void
}

export async function createCameraStream(): Promise<CameraStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
    },
    audio: false,
  })

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  await video.play()

  return {
    video,
    stream,
    dispose() {
      stream.getTracks().forEach((track) => track.stop())
      video.srcObject = null
    },
  }
}
