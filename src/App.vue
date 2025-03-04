<script setup>
import VideoDisplay from './components/VideoDisplay.vue';
</script>

<template>
  <main>
    <VideoDisplay />
  </main>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

#app {
  height: 100vh;
  width: 100vw;
}

main {
  height: 100%;
  width: 100%;
}
</style>
