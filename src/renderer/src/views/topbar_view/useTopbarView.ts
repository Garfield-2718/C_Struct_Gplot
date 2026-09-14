/** useTopbarView 的返回结构 */
interface TopbarViewApi {
    /** 「设置」按键点击处理 */
    handleSettingsClick: () => void
    /** 「导出」按键点击处理 */
    handleExportClick: () => void
    /** 「导入」按键点击处理 */
    handleImportClick: () => void
}

/**
 * 顶边栏的组合式函数：处理设置 / 导出 / 导入三个工具按键的点击。
 * 具体业务尚未接入，先以打桩实现占位，后续替换为真实逻辑。
 */
export function useTopbarView(): TopbarViewApi {
    /** 设置按键点击的触发逻辑（打桩）：后续在此打开设置面板 */
    function handleSettingsClick(): void {
        // TODO: 替换打桩实现，联动打开设置面板
        console.log('[topbar] 点击设置按键')
    }

    /** 导出按键点击的触发逻辑（打桩）：后续在此导出当前画布/项目 */
    function handleExportClick(): void {
        // TODO: 替换打桩实现，联动导出逻辑
        console.log('[topbar] 点击导出按键')
    }

    /** 导入按键点击的触发逻辑（打桩）：后续在此导入项目/文件 */
    function handleImportClick(): void {
        // TODO: 替换打桩实现，联动导入逻辑
        console.log('[topbar] 点击导入按键')
    }

    return {
        handleSettingsClick,
        handleExportClick,
        handleImportClick
    }
}
