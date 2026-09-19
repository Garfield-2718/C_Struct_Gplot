import { useRouter } from 'vue-router'

/** useTopbarView 的返回结构 */
interface TopbarViewApi {
    /** 「设置」按键点击处理 */
    handleSettingsClick: () => void
    /** 「导出」按键点击处理 */
    handleExportClick: () => void
    /** 「帮助」按键点击处理 */
    handleHelpClick: () => void
}

/**
 * 顶边栏的组合式函数：处理设置 / 导出 / 帮助三个工具按键的点击。
 * 设置按键已接入路由跳转到 /settings；帮助按键跳转到 /help；导出尚未接入，仍以打桩实现占位。
 */
export function useTopbarView(): TopbarViewApi {
    const router = useRouter()

    /** 设置按键点击：跳转到 /settings 设置页；用户在设置页可通过「返回」按键或浏览器后退回到画布 */
    function handleSettingsClick(): void {
        void router.push('/settings')
    }

    /** 导出按键点击的触发逻辑（打桩）：后续在此导出当前画布/项目 */
    function handleExportClick(): void {
        // TODO: 替换打桩实现，联动导出逻辑
        console.log('[topbar] 点击导出按键')
    }

    /** 帮助按键点击：跳转到 /help 帮助页，展示应用作者与版本信息 */
    function handleHelpClick(): void {
        void router.push('/help')
    }

    return {
        handleSettingsClick,
        handleExportClick,
        handleHelpClick
    }
}
