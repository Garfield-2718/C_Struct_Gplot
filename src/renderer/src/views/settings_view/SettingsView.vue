<template>
    <div class="stv-page" :aria-busy="isSaving">
        <header class="stv-titlebar">
            <button
                type="button"
                class="stv-back-button"
                :title="t('a11y.back')"
                :disabled="isSaving"
                @click="handleBack"
            >
                <span class="stv-back-arrow" aria-hidden="true"></span>
                <span>{{ t('common.back') }}</span>
            </button>
            <span class="stv-titlebar-text">{{ t('settings.title') }}</span>
        </header>
        <main class="stv-workspace">
            <section class="stv-content" aria-labelledby="stv-title">
                <h1 id="stv-title" class="stv-title">{{ t('settings.title') }}</h1>
                <p class="stv-description">{{ t('settings.description') }}</p>

                <section class="stv-section">
                    <h2 class="stv-section-title">{{ t('settings.languageSection') }}</h2>
                    <div class="stv-row">
                        <label class="stv-row-label" for="stv-language">
                            {{ t('settings.language') }}
                            <span id="stv-language-hint" class="stv-row-hint">
                                {{ t('settings.languageHint') }}
                            </span>
                        </label>
                        <div class="stv-row-control">
                            <select
                                id="stv-language"
                                v-model="settings.locale"
                                class="stv-select"
                                aria-describedby="stv-language-hint"
                                :disabled="isSaving"
                            >
                                <option
                                    v-for="option in localeOptions"
                                    :key="option.value"
                                    :value="option.value"
                                    :lang="option.value"
                                >
                                    {{ option.label }}
                                </option>
                            </select>
                        </div>
                    </div>
                </section>

                <!-- ========== 分组：动画 ========== -->
                <section class="stv-section">
                    <h2 class="stv-section-title">{{ t('settings.animation') }}</h2>
                    <div class="stv-row">
                        <label class="stv-row-label" for="stv-flow-animation">
                            {{ t('settings.flowAnimation') }}
                            <span class="stv-row-hint">{{ t('settings.flowAnimationHint') }}</span>
                        </label>
                        <div class="stv-row-control">
                            <button
                                id="stv-flow-animation"
                                type="button"
                                class="stv-switch"
                                :class="{ 'is-on': settings.flowAnimationEnabled }"
                                role="switch"
                                :aria-checked="settings.flowAnimationEnabled"
                                :disabled="isSaving"
                                @click="
                                    settings.flowAnimationEnabled = !settings.flowAnimationEnabled
                                "
                            >
                                <span class="stv-switch-thumb"></span>
                            </button>
                            <span class="stv-switch-state">
                                {{
                                    settings.flowAnimationEnabled
                                        ? t('common.enabled')
                                        : t('common.disabled')
                                }}
                            </span>
                        </div>
                    </div>
                </section>

                <!-- ========== 分组：布局 ========== -->
                <section class="stv-section">
                    <h2 class="stv-section-title">{{ t('settings.layout') }}</h2>
                    <div class="stv-row">
                        <label class="stv-row-label" for="stv-node-max-width">
                            {{ t('settings.nodeWidth') }}
                            <span class="stv-row-hint">{{ t('settings.nodeWidthHint') }}</span>
                        </label>
                        <div class="stv-row-control">
                            <input
                                id="stv-node-max-width"
                                v-model.number="settings.nodeMaxWidth"
                                type="number"
                                class="stv-number-input"
                                min="120"
                                max="600"
                                step="10"
                                :disabled="isSaving"
                            />
                            <span class="stv-number-unit">px</span>
                        </div>
                    </div>
                </section>

                <!-- ========== 分组：节点颜色 ========== -->
                <section class="stv-section">
                    <h2 class="stv-section-title">{{ t('settings.nodeColors') }}</h2>
                    <div v-for="meta in nodeColorSettings" :key="meta.key" class="stv-row">
                        <label class="stv-row-label" :for="`stv-${meta.key}`">
                            {{ t(meta.label) }}
                            <span class="stv-row-hint">{{ t(meta.description) }}</span>
                        </label>
                        <div class="stv-row-control">
                            <input
                                :id="`stv-${meta.key}`"
                                v-model="settings[meta.key]"
                                type="color"
                                class="stv-color-input"
                                :disabled="isSaving"
                            />
                            <span class="stv-color-value">{{ settings[meta.key] }}</span>
                        </div>
                    </div>
                </section>

                <!-- ========== 分组：连线与选中态颜色 ========== -->
                <section class="stv-section">
                    <h2 class="stv-section-title">{{ t('settings.edgeColors') }}</h2>
                    <div v-for="meta in edgeColorSettings" :key="meta.key" class="stv-row">
                        <label class="stv-row-label" :for="`stv-${meta.key}`">
                            {{ t(meta.label) }}
                            <span class="stv-row-hint">{{ t(meta.description) }}</span>
                        </label>
                        <div class="stv-row-control">
                            <input
                                :id="`stv-${meta.key}`"
                                v-model="settings[meta.key]"
                                type="color"
                                class="stv-color-input"
                                :disabled="isSaving"
                            />
                            <span class="stv-color-value">{{ settings[meta.key] }}</span>
                        </div>
                    </div>
                </section>

                <p v-if="saveErrorMessage" class="stv-save-error" role="alert">
                    {{ saveErrorMessage }}
                </p>

                <!-- ========== 底部操作区 ========== -->
                <footer class="stv-actions">
                    <span v-if="isDirty" class="stv-dirty-hint">{{ t('settings.unsaved') }}</span>
                    <div class="stv-actions-buttons">
                        <button
                            type="button"
                            class="stv-button"
                            :disabled="isSaving"
                            @click="handleReset"
                        >
                            {{ t('common.reset') }}
                        </button>
                        <button
                            type="button"
                            class="stv-button stv-button-primary"
                            :disabled="!isDirty || isSaving"
                            @click="handleSave"
                        >
                            {{ isSaving ? t('common.saving') : t('common.save') }}
                        </button>
                    </div>
                </footer>
            </section>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { useSettingsView } from './useSettingsView'
import './SettingsView.css'

const {
    settings,
    t,
    localeOptions,
    saveErrorMessage,
    isDirty,
    isSaving,
    handleSave,
    handleReset,
    handleBack,
    nodeColorSettings,
    edgeColorSettings
} = useSettingsView()
</script>
