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
        <input type="range" min="1" max="10" v-model="detectionOptions.maxPoses" @change="updateDetectionSettings" />
      </div>

      <div class="video-sources">
        <h3>Video Source</h3>
        <div class="source-buttons">
          <button v-for="(video, index) in defaultVideos" :key="index" @click="loadDefaultVideo(video.url)"
            :class="{ active: currentVideoSource === video.url }">
            {{ video.name }}
          </button>
          <button @click="activateWebcam" :class="{ active: usingWebcam }">
            Webcam
          </button>
          <div class="file-upload">
            <label for="video-upload">Upload Video</label>
            <input type="file" id="video-upload" @change="handleFileUpload" accept="video/*">
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue';
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// Refs for DOM elements
const videoElement = ref(null);
const overlayCanvas = ref(null);
const currentVideoSource = ref('');
const usingWebcam = ref(false);
let mediaStream = null;

// Detection state variables
const detectionActive = ref(false);
const poseLandmarker = ref(null);
const drawingUtils = ref(null);
const detectionOptions = reactive({
  minPoseDetectionConfidence: 0.1,
  minPosePresenceConfidence: 0.1,
  minTrackingConfidence: 0.1,
  runningMode: "VIDEO",
  maxPoses: 3
});

const lastVideoTime = ref(-1);

// Default videos hosted externally - replace with your actual video URLs
const defaultVideos = [
  {
    name: 'Beach',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/beach.mp4'
  },
  {
    name: 'Water',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/water.mp4'
  },
  {
    name: 'Field',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/field.mp4'
  },
  {
    name: 'Moon',
    url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/moon.mp4'
  }
];

// Initialize with first default video
onMounted(() => {
  loadDefaultVideo(defaultVideos[0].url);
  setupCanvas();

  // Initialize pose detection after a short delay to ensure video is loaded
  setTimeout(async () => {
    await initializePoseDetection();
    toggleDetection();
  }, 1000);
});

// Clean up resources when component is destroyed
onUnmounted(() => {
  if (mediaStream) {
    stopWebcam();
  }
});

// Set up canvas size to match video
function setupCanvas() {
  if (overlayCanvas.value && videoElement.value) {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
  }
}

// Update canvas dimensions to match video/viewport
function updateCanvasSize() {
  const canvas = overlayCanvas.value;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// Load a default video from external hosting
function loadDefaultVideo(url) {
  if (mediaStream) {
    stopWebcam();
  }
  usingWebcam.value = false;
  currentVideoSource.value = url;

  // Ensure video plays after source change
  if (videoElement.value) {
    videoElement.value.play().catch(err => {
      console.error('Error playing video:', err);
    });
  }
}

// Handle when video metadata is loaded
function onVideoLoaded() {
  updateCanvasSize();
  console.log('Video loaded:', videoElement.value.videoWidth, 'x', videoElement.value.videoHeight);
}

// Activate webcam input
async function activateWebcam() {
  try {
    // Stop any currently playing video
    if (videoElement.value) {
      videoElement.value.pause();
      currentVideoSource.value = '';
    }

    // Get webcam stream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    // Attach stream to video element
    videoElement.value.srcObject = mediaStream;
    videoElement.value.play();
    usingWebcam.value = true;
  } catch (err) {
    console.error('Error accessing webcam:', err);
    alert('Could not access webcam. Please check permissions.');
  }
}

// Stop webcam stream
function stopWebcam() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
    if (videoElement.value) {
      videoElement.value.srcObject = null;
    }
  }
  usingWebcam.value = false;
}

// Handle user-uploaded video files
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Stop webcam if active
  if (mediaStream) {
    stopWebcam();
  }

  // Create object URL for the video file
  const objectUrl = URL.createObjectURL(file);
  currentVideoSource.value = objectUrl;
  usingWebcam.value = false;

  // Clean up previous object URLs to avoid memory leaks
  return () => {
    URL.revokeObjectURL(objectUrl);
  };
}

// Initialize the pose landmarker
async function initializePoseDetection() {
  console.log('Initializing pose detection...');

  try {
    // Create a vision tasks runner with the pose detection model
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    // Initialize the pose landmarker with the lite model for better performance
    poseLandmarker.value = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: "GPU" // Use GPU acceleration when available
      },
      runningMode: detectionOptions.runningMode,
      numPoses: detectionOptions.maxPoses,
      minPoseDetectionConfidence: detectionOptions.minPoseDetectionConfidence,
      minPosePresenceConfidence: detectionOptions.minPosePresenceConfidence,
      minTrackingConfidence: detectionOptions.minTrackingConfidence
    });

    // Set up drawing utilities
    const canvasCtx = overlayCanvas.value.getContext('2d');
    drawingUtils.value = new DrawingUtils(canvasCtx);

    console.log('Pose detection initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing pose detection:', error);
    return false;
  }
}

async function updateDetectionSettings() {
  // If detection is active, we need to restart it with new settings
  const wasActive = detectionActive.value;

  if (wasActive) {
    // Stop detection temporarily
    detectionActive.value = false;
  }

  // Re-initialize with new settings
  await initializePoseDetection();

  // Restart if it was active
  if (wasActive) {
    detectionActive.value = true;
    runDetectionLoop();
  }
}

// Toggle pose detection on/off
async function toggleDetection() {
  if (detectionActive.value) {
    // Turn off detection
    detectionActive.value = false;
    console.log('Detection stopped');
  } else {
    // Initialize if not already done
    if (!poseLandmarker.value) {
      const initialized = await initializePoseDetection();
      if (!initialized) {
        console.error('Could not initialize pose detection');
        return;
      }
    }

    // Start detection
    detectionActive.value = true;
    console.log('Detection started');
    lastVideoTime.value = -1; // Reset last processed frame time
    runDetectionLoop();
  }
}

// Run the detection loop for video
async function runDetectionLoop() {
  // Exit if detection is disabled or not properly set up
  if (!detectionActive.value || !poseLandmarker.value || !videoElement.value) {
    return;
  }

  // Don't process if video is paused or ended
  if (videoElement.value.paused || videoElement.value.ended) {
    requestAnimationFrame(runDetectionLoop);
    return;
  }

  // Only process if the frame has changed
  if (lastVideoTime.value !== videoElement.value.currentTime) {
    lastVideoTime.value = videoElement.value.currentTime;

    // Get current timestamp for the detection
    const startTimeMs = performance.now();

    try {
      // Process the current video frame
      poseLandmarker.value.detectForVideo(videoElement.value, startTimeMs, (result) => {
        // Draw the detection results
        drawPoseResults(result);
      });
    } catch (error) {
      console.error('Error in detection loop:', error);
    }
  }

  // Continue the loop
  if (detectionActive.value) {
    requestAnimationFrame(runDetectionLoop);
  }
}

// Draw pose detection results on the canvas
function drawPoseResults(results) {
  if (!overlayCanvas.value || !drawingUtils.value) return;

  const ctx = overlayCanvas.value.getContext('2d');
  const width = overlayCanvas.value.width;
  const height = overlayCanvas.value.height;

  // Clear previous drawing
  ctx.clearRect(0, 0, width, height);

  // If no poses detected, just return
  if (!results.landmarks || results.landmarks.length === 0) return;

  // Draw pose landmarks
  ctx.save();

  // Scale drawing to match video dimensions while maintaining canvas size
  const videoWidth = videoElement.value.videoWidth;
  const videoHeight = videoElement.value.videoHeight;

  // Calculate scale to fit video properly in the container
  const scaleX = width / videoWidth;
  const scaleY = height / videoHeight;
  const scale = Math.min(scaleX, scaleY);

  // Calculate centering offsets
  const offsetX = (width - videoWidth * scale) / 2;
  const offsetY = (height - videoHeight * scale) / 2;

  // Apply transformations
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw each detected pose
  for (const landmarks of results.landmarks) {
    // Draw the pose landmarks (joints)
    drawingUtils.value.drawLandmarks(landmarks, {
      radius: 4,
      color: '#FF0000',
      lineWidth: 2
    });

    // Draw the connections (skeleton)
    drawingUtils.value.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: '#00FF00',
      lineWidth: 2
    });
  }

  ctx.restore();
}



</script>

<style scoped>
.video-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.fullscreen-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* This ensures the video covers the entire container */
}

.fullscreen-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* Let clicks pass through to video */
}

.controls-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px;
  border-radius: 8px;
  z-index: 10;
  max-width: 300px;
}

.controls-panel h2 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.4rem;
}

.controls-panel h3 {
  margin-top: 10px;
  margin-bottom: 5px;
  font-size: 1rem;
}

.source-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

button {
  background: rgba(60, 60, 60, 0.8);
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover {
  background: rgba(80, 80, 80, 0.8);
}

button.active {
  background: rgba(0, 120, 212, 0.8);
}

.file-upload {
  margin-top: 8px;
}

.file-upload label {
  display: inline-block;
  background: rgba(60, 60, 60, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.file-upload label:hover {
  background: rgba(80, 80, 80, 0.8);
}

.file-upload input {
  display: none;
}
</style>
