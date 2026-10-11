<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** URL of a pre-built SVG, e.g. `/diagrams/flow.svg` (served from `public/`). */
  src: string
  alt?: string
  /** CSS width of the diagram. */
  width?: string
}>(), { alt: '', width: '100%' })

const style = computed(() => ({ width: props.width }))
</script>

<template>
  <img class="svg-diagram" :src="src" :alt="alt" :style="style">
</template>

<style scoped>
.svg-diagram {
  display: block;
  margin: 0 auto;
  height: auto;
}
</style>
