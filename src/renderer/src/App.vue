<template>
    <router-view v-slot="{ Component }">
        <keep-alive include="CanvasView">
            <component :is="Component" />
        </keep-alive>
    </router-view>
</template>
<script lang="ts" setup>
import { getCurrentInstance } from 'vue'

window.app = getCurrentInstance()
</script>
