<template>
    <div class="canvas-wrapper">
        <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            class="node-editor"
            :node-types="nodeTypes"
            :min-zoom="0.1"
            :max-zoom="5"
            :fit-view-on-init="true"
            :fit-view-options="{ padding: 0.3 }"
            @viewport-change="handleViewportChange"
        >
            <Background variant="dots" :gap="backgroundGap" :size="dotSize" />
            <!-- 缩放控件改放右下角：顶部已被横贯的顶边栏 bar 占用，避免遮挡 -->
            <Controls position="bottom-right" />
        </VueFlow>
        <!-- 空画布提示：无节点时居中显示，pointer-events:none 不遮挡交互 -->
        <div v-if="!nodes.length" class="canvas-empty-hint">点击底部「添加节点」开始</div>
        <!-- 顶边栏：仅在主画布显示，左上角浮动，含设置/导出/导入三个左对齐按键 -->
        <TopbarView />
        <SidebarView
            :selected-node="selectedNodeData"
            :canvas-node-ids="canvasNodeIds"
            @show-node="addStructNode"
            @hide-node="removeStructNode"
        />
        <BottombarView @node-added="addStructNode" />
    </div>
</template>

<script lang="ts" setup>
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useCanvasView } from './useCanvasView'
import SidebarView from '@/views/sidebar_view/SidebarView.vue'
import BottombarView from '@/views/bottombar_view/BottombarView.vue'
import TopbarView from '@/views/topbar_view/TopbarView.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import './CanvasView.css'

const {
    nodes,
    edges,
    nodeTypes,
    backgroundGap,
    dotSize,
    handleViewportChange,
    addStructNode,
    removeStructNode,
    selectedNodeData,
    canvasNodeIds
} = useCanvasView()
</script>
