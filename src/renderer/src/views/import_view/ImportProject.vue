<template>
    <div class="imv-page">
        <header class="imv-titlebar">{{ t('import.pageTitle') }}</header>
        <main class="imv-workspace">
            <section class="imv-content" aria-labelledby="imv-title">
                <h1 id="imv-title" class="imv-title">{{ t('import.title') }}</h1>
                <p class="imv-description">{{ t('import.description') }}</p>
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
                    <span id="imv-file-label" class="imv-file-label">{{
                        t('import.selectFile')
                    }}</span>
                    <span id="imv-file-hint" class="imv-file-hint">{{
                        t('import.selectFileHint')
                    }}</span>
                </button>
                <div class="imv-secondary-action">
                    <div class="imv-secondary-divider" aria-hidden="true">{{ t('common.or') }}</div>
                    <button
                        type="button"
                        class="imv-db-picker"
                        :title="t('import.selectDatabaseHint')"
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
                        <span class="imv-db-label">{{ t('import.selectDatabase') }}</span>
                    </button>
                </div>
            </section>
        </main>
        <ErrorPrompt
            :visible="errorVisible"
            :title="errorTitle"
            :message="errorMessage"
            :detail="errorDetail"
            @close="handleDismissError"
        />
    </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useImportProject } from './useImportProject'
import ErrorPrompt from '@/views/error_prompt/ErrorPrompt.vue'

const { t } = useI18n({ useScope: 'global' })
const {
    isDragOver,
    handleSelectFile,
    handleSelectDb,
    handleDrop,
    errorVisible,
    errorTitle,
    errorMessage,
    errorDetail,
    handleDismissError
} = useImportProject()
</script>

<style scoped src="./ImportProject.css"></style>
