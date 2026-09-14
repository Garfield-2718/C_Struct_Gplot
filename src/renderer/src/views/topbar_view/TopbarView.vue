<template>
    <div class="topbar-panel">
        <!-- 顶边栏工具按键：设置 / 导出 / 导入，统一左对齐 -->
        <button class="topbar-tool-button" title="设置" @click="handleSettingsClick">设置</button>
        <button class="topbar-tool-button" title="导出" @click="handleExportClick">导出</button>
        <button class="topbar-tool-button" title="导入" @click="handleImportClick">导入</button>
    </div>
</template>

<script lang="ts" setup>
import { useTopbarView } from './useTopbarView'
import './TopbarView.css'

const { handleSettingsClick, handleExportClick, handleImportClick } = useTopbarView()
</script>
