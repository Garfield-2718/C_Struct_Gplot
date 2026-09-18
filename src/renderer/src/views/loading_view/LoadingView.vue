<template>
    <div class="ldv-page">
        <header class="ldv-titlebar">{{ t('loading.pageTitle') }}</header>
        <main class="ldv-workspace">
            <section class="ldv-content" aria-labelledby="ldv-title">
                <div class="ldv-status" role="status" aria-live="polite" aria-atomic="true">
                    <h1 id="ldv-title" class="ldv-title">{{ t('loading.title') }}</h1>
                    <p class="ldv-description">{{ t('loading.description') }}</p>
                    <div class="ldv-progress" aria-hidden="true"></div>
                </div>
            </section>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useLoadingView } from './useLoadingView'

const { t } = useI18n({ useScope: 'global' })
useLoadingView()
</script>

<style scoped src="./LoadingView.css"></style>
