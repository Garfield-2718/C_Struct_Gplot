<template>
    <div class="topbar-panel">
        <!-- 顶边栏工具按键：设置 / 导出 / 导入，统一左对齐 -->
        <button
            class="topbar-tool-button"
            :title="t('topbar.settings')"
            @click="handleSettingsClick"
        >
            {{ t('topbar.settings') }}
        </button>
        <button class="topbar-tool-button" :title="t('topbar.export')" @click="handleExportClick">
            {{ t('topbar.export') }}
        </button>
        <button class="topbar-tool-button" :title="t('topbar.import')" @click="handleImportClick">
            {{ t('topbar.import') }}
        </button>
    </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useTopbarView } from './useTopbarView'
import './TopbarView.css'

const { t } = useI18n({ useScope: 'global' })
const { handleSettingsClick, handleExportClick, handleImportClick } = useTopbarView()
</script>
