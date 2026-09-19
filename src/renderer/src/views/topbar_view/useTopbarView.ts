import { inject } from 'vue'
import { useRouter } from 'vue-router'
import { CANVAS_EXPORT_KEY } from '../canvas_view/captureCanvas'
import type { ExportArtifacts } from '../canvas_view/captureCanvas'
import { setExportArtifacts } from '../export_view/exportStore'

/** useTopbarView 的返回结构 */
interface TopbarViewApi {
    /** 「设置」按键点击处理 */
    handleSettingsClick: () => void
    /** 「导出」按键点击处理 */
    handleExportClick: () => Promise<void>
    /** 「帮助」按键点击处理 */
    handleHelpClick: () => void
}

/**
 * 顶边栏的组合式函数：处理设置 / 导出 / 帮助三个工具按键的点击。
 * 设置按键跳转到 /settings；帮助按键跳转到 /help；
 * 导出按键先在画布 DOM 存活时生成多格式快照产物，再跳转到 /export 导出页选择格式并保存。
 */
export function useTopbarView(): TopbarViewApi {
    const router = useRouter()

    /**
     * 画布导出能力：由 CanvasView（持有 Vue Flow 节点）provide。
     * TopbarView 是 CanvasView 的子组件，故可注入；缺省时（理论上不会发生）跳过捕获。
     */
    const captureExport = inject(CANVAS_EXPORT_KEY, null)

    /** 设置按键点击：跳转到 /settings 设置页；用户在设置页可通过「返回」按键或浏览器后退回到画布 */
    function handleSettingsClick(): void {
        void router.push('/settings')
    }

    /**
     * 导出按键点击：在画布仍存活时生成 SVG/PNG/JPEG/PDF 产物并写入导出单例，随后跳转 /export。
     * 画布为空或生成失败时写入 null，由导出页展示空态提示。
     */
    async function handleExportClick(): Promise<void> {
        let artifacts: ExportArtifacts | null = null
        if (captureExport) {
            try {
                artifacts = await captureExport()
            } catch (err) {
                console.error('[topbar] 生成导出快照失败:', err)
            }
        } else {
            console.warn('[topbar] 未注入画布导出能力，导出页将显示空态')
        }
        setExportArtifacts(artifacts)
        void router.push('/export')
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
