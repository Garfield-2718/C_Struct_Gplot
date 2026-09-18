<template>
    <div class="bottombar-panel" :class="{ 'is-collapsed': collapsed }">
        <!-- 收起/展开手柄：展开态三角向下，收起态三角向上 -->
        <button
            class="bottombar-collapse-handle"
            :title="t(collapsed ? 'bottombar.expand' : 'bottombar.collapse')"
            :aria-label="t(collapsed ? 'bottombar.expand' : 'bottombar.collapse')"
            :aria-expanded="!collapsed"
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
                            ? t('bottombar.editModeHint')
                            : t('bottombar.selectModeHint')
                    "
                    :aria-pressed="mode === 'edit'"
                    @click="handleModeToggleClick"
                >
                    {{ t(mode === 'edit' ? 'bottombar.editMode' : 'bottombar.selectMode') }}
                </button>
                <!-- 其余工具按键：设计文档另规划 添加节点/拖动模式/导出，当前放置添加节点 -->
                <button
                    class="bottombar-tool-button"
                    :title="t('bottombar.addNode')"
                    @click="handleAddNodeClick"
                >
                    {{ t('bottombar.addNode') }}
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
            <div
                class="add-node-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-node-title"
            >
                <div id="add-node-title" class="add-node-title">{{ t('bottombar.addNode') }}</div>
                <input
                    ref="addNodeInputRef"
                    v-model="newNodeName"
                    class="add-node-input"
                    type="text"
                    :placeholder="t('bottombar.nodePlaceholder')"
                    :aria-label="t('a11y.addNodeInput')"
                    @keyup.enter="handleAddNodeConfirm"
                    @keyup.esc="handleAddNodeCancel"
                />
                <div class="add-node-actions">
                    <button class="add-node-button" @click="handleAddNodeCancel">
                        {{ t('common.cancel') }}
                    </button>
                    <button
                        class="add-node-button add-node-button-primary"
                        @click="handleAddNodeConfirm"
                    >
                        {{ t('common.confirm') }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n({ useScope: 'global' })

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
