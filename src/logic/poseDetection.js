// src/logic/poseDetection.js

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from 'https://cdn.skypack.dev/@mediapipe/tasks-vision@latest'

// Import drawing utilities from the new file
import { drawPoseBoundingBox, drawManualMask } from './poseDrawingUtils.js'

// Module-level variables for MediaPipe interaction
let poseLandmarker = null
let drawingUtils = null // Keep DrawingUtils for landmarks/connectors

/**
 * Initialize the PoseLandmarker.
 * @param {HTMLCanvasElement} canvas - The main canvas element (used for DrawingUtils).
 * @param {Object} options - Detection options from the calling component.
 */
export async function initializePoseDetection(canvas, options) {
  // console.log('Initializing pose detection...');
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    )

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: 'GPU',
        ...options.baseOptions,
      },
      runningMode: options.runningMode || 'VIDEO',
      numPoses: options.numPoses || 1,
      minPoseDetectionConfidence: options.minPoseDetectionConfidence || 0.5,
      minPosePresenceConfidence: options.minPosePresenceConfidence || 0.5,
      minTrackingConfidence: options.minTrackingConfidence || 0.5,
      // Ensure this option is passed correctly
      outputSegmentationMasks: options.outputSegmentationMasks ?? false,
    })

    // Initialize DrawingUtils using the main canvas context
    // This is still needed for drawing landmarks and connectors
    drawingUtils = new DrawingUtils(canvas.getContext('2d'))

    console.log('Pose detection initialized successfully.')
  } catch (error) {
    console.error('Error initializing pose detection:', error)
    throw error
  }
}

/**
 * Run pose detection on a video frame.
 * @param {HTMLVideoElement} videoElement - The video element to process.
 * @param {number} timestamp - The current timestamp for the video frame.
 * @returns {Object} - The detection results from PoseLandmarker.
 */
export function detectPoses(videoElement, timestamp) {
  if (!poseLandmarker) {
    throw new Error('PoseLandmarker is not initialized')
  }
  // detectForVideo is synchronous in VIDEO mode
  return poseLandmarker.detectForVideo(videoElement, timestamp)
}

/**
 * Draw pose results (landmarks, connectors, bounding box, mask) onto the canvas.
 * @param {Object} results - The detection results from detectPoses.
 * @param {HTMLCanvasElement} canvas - The main canvas element for drawing.
 * @param {HTMLVideoElement} videoElement - The video element being processed.
 */
export function drawPoseResults(results, canvas, videoElement) {
  // Ensure necessary components are ready
  // Note: drawingUtils is checked here, it's initialized in initializePoseDetection
  if (!drawingUtils || !canvas || !results) return

  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  ctx.clearRect(0, 0, width, height)

  const videoWidth = videoElement.videoWidth
  const videoHeight = videoElement.videoHeight
  if (!videoWidth || !videoHeight || width === 0 || height === 0) return

  const scaleX = width / videoWidth
  const scaleY = height / videoHeight
  const scale = Math.min(scaleX, scaleY)
  const offsetX = (width - videoWidth * scale) / 2
  const offsetY = (height - videoHeight * scale) / 2

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)

  // --- Draw Segmentation Mask ---
  // Check if masks exist in results and pass the first one to the drawing util
  if (results.segmentationMasks && results.segmentationMasks.length > 0) {
    // Pass the mask object directly, it will be closed inside drawManualMask
    drawManualMask(results.segmentationMasks[0], ctx, videoWidth, videoHeight)
  }

  // --- Draw Poses ---
  if (results.landmarks && results.landmarks.length > 0) {
    for (const landmarks of results.landmarks) {
      // Call helper to draw bounding box
      drawPoseBoundingBox(ctx, landmarks, videoWidth, videoHeight)

      // Use DrawingUtils for connectors and landmarks
      drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: '#FFFFFF',
        lineWidth: 2,
      })
      drawingUtils.drawLandmarks(landmarks, {
        radius: 4,
        color: '#FF0000',
        lineWidth: 2,
      })
    }
  }

  ctx.restore()
}
