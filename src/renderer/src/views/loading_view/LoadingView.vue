<template>
        <div class="scale-wrapper" :ref="(el) => (canvasWrapper = el as HTMLElement | null)">
                <div class="loading-page-canvas" :style="{ transform: `scale(${scale})` }">
                        <div class="loading-spinner"></div>
                        <p class="loading-text">
                                {{ "加载中" }}
                        </p>
                        <div class="debug-button-position">
                                <DebugButton @click="handleNavigateToCanvas" />
                        </div>
                </div>
        </div>
</template>

<script lang="ts" setup>
import { useLoadingView } from './useLoadingView'
import DebugButton from '@/views/debug_button/DebugButton.vue'
import './LoadingView.css'

const { canvasWrapper, scale, handleNavigateToCanvas } = useLoadingView()
</script>
