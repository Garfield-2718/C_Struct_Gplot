<template>
    <div class="scale-wrapper" :ref="(el) => (canvasWrapper = el as HTMLElement | null)">
        <div class="import-page-canvas" :style="{ transform: `scale(${scale})` }">
            <div class="import-titlebar"></div>
            <div
                class="drop-zone"
                :class="{ 'drag-over': isDragOver }"
                @click="handleSelectFile"
                @dragover.prevent="isDragOver = true"
                @dragleave="isDragOver = false"
                @drop.prevent="handleDrop"
            >
                <div class="drop-zone-bg"></div>
                <div class="drop-zone-border"></div>
            </div>
            <p class="hint-text">
                {{ '选择或拖入要处理的项目文件' }}
            </p>
            <div class="debug-button-position">
                <DebugButton @click="handleNavigateToLoading" />
            </div>
            <div class="line-horizontal"></div>
            <div class="line-vertical"></div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { useImportProject } from './useImportProject'
import DebugButton from '@/views/debug_button/DebugButton.vue'
import './ImportProject.css'

const { canvasWrapper, scale, isDragOver, handleSelectFile, handleDrop, handleNavigateToLoading } =
    useImportProject()
</script>
