<template>
  <div class="video-container">
    <!-- Video Element (Fullscreen) -->
    <video ref="videoElement" class="fullscreen-video" :src="currentVideoSource" crossorigin="anonymous" muted autoplay
      loop playsinline @loadedmetadata="onVideoLoaded"></video>

    <!-- Canvas Overlay for Future ML Visualizations -->
    <canvas ref="overlayCanvas" class="fullscreen-canvas"></canvas>

    <!-- Source Selection Controls -->
    <div class="controls-panel">
      <h2>AI Nature Explorer</h2>
      <button @click="toggleDetection" :class="{ active: detectionActive }">
        {{ detectionActive ? 'Stop Detection' : 'Start Detection' }}
      </button>
      <div class="slider-control">
        <label>Max Poses: {{ detectionOptions.maxPoses }}</label>
        <input type="range" min="1" max="10" v-model.number="detectionOptions.maxPoses" />
      </div>

      <div class="video-sources">
        <h3>Video Source</h3>
        <div class="source-buttons">
          <button v-for="(video, index) in defaultVideos" :key="index" @click="loadDefaultVideo(video.url)"
            :class="{ active: currentVideoSource === video.url && !usingWebcam }">
            {{ video.name }}
          </button>
          <button @click="activateWebcam" :class="{ active: usingWebcam }">
            Webcam
          </button>
          <div class="file-upload">
            <label for="video-upload">Upload Video</label>
            <input type="file" id="video-upload" @change="handleFileUpload" accept="video/*" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import {
  initializePoseDetection,
  detectPoses,
  drawPoseResults,
} from '../logic/poseDetection'

// Refs for DOM elements
const videoElement = ref(null)
const overlayCanvas = ref(null)
const currentVideoSource = ref('')
const usingWebcam = ref(false)
let mediaStream = null
const webcamReady = ref(false) // Keep for ensuring webcam dimensions are ready
const uploadedObjectUrl = ref(null)

// Detection state variables
const detectionActive = ref(false)
const detectionOptions = reactive({
  minPoseDetectionConfidence: 0.1,
  minPosePresenceConfidence: 0.3,
  minTrackingConfidence: 0.9,
  runningMode: 'VIDEO',
  maxPoses: 1, // Defaulting to 1, adjustable via slider
  outputSegmentationMasks: true, // Keep true if you want masks
})

// Animation frame ID for cleanup
let animationFrameId = null

// Default videos hosted externally
const defaultVideos = [
  {
    name: 'Clouds',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/clouds.mp4',
  },
  {
    name: 'Water',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/water.mp4',
  },
  {
    name: 'Field',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/field.mp4',
  },
  {
    name: 'Moon',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/moon.mp4',
  },
]

// Cleanup function for Object URLs
function cleanupObjectUrl() {
  if (uploadedObjectUrl.value) {
    URL.revokeObjectURL(uploadedObjectUrl.value)
    uploadedObjectUrl.value = null
    // console.log('Revoked previous object URL'); // Removed log
  }
}

// Update canvas size to match video or container
function updateCanvasSize() {
  const canvas = overlayCanvas.value
  if (!canvas || !videoElement.value) return

  const videoWidth = videoElement.value.videoWidth
  const videoHeight = videoElement.value.videoHeight
  const targetWidth = videoWidth > 0 ? videoWidth : canvas.clientWidth
  const targetHeight = videoHeight > 0 ? videoHeight : canvas.clientHeight

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
    // console.log('Canvas size updated:', canvas.width, canvas.height); // Removed log
  }
}

// Setup canvas and resize listener
function setupCanvas() {
  if (overlayCanvas.value && videoElement.value) {
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
  }
}

// Called when video metadata is loaded
function onVideoLoaded() {
  // console.log('Video metadata loaded.'); // Removed log
  updateCanvasSize()
  if (videoElement.value) {
    videoElement.value.play().catch((err) => {
      console.error('Error attempting to play video:', err)
    })
  }
  if (usingWebcam.value) {
    webcamReady.value = true
  }
}

// Load one of the default videos
function loadDefaultVideo(url) {
  stopWebcam()
  cleanupObjectUrl()
  usingWebcam.value = false
  currentVideoSource.value = url
}

// Handle video file upload
function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  stopWebcam()
  cleanupObjectUrl()
  usingWebcam.value = false
  const objectURL = URL.createObjectURL(file)
  uploadedObjectUrl.value = objectURL
  currentVideoSource.value = objectURL
  event.target.value = '' // Clear input
}

// Initialize on component mount
onMounted(async () => {
  if (!videoElement.value || !overlayCanvas.value) {
    console.error('Video or Canvas element not found on mount.')
    return
  }
  try {
    loadDefaultVideo(defaultVideos[0].url)
    setupCanvas()
    await initializePoseDetection(overlayCanvas.value, detectionOptions)
    console.log('Pose detection initialized')
  } catch (error) {
    console.error('Failed to initialize pose detection:', error)
  }
})

// Cleanup on component unmount
onUnmounted(() => {
  stopWebcam()
  cleanupObjectUrl()
  window.removeEventListener('resize', updateCanvasSize)
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  detectionActive.value = false
  // console.log('Component unmounted, cleaned up resources.'); // Removed log
})

// --- Simplified Detection Loop ---
async function runDetectionLoop() {
  // Check if detection should run (standard checks)
  if (
    !detectionActive.value ||
    !videoElement.value ||
    videoElement.value.paused ||
    videoElement.value.ended ||
    (usingWebcam.value && !webcamReady.value) ||
    videoElement.value.readyState < 3 // Needs enough data
  ) {
    // Keep requesting frames if active, otherwise stop
    if (detectionActive.value) {
      animationFrameId = requestAnimationFrame(runDetectionLoop)
    }
    return
  }

  // Process this frame
  try {
    // Get results from MediaPipe
    const results = await detectPoses(videoElement.value, performance.now())

    // Draw the results onto the canvas
    if (overlayCanvas.value) {
      drawPoseResults(results, overlayCanvas.value, videoElement.value)
    }
  } catch (error) {
    console.error('Error in detection loop:', error)
    detectionActive.value = false // Stop detection on error
    return // Exit loop
  }

  // Request the next frame if detection is still active
  if (detectionActive.value) {
    animationFrameId = requestAnimationFrame(runDetectionLoop)
  }
}

// Start/stop detection
function toggleDetection() {
  detectionActive.value = !detectionActive.value
  if (detectionActive.value) {
    // console.log('Starting detection loop...'); // Removed log
    webcamReady.value = !usingWebcam.value // Assume non-webcam is ready
    // Start the loop
    runDetectionLoop()
  } else {
    // console.log('Stopping detection loop...'); // Removed log
    // Stop the loop
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }
}

// Activate webcam input
async function activateWebcam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('getUserMedia is not supported in this browser.')
    return
  }
  cleanupObjectUrl()
  stopWebcam() // Ensure previous stream/video is stopped

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })
    videoElement.value.srcObject = mediaStream
    videoElement.value.src = '' // Clear src attribute
    currentVideoSource.value = '' // Clear reactive source URL
    usingWebcam.value = true
    webcamReady.value = false // Wait for onVideoLoaded
  } catch (err) {
    console.error('Error accessing webcam:', err)
    alert('Could not access webcam. Please check permissions.')
    usingWebcam.value = false
  }
}

// Stop webcam stream and reset state
function stopWebcam() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
    // console.log('Webcam stream stopped.'); // Removed log
  }
  if (videoElement.value && videoElement.value.srcObject) {
    videoElement.value.srcObject = null
  }
  if (usingWebcam.value) {
    usingWebcam.value = false
    webcamReady.value = false
  }
}
</script>

<style scoped>
/* Styles remain the same */
.video-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #000;
  /* Background while loading */
}

.fullscreen-video,
.fullscreen-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Cover ensures video fills space, might crop */
}

.fullscreen-canvas {
  z-index: 1;
  /* Canvas on top of video */
  background-color: transparent;
  /* Ensure canvas is see-through */
}

.controls-panel {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 25px;
  border-radius: 10px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  /* Spacing between control groups */
  max-width: 90%;
  box-sizing: border-box;
}

.controls-panel h2 {
  margin: 0 0 10px 0;
  font-size: 1.2em;
}

.controls-panel button {
  padding: 8px 15px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background-color: #444;
  color: white;
  transition: background-color 0.2s ease;
}

.controls-panel button:hover {
  background-color: #666;
}

.controls-panel button.active {
  background-color: #007bff;
  /* Highlight active state */
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  justify-content: center;
}

.slider-control label {
  white-space: nowrap;
}

.slider-control input[type='range'] {
  flex-grow: 1;
  max-width: 200px;
}

.video-sources {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.video-sources h3 {
  margin: 0;
  font-size: 1em;
}

.source-buttons {
  display: flex;
  flex-wrap: wrap;
  /* Allow buttons to wrap on smaller screens */
  justify-content: center;
  gap: 10px;
}

.file-upload label {
  display: inline-block;
  padding: 8px 15px;
  background-color: #5cb85c;
  color: white;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.file-upload label:hover {
  background-color: #4cae4c;
}

.file-upload input[type='file'] {
  display: none;
  /* Hide the default file input */
}
</style>
