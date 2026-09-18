import { inject, reactive, watch } from 'vue'
import type { App, InjectionKey } from 'vue'
import { cloneSettings, normalizeSettings } from '../../../shared/settings'
import type { ColorSettingKey, SettingsData, SettingsState } from '../../../shared/settings'
import { SETTINGS_SAVE_ERROR_CODE } from '../../../shared/errors'
import { setAppLocale } from '@/i18n'

// 保留原有导出路径，画布和节点组件无需改动。
export { DEFAULT_SETTINGS } from '../../../shared/settings'
export type { ColorSettingKey, SettingsData, SettingsState } from '../../../shared/settings'

/** 唯一的已应用状态；设置页草稿不直接修改此对象。 */
const settingsStore = reactive<SettingsData>(normalizeSettings(null))
let initialization: Promise<SettingsData> | undefined

/** provide/inject 的类型安全键 */
const SETTINGS_KEY: InjectionKey<SettingsData> = Symbol('global-settings')

/**
 * CSS 自定义属性映射：settings 中的颜色键 → 对应的 CSS 变量名。
 * 设置变化时自动同步到 document.documentElement，CSS 中通过 var() 引用即可响应。
 */
const CSS_VAR_MAP: Record<ColorSettingKey, string> = {
    structColor: '--color-struct',
    enumColor: '--color-enum',
    unionColor: '--color-union',
    selectedNodeBorderColor: '--color-selected-border',
    childEdgeColor: '--color-child-edge',
    parentEdgeColor: '--color-parent-edge'
}

/** 将当前设置中的颜色同步为 CSS 自定义属性（挂载到 document root） */
function syncCssVariables(settings: SettingsState): void {
    const root = document.documentElement
    for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
        const value = settings[key as ColorSettingKey]
        if (typeof value === 'string' && cssVar) {
            root.style.setProperty(cssVar, value)
        }
    }
}

/** 初始化或持久化成功后同步；不替换 store 引用，不触发路由/画布重建。 */
function applySettings(data: SettingsData): void {
    Object.assign(settingsStore, data)
    syncCssVariables(settingsStore)
    setAppLocale(settingsStore.locale)
}

/** main.ts 在挂载前等待此 Promise；重复调用复用同一次 IPC 读取。 */
export function initializeSettings(): Promise<SettingsData> {
    initialization ??= (async (): Promise<SettingsData> => {
        let loaded: unknown = null
        try {
            loaded = await window.electron.ipcRenderer.invoke('load-settings')
        } catch (err) {
            console.warn('[settings-store] 加载持久化配置失败，使用默认值:', err)
        }
        applySettings(normalizeSettings(loaded))
        return settingsStore
    })()
    return initialization
}

/** 应用级 provide/inject；根组件和设置页不再读取磁盘。 */
export function provideSettings(app: App): SettingsData {
    app.provide(SETTINGS_KEY, settingsStore)
    const stopWatching = watch(settingsStore, () => syncCssVariables(settingsStore))
    app.onUnmount(stopWatching)
    return settingsStore
}

/**
 * 捕获提交时的完整 JSON 快照；仅 true 表示保存成功。
 * reject/非 true 响应均不修改已应用状态，返回值可直接用作新的已保存快照。
 */
export async function persistSettings(draft: SettingsState): Promise<SettingsData> {
    const submitted = cloneSettings(draft)
    const saved: unknown = await window.electron.ipcRenderer.invoke('save-settings', submitted)
    if (saved !== true) throw new Error(SETTINGS_SAVE_ERROR_CODE)
    applySettings(submitted)
    return submitted
}

/** 在组件或组合式函数内消费同一个已初始化的全局状态。 */
export function useSettings(): SettingsData {
    return inject(SETTINGS_KEY, settingsStore)
}
