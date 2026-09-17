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
                <!-- 模式切换（两态按键）：在「选择模式 ⇄ 编辑模式」间切换，文字与高亮随当前模式变化 -->
                <button
                    class="bottombar-tool-button"
                    :class="{ 'bottombar-tool-button-active': mode === 'edit' }"
                    :title="
                        mode === 'edit'
                            ? '当前：编辑模式（点击切回选择模式）'
                            : '当前：选择模式（点击进入编辑模式）'
                    "
                    :aria-pressed="mode === 'edit'"
                    @click="handleModeToggleClick"
                >
                    {{ mode === 'edit' ? '编辑模式' : '选择模式' }}
                </button>
                <!-- 其余工具按键：设计文档另规划 添加节点/拖动模式/导出，当前放置添加节点 -->
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
import type { StructNodeRecord, CanvasMode } from '@/views/canvas_view/useCanvasView'
import './BottombarView.css'

/** 当前画布交互模式：由画布（useCanvasView）持有并经 CanvasView 下发，用于渲染两态按键 */
defineProps<{ mode: CanvasMode }>()

/** 向父级 CanvasView 上报：查询到的结构体记录（渲染到画布）、模式切换意图（选择 ⇄ 编辑） */
const emit = defineEmits<{
    (e: 'node-added', record: StructNodeRecord): void
    (e: 'toggle-mode'): void
}>()

/** 对话框输入框引用：本地声明并绑定到模板 ref，交由组合式函数在打开时聚焦 */
const addNodeInputRef = ref<HTMLInputElement | null>(null)

const {
    collapsed,
    handleToggleCollapse,
    handleModeToggleClick,
    handleAddNodeClick,
    isAddNodeDialogVisible,
    newNodeName,
    handleAddNodeConfirm,
    handleAddNodeCancel
} = useBottombarView(
    addNodeInputRef,
    (record) => emit('node-added', record),
    () => emit('toggle-mode')
)
</script>
