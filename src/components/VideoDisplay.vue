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
  initializePoseDetection,
  detectPoses,
  drawPoseResults
} from '../logic/poseDetection';

// Refs for DOM elements
const videoElement = ref(null);
const overlayCanvas = ref(null);
const currentVideoSource = ref('');
const usingWebcam = ref(false);
let mediaStream = null;
const webcamReady = ref(false); // Tracks if the webcam is fully initialized

// Detection state variables
const detectionActive = ref(false);
const detectionOptions = reactive({
  minPoseDetectionConfidence: 0.1,
  minPosePresenceConfidence: 0.1,
  minTrackingConfidence: 0.1,
  runningMode: "VIDEO",
  maxPoses: 6
});

const lastVideoTime = ref(-1);

// Default videos hosted externally
const defaultVideos = [
  { name: 'Clouds', url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/clouds.mp4' },
  { name: 'Water', url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/water.mp4' },
  { name: 'Field', url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/field.mp4' },
  { name: 'Moon', url: 'https://cdn.jsdelivr.net/gh/matipina/NCI@main/videos/moon.mp4' }
];

function updateCanvasSize() {
  const canvas = overlayCanvas.value;
  const videoWidth = videoElement.value.videoWidth;
  const videoHeight = videoElement.value.videoHeight;

  if (videoWidth && videoHeight) {
    // Set canvas dimensions to match video dimensions
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    console.log('Canvas size updated:', canvas.width, canvas.height);
  } else {
    // Fallback to window dimensions if video dimensions are not available
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log('Canvas size fallback:', canvas.width, canvas.height);
  }
}

function setupCanvas() {
  if (overlayCanvas.value && videoElement.value) {
    updateCanvasSize(); // Set initial canvas size
    window.addEventListener('resize', updateCanvasSize); // Update canvas size on window resize
  }
}

function loadDefaultVideo(url) {
  // Stop the webcam if it's active
  if (mediaStream) {
    stopWebcam();
  }

  // Set the video source to the provided URL
  usingWebcam.value = false; // Not using the webcam
  currentVideoSource.value = url;

  // Ensure the video plays after the source is set
  if (videoElement.value) {
    videoElement.value.src = url; // Set the video source
    videoElement.value.onloadedmetadata = () => {
      videoElement.value.play().catch(err => {
        console.error('Error playing video:', err);
      });

      // Update canvas size to match video dimensions
      updateCanvasSize();
    };
  }
}


// Initialize pose detection
onMounted(async () => {
  try {
    // Load the first default video
    loadDefaultVideo(defaultVideos[0].url);

    // Set up the canvas dimensions
    setupCanvas();

    // Initialize pose detection
    await initializePoseDetection(overlayCanvas.value, detectionOptions);
    console.log('Pose detection initialized');
  } catch (error) {
    console.error('Failed to initialize pose detection:', error);
  }
});



// Clean up resources when component is destroyed
onUnmounted(() => {
  if (mediaStream) {
    stopWebcam();
  }
});

// Run the detection loop
async function runDetectionLoop() {
  if (!detectionActive.value || !videoElement.value) return;

  // Ensure webcam is ready before processing
  if (usingWebcam.value && !webcamReady.value) {
    console.log('Webcam not ready yet');
    requestAnimationFrame(runDetectionLoop);
    return;
  }

  if (videoElement.value.paused || videoElement.value.ended) {
    requestAnimationFrame(runDetectionLoop);
    return;
  }

  if (lastVideoTime.value !== videoElement.value.currentTime) {
    lastVideoTime.value = videoElement.value.currentTime;

    try {
      const results = await detectPoses(videoElement.value, performance.now());
      drawPoseResults(results, overlayCanvas.value, videoElement.value);
    } catch (error) {
      console.error('Error in detection loop:', error);
    }
  }

  requestAnimationFrame(runDetectionLoop);
}

// Start/stop detection
function toggleDetection() {
  detectionActive.value = !detectionActive.value;
  if (detectionActive.value) {
    runDetectionLoop();
  }
}

async function activateWebcam() {
  try {
    // Stop any currently playing video
    if (videoElement.value) {
      videoElement.value.pause();
      currentVideoSource.value = '';
    }

    // Get webcam stream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' } // Use 'user' for front camera
    });

    // Attach stream to video element
    videoElement.value.srcObject = mediaStream;

    // Ensure the video element starts playing
    videoElement.value.onloadedmetadata = () => {
      videoElement.value.play().catch(err => {
        console.error('Error playing video:', err);
      });

      // Update canvas size to match webcam dimensions
      updateCanvasSize();

      // Set webcamReady to true
      webcamReady.value = true;
    };

    usingWebcam.value = true;
  } catch (err) {
    console.error('Error accessing webcam:', err);
    alert('Could not access webcam. Please check permissions.');
  }
}


// Stop webcam stream
function stopWebcam() {
  if (mediaStream) {
    // Stop all tracks in the media stream
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;

    // Detach the stream from the video element
    if (videoElement.value) {
      videoElement.value.srcObject = null;
    }
  }

  // Reset webcam-related state
  usingWebcam.value = false;
  webcamReady.value = false;
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
