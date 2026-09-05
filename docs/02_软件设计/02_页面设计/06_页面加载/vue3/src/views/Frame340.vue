<template>
    <div class="scroll-container">
        <div id="3_40" class="loading-frame-3_40 pixso-relative-no-shrink">
            <p id="3_48" class="loading-paragraph-3_48 pixso-auto-size">
                {{ "加载中" }}
            </p>
            <div id="10_100" class="loading-vector-10_100"></div>
        </div>
    </div>
</template>
<script lang="ts" setup></script>
<style>
.scroll-container {
    height: 100%;
    width: 100%;
    overflow: auto;
}

.loading-frame-3_40 {
    width: 100%;
    height: 1080px;
    overflow: hidden;
    background-color: rgba(255, 255, 255, 1);
    mix-blend-mode: normal;
}

.loading-paragraph-3_48 {
    font-size: 72px;
    font-family: "Noto Sans SC-Regular";
    font-weight: 400;
    text-align: left;
    letter-spacing: 0px;
    text-decoration: none;
    color: rgba(0, 0, 0, 1);
    position: absolute;
    left: 834px;
    top: 706px;
    white-space: pre;
    flex-grow: 0;
    mix-blend-mode: normal;
}

.loading-vector-10_100 {
    width: 366.0000305175781px;
    height: 366px;
    background-image: url(@/assets/images/Variant3.svg);
    background-size: 100% 100%;
    background-repeat: no-repeat;
    position: absolute;
    left: 777px;
    top: 273px;
}
</style>
