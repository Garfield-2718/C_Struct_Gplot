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
                <button class="bottombar-tool-button" title="添加节点" @click="handleAddNodeClick">
                    添加节点
                </button>
            </div>
        </div>
    </div>

    <!-- 添加节点对话框：Teleport 到 body，避免底边栏 transform 影响 fixed 遮罩定位 -->
    <Teleport to="body">
        <div
            v-if="isAddNodeDialogVisible"
            class="add-node-overlay"
            @click.self="handleAddNodeCancel"
        >
            <div class="add-node-dialog" role="dialog" aria-modal="true">
                <div class="add-node-title">添加节点</div>
                <input
                    ref="addNodeInputRef"
                    v-model="newNodeName"
                    class="add-node-input"
                    type="text"
                    placeholder="请输入要新增的节点"
                    @keyup.enter="handleAddNodeConfirm"
                    @keyup.esc="handleAddNodeCancel"
                />
                <div class="add-node-actions">
                    <button class="add-node-button" @click="handleAddNodeCancel">取消</button>
                    <button
                        class="add-node-button add-node-button-primary"
                        @click="handleAddNodeConfirm"
                    >
                        确认
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useBottombarView } from './useBottombarView'
import type { StructNodeRecord } from '@/views/canvas_view/useCanvasView'
import './BottombarView.css'

/** 向父级 CanvasView 上报查询到的结构体记录，由其渲染到画布 */
const emit = defineEmits<{ (e: 'node-added', record: StructNodeRecord): void }>()

/** 对话框输入框引用：本地声明并绑定到模板 ref，交由组合式函数在打开时聚焦 */
const addNodeInputRef = ref<HTMLInputElement | null>(null)

const {
    collapsed,
    handleToggleCollapse,
    handleSelectModeClick,
    handleAddNodeClick,
    isAddNodeDialogVisible,
    newNodeName,
    handleAddNodeConfirm,
    handleAddNodeCancel
} = useBottombarView(addNodeInputRef, (record) => emit('node-added', record))
</script>
