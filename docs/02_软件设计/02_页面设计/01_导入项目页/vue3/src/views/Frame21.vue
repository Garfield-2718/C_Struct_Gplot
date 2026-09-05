<template>
    <div class="scroll-container">
        <div id="2_1" class="Pixso-frame-2_1 pixso-relative-no-shrink">
            <div id="3_1" class="stroke-wrapper-3_1">
                <div class="Pixso-rectangle-3_1 pixso-position-relative"></div>
                <div class="stroke-3_1"></div>
            </div>
            <p id="3_2" class="Pixso-paragraph-3_2">
                {{ "选择或拖入要处理的项目文件" }}
            </p>
            <div id="7_1" class="Pixso-vector-7_1"></div>
            <div id="7_2" class="Pixso-vector-7_2"></div>
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

.Pixso-frame-2_1 {
    width: 100%;
    height: 1080px;
    overflow: hidden;
    background-color: rgba(255, 255, 255, 1);
    mix-blend-mode: normal;
}

.Pixso-rectangle-3_1 {
    width: 100%;
    height: 100%;
    border-radius: 30px 30px 30px 30px;
    box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.25);
    background-color: rgba(222, 222, 222, 0.5);
    mix-blend-mode: normal;
}

.stroke-wrapper-3_1 {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 998px;
    height: 533px;
    transform: translateX(calc(-50% + -6px)) translateY(calc(-50% + -74.5px));
}

.stroke-3_1 {
    position: absolute;
    inset: 0px;
    border-radius: 30px 30px 30px 30px;
    pointer-events: none;
    border-width: 1px 1px 1px 1px;
    border-style: solid;
    box-sizing: border-box;
    border-color: rgba(0, 0, 0, 1);
}

.Pixso-paragraph-3_2 {
    font-size: 48px;
    font-family: "Noto Sans SC-Regular";
    font-weight: 400;
    text-align: left;
    letter-spacing: 0px;
    text-decoration: none;
    color: rgba(0, 0, 0, 1);
    width: 640px;
    height: 89px;
    position: absolute;
    left: 640px;
    top: 855px;
    mix-blend-mode: normal;
}

.Pixso-vector-7_1,
.Pixso-vector-7_2 {
    background-size: 100% 100%;
    background-repeat: no-repeat;
    position: absolute;
}

.Pixso-vector-7_1 {
    width: 331px;
    height: 3px;
    background-image: url(@/assets/images/Line_7_1.svg);
    left: 789px;
    top: 466px;
}

.Pixso-vector-7_2 {
    width: 3px;
    height: 259px;
    background-image: url(@/assets/images/Line_7_2.svg);
    left: 954px;
    top: 336px;
}
</style>
