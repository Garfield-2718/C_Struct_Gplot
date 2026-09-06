<template>
        <div class="bottombar-panel" :class="{ 'is-collapsed': collapsed }">
                <!-- 收起/展开手柄：展开态三角向下，收起态三角向上 -->
                <button
                        class="bottombar-collapse-handle"
                        :title="collapsed ? '展开底边栏' : '收起底边栏'"
                        @click="handleToggleCollapse"
                >
                        <span class="bottombar-collapse-arrow"></span>
                </button>
                <div class="bottombar-tools-wrapper">
                        <div class="bottombar-tools">
                                <!-- 工具按键：设计文档规划为 选择模式/添加节点/拖动模式/导出，当前放置前两个 -->
                                <button
                                        class="bottombar-tool-button"
                                        title="选择模式"
                                        @click="handleSelectModeClick"
                                >
                                        选择模式
                                </button>
                                <button
                                        class="bottombar-tool-button"
                                        title="添加节点"
                                        @click="handleAddNodeClick"
                                >
                                        添加节点
                                </button>
                        </div>
                </div>
        </div>
</template>

<script lang="ts" setup>
import { useBottombarView } from './useBottombarView'
import './BottombarView.css'

const { collapsed, handleToggleCollapse, handleSelectModeClick, handleAddNodeClick } =
        useBottombarView()
</script>
