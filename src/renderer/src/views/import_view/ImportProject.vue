<template>
    <div class="imv-page">
        <header class="imv-titlebar">项目导入</header>
        <main class="imv-workspace">
            <section class="imv-content" aria-labelledby="imv-title">
                <h1 id="imv-title" class="imv-title">导入项目</h1>
                <p class="imv-description">从本地选择项目文件以开始处理。</p>
                <button
                    type="button"
                    class="imv-file-picker"
                    :class="{ 'imv-file-picker-drag-over': isDragOver }"
                    aria-labelledby="imv-file-label"
                    aria-describedby="imv-file-hint"
                    @click="handleSelectFile"
                    @dragover.prevent="isDragOver = true"
                    @dragleave="isDragOver = false"
                    @drop.prevent="handleDrop"
                >
                    <svg
                        class="imv-file-icon"
                        width="40"
                        height="48"
                        viewBox="0 0 40 48"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path d="M9 3h15l9 9v33H7V3h2Z" />
                        <path d="M24 3v10h9M13 23h14M13 30h14M13 37h8" />
                    </svg>
                    <span id="imv-file-label" class="imv-file-label">选择项目文件</span>
                    <span id="imv-file-hint" class="imv-file-hint">打开文件选择窗口</span>
                </button>
                <div class="imv-secondary-action">
                    <div class="imv-secondary-divider" aria-hidden="true">或</div>
                    <button
                        type="button"
                        class="imv-db-picker"
                        title="选择本地已有的 .db 数据库文件直接载入"
                        @click="handleSelectDb"
                    >
                        <svg
                            class="imv-db-icon"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <ellipse cx="12" cy="5" rx="8" ry="3" />
                            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                            <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
                        </svg>
                        <span class="imv-db-label">导入已有数据库 (.db)</span>
                    </button>
                </div>
            </section>
        </main>
        <ErrorPrompt
            :visible="errorVisible"
            :title="errorTitle"
            :message="errorMessage"
            @close="handleDismissError"
        />
    </div>
</template>

<script lang="ts" setup>
import { useImportProject } from './useImportProject'
import ErrorPrompt from '@/views/error_prompt/ErrorPrompt.vue'

const {
    isDragOver,
    handleSelectFile,
    handleSelectDb,
    handleDrop,
    errorVisible,
    errorTitle,
    errorMessage,
    handleDismissError
} = useImportProject()
</script>

<style scoped src="./ImportProject.css"></style>
