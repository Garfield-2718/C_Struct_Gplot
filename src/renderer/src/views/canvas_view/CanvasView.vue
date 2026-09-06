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
                        <Controls position="top-right" />
                </VueFlow>
                <SidebarView />
                <BottombarView />
        </div>
</template>

<script lang="ts" setup>
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useCanvasView } from './useCanvasView'
import SidebarView from '@/views/sidebar_view/SidebarView.vue'
import BottombarView from '@/views/bottombar_view/BottombarView.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import './CanvasView.css'

const { nodes, edges, nodeTypes, backgroundGap, dotSize, handleViewportChange } = useCanvasView()
</script>
