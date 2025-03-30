<template>
  <div class="video-container">
    <video ref="videoElement" class="fullscreen-video" :src="currentVideoSource" crossorigin="anonymous" muted autoplay
      loop playsinline @loadedmetadata="onVideoLoaded"></video>

    <canvas ref="overlayCanvas" class="fullscreen-canvas"></canvas>

    <div class="video-info-display">
      {{ currentLocation || 'Loading...' }}
    </div>
    <button @click="toggleCamera" class="camera-toggle-button" :class="{ active: usingWebcam }"
      aria-label="Toggle Camera" title="Toggle Camera">
      <img :src="cameraIconUrl" alt="Camera Icon" />
    </button>

    <div class="controls-panel">
      <button @click="toggleDetection" :class="{ active: detectionActive }">
        {{ detectionActive ? 'Stop Detection' : 'Start Detection' }}
      </button>
      <div class="video-sources">
        <div class="source-buttons">
          <button @click="loadRandomVideo()">
            Next
          </button>
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
import cameraIconUrl from '../assets/camera.svg'

// Refs for DOM elements
const videoElement = ref(null)
const overlayCanvas = ref(null)
const currentVideoSource = ref('')
const availableVideos = ref([])
const usingWebcam = ref(false)
let mediaStream = null
const webcamReady = ref(false)

const currentLocation = ref('');
let lastVideoIndex = ref(-1)

const uploadedObjectUrl = ref(null)
const detectionActive = ref(false)
const detectionOptions = reactive({
  minPoseDetectionConfidence: 0.1,
  minPosePresenceConfidence: 0.1,
  minTrackingConfidence: 0.98,
  runningMode: 'VIDEO',
  maxPoses: 3,
  outputSegmentationMasks: true,
})

let animationFrameId = null

// Cleanup function for Object URLs
function cleanupObjectUrl() {
  if (uploadedObjectUrl.value) {
    URL.revokeObjectURL(uploadedObjectUrl.value)
    uploadedObjectUrl.value = null
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
function loadVideo(url) {
  stopWebcam()
  cleanupObjectUrl()
  usingWebcam.value = false
  currentVideoSource.value = url
}

function loadRandomVideo() {
  const numVideos = availableVideos.value.length;
  if (numVideos === 0) {
    console.log('No available videos.')
  }
  let randomIndex;
  if (numVideos === 1) {
    randomIndex = 0; // Only one choice
  } else {
    // Generate random index until it's different from the last one
    do {
      randomIndex = Math.floor(Math.random() * numVideos);
    } while (randomIndex === lastVideoIndex.value);

    lastVideoIndex.value = randomIndex;
    const selectedVideo = availableVideos.value[randomIndex];
    currentLocation.value = selectedVideo.location;
    console.log(`Loading random video: ${selectedVideo.location} (Index: ${randomIndex})`);
    loadVideo(selectedVideo.url);
  }
}

onMounted(async () => {
  if (!videoElement.value || !overlayCanvas.value) {
    console.error('Video or Canvas element not found on mount.');
    return;
  }

  // Fetch video list using the new function
  try {
    const videoData = await fetchVideoData(); // Assuming fetchVideoData is defined elsewhere
    availableVideos.value = videoData; // Store fetched data

    // --- Load Initial Random Video ---
    if (availableVideos.value.length > 0) {
      loadRandomVideo(); // Call the function to load a random video
    } else {
      console.warn('No videos available to load.');
      // Handle the case where no videos are loaded (e.g., show a message)
      currentLocation.value = 'No Videos Available';
    }
    // --- End Load Initial Random Video ---

  } catch (error) {
    console.error('Error fetching videos.', error);
    currentLocation.value = 'Error Loading Videos';
  }

  // Initialize canvas and pose detection
  try {
    setupCanvas(); // Setup canvas dimensions
    await initializePoseDetection(overlayCanvas.value, detectionOptions); // Initialize MediaPipe
    console.log('Pose detection initialized');
    // Optional: Auto-start detection if desired
    // toggleDetection();
  } catch (error) {
    console.error('Failed to initialize pose detection:', error);
  }
});

// Cleanup on component unmount
onUnmounted(() => {
  stopWebcam()
  cleanupObjectUrl()
  window.removeEventListener('resize', updateCanvasSize)
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  detectionActive.value = false
})

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

async function fetchVideoData() {
  let videosJsonUrl = ''

  // Determine JSON URL based on environment
  if (import.meta.env.MODE === 'development') {
    videosJsonUrl = `${import.meta.env.BASE_URL}videos.json`
    console.log('Development mode: Fetching local videos.json')
  } else {
    videosJsonUrl =
      'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/videos.json' // CDN URL
    console.log('Production mode: Fetching CDN videos.json')
  }

  try {
    const response = await fetch(videosJsonUrl)
    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status} fetching ${videosJsonUrl}`,
      )
    }
    const videoData = await response.json()
    return videoData // Return the fetched array
  } catch (error) {
    console.error('Failed to fetch or parse video list:', error)
    throw error // Re-throw the error to be caught in onMounted
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

function toggleCamera() {
  if (usingWebcam.value) {
    // If webcam is ON, switch back to a random video
    console.log("Switching from webcam to random video...");
    loadRandomVideo(); // This implicitly calls stopWebcam via loadDefaultVideo
  } else {
    // If webcam is OFF, activate it
    console.log("Activating webcam...");
    activateWebcam(); // Call the function to turn on the webcam
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

.video-info-display {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 1rem;
  z-index: 10;
  white-space: nowrap;
}

.camera-toggle-button {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  padding: 8px;
  border-radius: 50%;
  /* Circular */
  cursor: pointer;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.camera-toggle-button img {
  width: 24px;
  /* Adjust size as needed */
  height: 24px;
  /* Adjust size as needed */
  display: block;
  /* Prevents extra space below image */
  /* Optional: Filter to make SVG white if it's black */
  filter: invert(1) brightness(2);
}

.camera-toggle-button:hover {
  background: rgba(80, 80, 80, 0.8);
}

.camera-toggle-button.active {
  background: rgba(0, 120, 212, 0.8);
  /* Blue when active */
}
</style>
