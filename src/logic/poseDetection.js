import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from 'https://cdn.skypack.dev/@mediapipe/tasks-vision@latest'

let poseLandmarker = null // PoseLandmarker instance
let drawingUtils = null // DrawingUtils instance
let segmentationMask = null // To store the mask for drawing
let maskCanvas = null // Offscreen canvas for mask rendering
let maskCtx = null // Offscreen canvas context
let reusableImageData = null
let lastMaskWidth = -1
let lastMaskHeight = -1
/**
 * Initialize the PoseLandmarker and DrawingUtils.
 * @param {HTMLCanvasElement} canvas - The canvas element for drawing.
 * @param {Object} options - Detection options (e.g., confidence thresholds).
 */
export async function initializePoseDetection(canvas, options) {
  console.log('Initializing pose detection...')
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    )

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: 'GPU',
      },
      runningMode: options.runningMode || 'VIDEO',
      numPoses: options.maxPoses || 2,
      minPoseDetectionConfidence: options.minPoseDetectionConfidence || 0.1,
      minPosePresenceConfidence: options.minPosePresenceConfidence || 0.1,
      minTrackingConfidence: options.minTrackingConfidence || 0.9,
      outputSegmentationMasks: options.outputSegmentationMasks || true,
    })

    drawingUtils = new DrawingUtils(canvas.getContext('2d'))

    // Create an offscreen canvas for mask processing
    maskCanvas = document.createElement('canvas')
    maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true }) // Important for getImageData

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
export function detectPoses(videoElement, timestamp) {
  if (!poseLandmarker) {
    throw new Error('PoseLandmarker is not initialized')
  }

  // Detect poses and segmentation masks
  const results = poseLandmarker.detectForVideo(videoElement, timestamp)

  // Store the latest segmentation mask if available
  if (results.segmentationMasks && results.segmentationMasks.length > 0) {
    // Assuming ImageMask output, which is common for pose
    segmentationMask = results.segmentationMasks[0]
  } else {
    segmentationMask = null
  }

  return results // Return the full results object
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
  if (!videoWidth || !videoHeight) return // Exit if video dimensions aren't ready

  const scaleX = width / videoWidth
  const scaleY = height / videoHeight
  const scale = Math.min(scaleX, scaleY)

  const offsetX = (width - videoWidth * scale) / 2
  const offsetY = (height - videoHeight * scale) / 2

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)

  // --- Draw Segmentation Mask (Manual) ---
  if (segmentationMask) {
    drawManualMask(segmentationMask, videoWidth, videoHeight, ctx)
  }

  for (const landmarks of results.landmarks) {
    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: '#FFFFFF',
      lineWidth: 2,
    })

    drawingUtils.drawLandmarks(landmarks, {
      radius: 4,
      color: '#FFFFFF',
      lineWidth: 2,
    })
  }

  ctx.restore()
}

/**
 * Helper function to draw the segmentation mask manually.
 * @param {ImageMask} mask - The segmentation mask object from MediaPipe.
 * @param {number} videoWidth - Original width of the video frame.
 * @param {number} videoHeight - Original height of the video frame.
 * @param {CanvasRenderingContext2D} targetCtx - The target canvas context (already scaled/translated).
 */
function drawManualMask(mask, videoWidth, videoHeight, targetCtx) {
  let maskData
  let maskWidth
  let maskHeight

  try {
    // --- Extract data FIRST ---
    maskData = mask.getAsFloat32Array() // Or getAsUint8Array if needed
    maskWidth = mask.width
    maskHeight = mask.height
    // --- Data extracted ---

    // Ensure offscreen canvas matches mask dimensions
    if (maskCanvas.width !== maskWidth || maskCanvas.height !== maskHeight) {
      maskCanvas.width = maskWidth
      maskCanvas.height = maskHeight
      reusableImageData = null // Invalidate reusable ImageData
      lastMaskWidth = -1
      lastMaskHeight = -1
    }

    // Check if we need to create new ImageData
    if (!reusableImageData || maskWidth !== lastMaskWidth || maskHeight !== lastMaskHeight) {
      // console.log('Creating new ImageData for mask'); // Debugging
      reusableImageData = maskCtx.createImageData(maskWidth, maskHeight)
      lastMaskWidth = maskWidth
      lastMaskHeight = maskHeight
    }

    const pixelData = reusableImageData.data
    const maskColor = { r: 0, g: 191, b: 255 }
    const maskOpacity = 0.7

    // Populate ImageData
    for (let i = 0; i < maskWidth * maskHeight; ++i) {
      const maskValue = maskData[i]
      const pixelIndex = i * 4
      pixelData[pixelIndex] = maskColor.r
      pixelData[pixelIndex + 1] = maskColor.g
      pixelData[pixelIndex + 2] = maskColor.b
      pixelData[pixelIndex + 3] = Math.floor(maskValue * maskOpacity * 255)
    }

    // Draw to offscreen canvas
    maskCtx.putImageData(reusableImageData, 0, 0)

    // Draw offscreen canvas to target context
    targetCtx.drawImage(maskCanvas, 0, 0, videoWidth, videoHeight)
  } catch (error) {
    console.error('Error processing or drawing manual mask:', error)
    // Error occurred, but mask object still exists
  } finally {
    // --- IMPORTANT: Always call close() in a finally block ---
    // This ensures resources are released even if errors occur during drawing
    mask.close()
    // --- End resource release ---
  }
}
