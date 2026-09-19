<template>
    <div
        ref="canvasRoot"
        class="canvas-wrapper"
        :class="{ 'canvas-edit-mode': isEditMode }"
        @keydown.capture="captureCanvasKeydown"
    >
        <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            class="node-editor"
            :aria-label="t('a11y.canvas')"
            :node-types="nodeTypes"
            :edge-types="edgeTypes"
            :min-zoom="0.1"
            :max-zoom="5"
            :fit-view-on-init="true"
            :fit-view-options="{ padding: 0.3 }"
            :edges-updatable="isEditMode"
            :nodes-connectable="isEditMode"
            :edges-selectable="isEditMode"
            :delete-key-code="null"
            @viewport-change="handleViewportChange"
            @edge-update="handleEdgeUpdate"
            @connect="handleConnect"
        >
            <Background variant="dots" :gap="backgroundGap" :size="dotSize" />
            <!-- 缩放控件改放右下角：顶部已被横贯的顶边栏 bar 占用，避免遮挡 -->
            <Controls position="bottom-right">
                <template #control-zoom-in>
                    <ControlButton
                        class="vue-flow__controls-zoomin"
                        :title="t('canvas.zoomIn')"
                        :aria-label="t('canvas.zoomIn')"
                        :disabled="maxZoomReached"
                        @click="zoomIn"
                    >
                        <svg viewBox="0 0 32 32" aria-hidden="true">
                            <path
                                d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z"
                            />
                        </svg>
                    </ControlButton>
                </template>
                <template #control-zoom-out>
                    <ControlButton
                        class="vue-flow__controls-zoomout"
                        :title="t('canvas.zoomOut')"
                        :aria-label="t('canvas.zoomOut')"
                        :disabled="minZoomReached"
                        @click="zoomOut"
                    >
                        <svg viewBox="0 0 32 5" aria-hidden="true">
                            <path d="M0 0h32v4.2H0z" />
                        </svg>
                    </ControlButton>
                </template>
                <template #control-fit-view>
                    <ControlButton
                        class="vue-flow__controls-fitview"
                        :title="t('canvas.fitView')"
                        :aria-label="t('canvas.fitView')"
                        @click="fitView"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M2 2h7v3H5v4H2zm13 0h7v7h-3V5h-4zM2 15h3v4h4v3H2zm17 0h3v7h-7v-3h4z"
                            />
                        </svg>
                    </ControlButton>
                </template>
                <template #control-interactive>
                    <ControlButton
                        class="vue-flow__controls-interactive"
                        :title="
                            t(
                                isInteractive
                                    ? 'canvas.lockInteractivity'
                                    : 'canvas.unlockInteractivity'
                            )
                        "
                        :aria-label="
                            t(
                                isInteractive
                                    ? 'canvas.lockInteractivity'
                                    : 'canvas.unlockInteractivity'
                            )
                        "
                        :aria-pressed="!isInteractive"
                        @click="toggleInteractive"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                v-if="isInteractive"
                                d="M17 9V6a5 5 0 0 0-9.5-2.2L10 5a2 2 0 0 1 4 1v3H5v13h14V9zM11 14h2v4h-2z"
                            />
                            <path
                                v-else
                                d="M7 9V6a5 5 0 0 1 10 0v3h2v13H5V9zm3 0h4V6a2 2 0 0 0-4 0zm1 5v4h2v-4z"
                            />
                        </svg>
                    </ControlButton>
                </template>
            </Controls>
        </VueFlow>
        <!-- 空画布提示：无节点时居中显示，pointer-events:none 不遮挡交互 -->
        <div v-if="!nodes.length" class="canvas-empty-hint">{{ t('canvas.emptyHint') }}</div>
        <!-- 顶边栏：仅在主画布显示，左上角浮动，含设置/导出/导入三个左对齐按键 -->
        <TopbarView />
        <SidebarView
            :selected-node="selectedNodeData"
            :canvas-node-ids="canvasNodeIds"
            @show-node="addStructNode"
            @hide-node="removeStructNode"
        />
        <BottombarView
            :mode="canvasMode"
            @node-added="addStructNode"
            @toggle-mode="toggleCanvasMode"
        />
    </div>
</template>

<script lang="ts" setup>
import { ref, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { ControlButton, Controls } from '@vue-flow/controls'
import { useCanvasView } from './useCanvasView'
import { useCanvasI18n } from './useCanvasI18n'
import { CANVAS_EXPORT_KEY } from './captureCanvas'
import SidebarView from '@/views/sidebar_view/SidebarView.vue'
import BottombarView from '@/views/bottombar_view/BottombarView.vue'
import TopbarView from '@/views/topbar_view/TopbarView.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import './CanvasView.css'

/** 显式声明组件名：与 App.vue 中 <keep-alive include="CanvasView"> 匹配，确保导航到设置页时画布状态不被销毁 */
defineOptions({ name: 'CanvasView' })

const {
    nodes,
    edges,
    nodeTypes,
    edgeTypes,
    backgroundGap,
    dotSize,
    handleViewportChange,
    handleEdgeUpdate,
    handleConnect,
    addStructNode,
    removeStructNode,
    selectedNodeData,
    canvasNodeIds,
    canvasMode,
    toggleCanvasMode,
    isEditMode,
    captureExport
} = useCanvasView()

// 向子组件（顶栏）提供画布导出能力：顶栏「导出」按键点击时画布 DOM 仍存活，可捕获完整快照
provide(CANVAS_EXPORT_KEY, captureExport)

const canvasRoot = ref<HTMLElement | null>(null)
const { t } = useI18n({ useScope: 'global' })
const {
    minZoomReached,
    maxZoomReached,
    isInteractive,
    zoomIn,
    zoomOut,
    fitView,
    toggleInteractive,
    captureCanvasKeydown
} = useCanvasI18n(canvasRoot)
</script>
