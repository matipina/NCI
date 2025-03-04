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
import { ref, onMounted, onUnmounted } from 'vue';

// Refs for DOM elements
const videoElement = ref(null);
const overlayCanvas = ref(null);
const currentVideoSource = ref('');
const usingWebcam = ref(false);
let mediaStream = null;

// Default videos hosted externally - replace with your actual video URLs
const defaultVideos = [
  {
    name: 'Ocean Waves',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4'
  },
  {
    name: 'Clouds',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-white-sand-beach-and-palm-trees-1564-large.mp4'
  }
];

// Initialize with first default video
onMounted(() => {
  loadDefaultVideo(defaultVideos[0].url);
  setupCanvas();
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
