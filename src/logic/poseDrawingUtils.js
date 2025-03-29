let maskCanvas = null
let maskCtx = null
let reusableImageData = null
let lastMaskWidth = -1
let lastMaskHeight = -1

/**
 * Initializes the offscreen canvas for mask drawing if it hasn't been already.
 */
function ensureMaskCanvasInitialized() {
  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas')
    // Setting willReadFrequently is important for getImageData/putImageData performance
    maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskCtx) {
      console.error('Failed to get 2D context for mask canvas.')
      maskCanvas = null // Reset if context failed
    }
  }
  return maskCanvas && maskCtx // Return true if successfully initialized/exists
}

/**
 * Calculates and draws a bounding box around the provided pose landmarks.
 * @param {CanvasRenderingContext2D} ctx - The canvas context (already scaled/translated).
 * @param {Array<Object>} landmarks - Array of landmarks for a single pose.
 * @param {number} videoWidth - Original width of the video frame (for scaling).
 * @param {number} videoHeight - Original height of the video frame (for scaling).
 */
export function drawPoseBoundingBox(ctx, landmarks, videoWidth, videoHeight) {
  if (!landmarks || landmarks.length === 0) return

  let minX = 1.0,
    minY = 1.0,
    maxX = 0.0,
    maxY = 0.0
  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x)
    minY = Math.min(minY, landmark.y)
    maxX = Math.max(maxX, landmark.x)
    maxY = Math.max(maxY, landmark.y)
  }

  if (minX <= maxX && minY <= maxY) {
    ctx.save()
    ctx.strokeStyle = '#00FF00' // Green box
    ctx.lineWidth = 2
    ctx.strokeRect(
      minX * videoWidth,
      minY * videoHeight,
      (maxX - minX) * videoWidth,
      (maxY - minY) * videoHeight,
    )
    ctx.restore()
  }
}

/**
 * Draws the segmentation mask manually onto the target context.
 * Uses an offscreen canvas for potentially better performance.
 * IMPORTANT: This function calls mask.close().
 * @param {ImageMask} mask - The segmentation mask object from MediaPipe.
 * @param {CanvasRenderingContext2D} targetCtx - The target canvas context (already scaled/translated).
 * @param {number} videoWidth - Original width of the video frame (for scaling).
 * @param {number} videoHeight - Original height of the video frame (for scaling).
 */
export function drawManualMask(mask, targetCtx, videoWidth, videoHeight) {
  if (!mask || typeof mask.close !== 'function') {
    if (mask && typeof mask.close === 'function') mask.close()
    return
  }

  // Ensure the offscreen canvas is ready
  if (!ensureMaskCanvasInitialized()) {
    console.error('Mask canvas could not be initialized. Skipping mask drawing.')
    mask.close() // Close the mask even if canvas fails
    return
  }

  let maskData
  let maskWidth
  let maskHeight

  try {
    maskData = mask.getAsFloat32Array()
    maskWidth = mask.width
    maskHeight = mask.height

    if (maskCanvas.width !== maskWidth || maskCanvas.height !== maskHeight) {
      maskCanvas.width = maskWidth
      maskCanvas.height = maskHeight
      reusableImageData = null
      lastMaskWidth = -1
      lastMaskHeight = -1
    }

    if (!reusableImageData || maskWidth !== lastMaskWidth || maskHeight !== lastMaskHeight) {
      reusableImageData = maskCtx.createImageData(maskWidth, maskHeight)
      lastMaskWidth = maskWidth
      lastMaskHeight = maskHeight
    }

    const pixelData = reusableImageData.data
    const maskColor = { r: 0, g: 191, b: 255 }
    const maskOpacity = 0.7

    for (let i = 0; i < maskWidth * maskHeight; ++i) {
      const maskValue = maskData[i]
      const pixelIndex = i * 4
      pixelData[pixelIndex] = maskColor.r
      pixelData[pixelIndex + 1] = maskColor.g
      pixelData[pixelIndex + 2] = maskColor.b
      pixelData[pixelIndex + 3] = Math.floor(maskValue * maskOpacity * 255)
    }

    maskCtx.putImageData(reusableImageData, 0, 0)
    targetCtx.drawImage(maskCanvas, 0, 0, videoWidth, videoHeight)
  } catch (error) {
    console.error('Error processing or drawing manual mask:', error)
  } finally {
    mask.close() // IMPORTANT: Ensure mask is always closed
  }
}
