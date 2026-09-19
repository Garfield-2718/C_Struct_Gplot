<template>
    <div class="hlp-page">
        <header class="hlp-titlebar">
            <button
                type="button"
                class="hlp-back-button"
                :title="t('a11y.back')"
                @click="handleBack"
            >
                <span class="hlp-back-arrow" aria-hidden="true"></span>
                <span>{{ t('common.back') }}</span>
            </button>
            <span class="hlp-titlebar-text">{{ t('help.pageTitle') }}</span>
        </header>
        <main class="hlp-workspace">
            <section class="hlp-content" aria-labelledby="hlp-title">
                <h1 id="hlp-title" class="hlp-title">{{ t('help.title') }}</h1>

                <!-- 应用信息卡片：居中展示版本/作者/项目地址 -->
                <div class="hlp-info-card" :aria-busy="isLoading">
                    <div class="hlp-info-row">
                        <span class="hlp-info-label">{{ t('help.version') }}</span>
                        <span class="hlp-info-value">{{ appVersion }}</span>
                    </div>
                    <div class="hlp-info-row">
                        <span class="hlp-info-label">{{ t('help.author') }}</span>
                        <span class="hlp-info-value">{{ appAuthor }}</span>
                    </div>
                    <div class="hlp-info-row">
                        <span class="hlp-info-label">{{ t('help.projectUrl') }}</span>
                        <a
                            class="hlp-info-value hlp-info-link"
                            :href="appProjectUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ appProjectUrl }}
                        </a>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { useHelpView } from './useHelpView'
import './HelpView.css'

const { t, appVersion, appAuthor, appProjectUrl, isLoading, handleBack } = useHelpView()
</script>
