<template>
    <div class="evw-page" :aria-busy="isSaving">
        <header class="evw-titlebar">
            <button
                type="button"
                class="evw-back-button"
                :title="t('a11y.back')"
                :disabled="isSaving"
                @click="handleBack"
            >
                <span class="evw-back-arrow" aria-hidden="true"></span>
                <span>{{ hasContent ? t('common.back') : t('export.backToCanvas') }}</span>
            </button>
            <span class="evw-titlebar-text">{{ t('export.pageTitle') }}</span>
        </header>
        <main class="evw-workspace">
            <!-- 有可导出内容：格式选择 + 文件名 + 导出 -->
            <section v-if="hasContent" class="evw-content" aria-labelledby="evw-title">
                <h1 id="evw-title" class="evw-title">{{ t('export.title') }}</h1>
                <p class="evw-description">{{ t('export.description') }}</p>

                <section class="evw-section">
                    <h2 class="evw-section-title">{{ t('export.formatSection') }}</h2>
                    <div
                        class="evw-format-list"
                        role="radiogroup"
                        :aria-label="t('export.formatSection')"
                    >
                        <label
                            v-for="option in formatOptions"
                            :key="option.value"
                            class="evw-format-item"
                            :class="{ 'is-selected': selectedFormat === option.value }"
                        >
                            <input
                                v-model="selectedFormat"
                                class="evw-format-radio"
                                type="radio"
                                name="evw-format"
                                :value="option.value"
                                :disabled="isSaving"
                            />
                            <span class="evw-format-text">
                                <span class="evw-format-label">{{ t(option.label) }}</span>
                                <span class="evw-format-hint">{{ t(option.hint) }}</span>
                            </span>
                        </label>
                    </div>
                </section>

                <section class="evw-section">
                    <div class="evw-row">
                        <label class="evw-row-label" for="evw-file-name">
                            {{ t('export.fileName') }}
                            <span class="evw-row-hint">{{ t('export.fileNameHint') }}</span>
                        </label>
                        <div class="evw-row-control">
                            <input
                                id="evw-file-name"
                                v-model="fileName"
                                type="text"
                                class="evw-text-input"
                                :disabled="isSaving"
                            />
                        </div>
                    </div>
                    <p v-if="dimensionText" class="evw-dimension">{{ dimensionText }}</p>
                </section>

                <p v-if="successMessage" class="evw-success" role="status">
                    {{ successMessage }}
                </p>
                <p v-if="errorMessage" class="evw-error" role="alert">
                    {{ errorMessage }}
                </p>

                <footer class="evw-actions">
                    <button
                        type="button"
                        class="evw-button evw-button-primary"
                        :disabled="isSaving"
                        @click="handleSave"
                    >
                        {{ isSaving ? t('export.saving') : t('export.save') }}
                    </button>
                </footer>
            </section>

            <!-- 空态：画布为空或快照生成失败 -->
            <section v-else class="evw-content evw-empty" aria-labelledby="evw-empty-title">
                <h1 id="evw-empty-title" class="evw-title">{{ t('export.emptyTitle') }}</h1>
                <p class="evw-description">{{ t('export.emptyDescription') }}</p>
                <button type="button" class="evw-button evw-button-primary" @click="handleBack">
                    {{ t('export.backToCanvas') }}
                </button>
            </section>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { useExportView } from './useExportView'
import './ExportView.css'

defineOptions({ name: 'ExportView' })

const {
    t,
    hasContent,
    dimensionText,
    formatOptions,
    selectedFormat,
    fileName,
    isSaving,
    successMessage,
    errorMessage,
    handleSave,
    handleBack
} = useExportView()
</script>
