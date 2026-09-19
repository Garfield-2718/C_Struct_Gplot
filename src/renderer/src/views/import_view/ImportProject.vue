<template>
    <div class="imv-page">
        <header class="imv-titlebar">{{ t('import.pageTitle') }}</header>
        <main class="imv-workspace">
            <section class="imv-content" aria-labelledby="imv-title">
                <h1 id="imv-title" class="imv-title">{{ t('import.title') }}</h1>
                <p class="imv-description">{{ t('import.description') }}</p>
                <div class="imv-picker-wrap">
                    <button
                        type="button"
                        class="imv-file-picker"
                        :class="{
                            'imv-file-picker-drag-over': isDragOver,
                            'imv-file-picker-open': pickerMenuOpen
                        }"
                        aria-labelledby="imv-file-label"
                        aria-describedby="imv-file-hint"
                        aria-haspopup="menu"
                        :aria-expanded="pickerMenuOpen"
                        @click="togglePickerMenu"
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
                            t('import.selectFileOrFolder')
                        }}</span>
                        <span id="imv-file-hint" class="imv-file-hint">{{
                            t('import.selectFileHint')
                        }}</span>
                    </button>
                    <ul v-show="pickerMenuOpen" class="imv-picker-menu" role="menu">
                        <li role="none">
                            <button
                                type="button"
                                role="menuitem"
                                class="imv-picker-menu-item"
                                @click="handleSelectFile"
                            >
                                <svg
                                    class="imv-picker-menu-icon"
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
                                    <path d="M6 3h8l4 4v14H6Z" />
                                    <path d="M14 3v5h4" />
                                </svg>
                                <span>{{ t('import.selectFile') }}</span>
                            </button>
                        </li>
                        <li role="none">
                            <button
                                type="button"
                                role="menuitem"
                                class="imv-picker-menu-item"
                                @click="handleSelectDirectory"
                            >
                                <svg
                                    class="imv-picker-menu-icon"
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
                                    <path
                                        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
                                    />
                                </svg>
                                <span>{{ t('import.selectFolder') }}</span>
                            </button>
                        </li>
                    </ul>
                </div>
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
    pickerMenuOpen,
    togglePickerMenu,
    handleSelectFile,
    handleSelectDirectory,
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
