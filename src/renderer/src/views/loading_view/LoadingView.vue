<template>
    <div class="ldv-page">
        <header class="ldv-titlebar">项目加载</header>
        <main class="ldv-workspace">
            <section class="ldv-content" aria-labelledby="ldv-title">
                <div class="ldv-status" role="status" aria-live="polite" aria-atomic="true">
                    <h1 id="ldv-title" class="ldv-title">加载中</h1>
                    <p class="ldv-description">正在处理项目，请稍候。</p>
                    <div class="ldv-progress" aria-hidden="true"></div>
                </div>
            </section>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { useLoadingView } from './useLoadingView'

useLoadingView()
</script>

<style scoped src="./LoadingView.css"></style>
