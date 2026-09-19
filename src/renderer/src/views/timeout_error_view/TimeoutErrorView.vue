<template>
    <div class="tev-page">
        <header class="tev-titlebar">{{ t('timeout.pageTitle') }}</header>
        <main class="tev-workspace">
            <section class="tev-content" aria-labelledby="tev-title">
                <div class="tev-icon-wrap" aria-hidden="true">
                    <svg
                        class="tev-icon"
                        width="56"
                        height="56"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        focusable="false"
                    >
                        <circle cx="12" cy="13" r="8" />
                        <path d="M12 9v4l2.5 2.5" />
                        <path d="M9 2h6" />
                        <path d="M12 2v3" />
                    </svg>
                </div>
                <h1 id="tev-title" class="tev-title">{{ t('timeout.title') }}</h1>
                <p class="tev-description">{{ t('timeout.description') }}</p>
                <p v-if="timeoutInfoText" class="tev-info">{{ timeoutInfoText }}</p>
                <p class="tev-suggestion">{{ t('timeout.suggestion') }}</p>
                <details v-if="detail" class="tev-details">
                    <summary>{{ t('timeout.technicalDetails') }}</summary>
                    <pre class="tev-details-pre">{{ detail }}</pre>
                </details>
                <div class="tev-actions">
                    <button type="button" class="tev-button" @click="handleBack">
                        {{ t('timeout.backToImport') }}
                    </button>
                    <button
                        type="button"
                        class="tev-button tev-button-primary"
                        @click="handleRetry"
                    >
                        {{ t('timeout.retry') }}
                    </button>
                </div>
            </section>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useTimeoutErrorView } from './useTimeoutErrorView'

const { t } = useI18n({ useScope: 'global' })
const { timeoutInfoText, detail, handleBack, handleRetry } = useTimeoutErrorView()
</script>

<style scoped src="./TimeoutErrorView.css"></style>
