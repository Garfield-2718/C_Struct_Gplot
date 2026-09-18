import { computed, reactive, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DEFAULT_SETTINGS, persistSettings, useSettings } from '@/stores/settings'
import { cloneSettings, LOCALE_OPTIONS } from '../../../../shared/settings'
import type { ColorSettingKey, SettingsData, SettingsState } from '../../../../shared/settings'
import { errorMessageKey, SETTINGS_SAVE_ERROR_CODE } from '../../../../shared/errors'
import type { AppErrorCode } from '../../../../shared/errors'
import type { MessageKey } from '../../../../shared/locales/types'

// 复用全局 store 中的类型，保持向后兼容的导出
export type { SettingsState }

// 显式颜色键集合，避免将 locale 等字符串设置误认为颜色。
export type { ColorSettingKey }

/** 颜色型设置项的元数据：驱动 UI 循环渲染，避免在模板里逐个手写重复的行 */
export interface ColorSettingMeta {
    /** 对应 SettingsState 中显式声明的颜色键 */
    key: ColorSettingKey
    /** 展示标签的翻译键，在模板渲染时求值以响应语言变化 */
    label: MessageKey
    /** 简要说明的翻译键 */
    description: MessageKey
}

/** 节点颜色分组：struct / enum / union */
export const NODE_COLOR_SETTINGS: readonly ColorSettingMeta[] = Object.freeze([
    {
        key: 'structColor',
        label: 'settings.structColor',
        description: 'settings.structColorHint'
    },
    { key: 'enumColor', label: 'settings.enumColor', description: 'settings.enumColorHint' },
    { key: 'unionColor', label: 'settings.unionColor', description: 'settings.unionColorHint' }
])

/** 连线与选中态颜色分组 */
export const EDGE_COLOR_SETTINGS: readonly ColorSettingMeta[] = Object.freeze([
    {
        key: 'selectedNodeBorderColor',
        label: 'settings.selectedBorder',
        description: 'settings.selectedBorderHint'
    },
    {
        key: 'childEdgeColor',
        label: 'settings.childEdge',
        description: 'settings.childEdgeHint'
    },
    {
        key: 'parentEdgeColor',
        label: 'settings.parentEdge',
        description: 'settings.parentEdgeHint'
    }
])

/** useSettingsView 的返回结构 */
export interface SettingsViewApi {
    /** 当前编辑中的设置（响应式）：直接双向绑定到 UI 控件 */
    settings: SettingsData
    t: (key: MessageKey) => string
    localeOptions: typeof LOCALE_OPTIONS
    saveErrorMessage: ComputedRef<string>
    /** 是否存在未保存的修改：与最近一次加载/保存的快照对比 */
    isDirty: ComputedRef<boolean>
    /** 是否正在保存中：用于禁用按键防止重复提交 */
    isSaving: ComputedRef<boolean>
    /** 保存设置：通过 IPC 调用主进程写入 userData/settings.json */
    handleSave: () => Promise<void>
    /** 恢复默认：把当前编辑值重置为出厂默认，不立即持久化 */
    handleReset: () => void
    /** 返回上一页 */
    handleBack: () => void
    /** 颜色型设置项元数据：节点分组 */
    nodeColorSettings: readonly ColorSettingMeta[]
    /** 颜色型设置项元数据：连线分组 */
    edgeColorSettings: readonly ColorSettingMeta[]
}

/**
 * 设置页的组合式函数：
 * - 持有本地 reactive 设置状态，直接双向绑定到 UI；
 * - 从启动时已初始化的 store 创建草稿，仅保存时调用 IPC；
 * - 保存成功后同步到全局 store，使 CSS 变量和画布即时生效；
 * - isDirty 与 savedSnapshot 对比得出，用于禁用无意义的保存操作。
 */
export function useSettingsView(): SettingsViewApi {
    const router = useRouter()
    const globalSettings = useSettings()
    const { t } = useI18n({ useScope: 'global' })

    /** 草稿与全局已应用设置独立，保留配置中的额外 JSON 字段。 */
    const settings = reactive<SettingsData>(cloneSettings(globalSettings))

    /** 响应式快照：保存成功即触发 isDirty 重新计算。 */
    const savedSnapshot = ref<SettingsData>(cloneSettings(globalSettings))

    /** 保存中标记：避免用户重复点击导致多次 IPC 调用 */
    const savingFlag = ref(false)
    const saveErrorCode = ref<AppErrorCode | null>(null)
    const saveErrorMessage = computed(() =>
        saveErrorCode.value ? t(errorMessageKey(saveErrorCode.value)) : ''
    )

    /** 是否存在未保存修改：任一键与快照不一致即为 dirty */
    const isDirty = computed(() =>
        (Object.keys(DEFAULT_SETTINGS) as (keyof SettingsState)[]).some(
            (key) => settings[key] !== savedSnapshot.value[key]
        )
    )

    const isSaving = computed(() => savingFlag.value)

    /**
     * 保存当前设置到持久化配置文件（userData/settings.json）。
     * 通过 IPC 调用主进程写入；保存成功后同步到全局 store（触发 CSS 变量更新）并更新 savedSnapshot。
     */
    async function handleSave(): Promise<void> {
        if (savingFlag.value || !isDirty.value) return
        savingFlag.value = true
        saveErrorCode.value = null
        try {
            const submitted = await persistSettings(settings)
            savedSnapshot.value = submitted
        } catch (err) {
            // 不回滚草稿、不更新快照；提示使用当前已生效语言，而不是草稿中的语言。
            saveErrorCode.value = SETTINGS_SAVE_ERROR_CODE
            console.error('[settings] 保存设置失败:', err)
        } finally {
            savingFlag.value = false
        }
    }

    /** 恢复默认：把当前编辑值重置为出厂默认；不立即持久化，用户仍需点击「保存」 */
    function handleReset(): void {
        if (savingFlag.value) return
        Object.assign(settings, DEFAULT_SETTINGS)
    }

    /**
     * 返回上一页：优先使用浏览器历史；无历史时（如直接打开设置页）回退到画布页。
     * TODO: 若 isDirty 为 true，先弹窗提示“存在未保存修改，是否放弃？”
     */
    function handleBack(): void {
        // TODO: 若 isDirty 为 true，先弹窗提示"存在未保存修改，是否放弃？"
        if (window.history.length > 1) {
            router.back()
        } else {
            router.replace('/canvas')
        }
    }

    return {
        settings,
        t,
        localeOptions: LOCALE_OPTIONS,
        saveErrorMessage,
        isDirty,
        isSaving,
        handleSave,
        handleReset,
        handleBack,
        nodeColorSettings: NODE_COLOR_SETTINGS,
        edgeColorSettings: EDGE_COLOR_SETTINGS
    }
}
