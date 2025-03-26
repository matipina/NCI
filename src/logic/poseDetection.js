import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from 'https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0'

let poseLandmarker = null // PoseLandmarker instance
let drawingUtils = null // DrawingUtils instance

/**
 * Initialize the PoseLandmarker and DrawingUtils.
 * @param {HTMLCanvasElement} canvas - The canvas element for drawing.
 * @param {Object} options - Detection options (e.g., confidence thresholds).
 */
export async function initializePoseDetection(canvas, options) {
  console.log('Initializing pose detection...')
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm',
    )

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: 'GPU',
      },
      runningMode: options.runningMode || 'VIDEO',
      numPoses: options.maxPoses || 3,
      minPoseDetectionConfidence: options.minPoseDetectionConfidence || 0.1,
      minPosePresenceConfidence: options.minPosePresenceConfidence || 0.1,
      minTrackingConfidence: options.minTrackingConfidence || 0.1,
    })

    drawingUtils = new DrawingUtils(canvas.getContext('2d'))
    console.log('Pose detection initialized successfully')
  } catch (error) {
    console.error('Error initializing pose detection:', error)
    throw error
  }
}

/**
 * Run pose detection on a video frame.
 * @param {HTMLVideoElement} videoElement - The video element to process.
 * @param {number} timestamp - The current timestamp for the video frame.
 * @returns {Object} - The detection results.
 */
export async function detectPoses(videoElement, timestamp) {
  if (!poseLandmarker) {
    throw new Error('PoseLandmarker is not initialized')
  }

  return poseLandmarker.detectForVideo(videoElement, timestamp)
}

/**
 * Draw pose detection results on the canvas.
 * @param {Object} results - The detection results from PoseLandmarker.
 * @param {HTMLCanvasElement} canvas - The canvas element for drawing.
 * @param {HTMLVideoElement} videoElement - The video element being processed.
 */
export function drawPoseResults(results, canvas, videoElement) {
  if (!drawingUtils || !canvas) return

  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  // Clear previous drawing
  ctx.clearRect(0, 0, width, height)

  // If no poses detected, just return
  if (!results.landmarks || results.landmarks.length === 0) return

  // Scale drawing to match video dimensions while maintaining canvas size
  const videoWidth = videoElement.videoWidth
  const videoHeight = videoElement.videoHeight

  const scaleX = width / videoWidth
  const scaleY = height / videoHeight
  const scale = Math.min(scaleX, scaleY)

  const offsetX = (width - videoWidth * scale) / 2
  const offsetY = (height - videoHeight * scale) / 2

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)

  for (const landmarks of results.landmarks) {
    drawingUtils.drawLandmarks(landmarks, {
      radius: 4,
      color: '#FFFFFF',
      lineWidth: 2,
    })

    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: '#FF0000',
      lineWidth: 2,
    })
  }

  ctx.restore()
}
