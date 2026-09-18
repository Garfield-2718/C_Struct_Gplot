/** 语言不跟随系统；旧配置、缺失值及非法值统一回退为简体中文。 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'zh-CN'

export const LOCALE_OPTIONS: readonly { value: AppLocale; label: string }[] = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' }
]

export function isAppLocale(value: unknown): value is AppLocale {
    return value === 'zh-CN' || value === 'en-US'
}

export function normalizeLocale(value: unknown): AppLocale {
    return isAppLocale(value) ? value : DEFAULT_LOCALE
}

/** 主进程与渲染进程共用的已知设置，不依赖 Vue 或 Electron。 */
export interface SettingsState {
    locale: AppLocale
    flowAnimationEnabled: boolean
    structColor: string
    enumColor: string
    unionColor: string
    selectedNodeBorderColor: string
    childEdgeColor: string
    parentEdgeColor: string
    nodeMaxWidth: number
}

/** 额外 JSON 字段原样保留，避免新旧版本保存时丢失兼容数据。 */
export type SettingsData = SettingsState & Record<string, unknown>

/** 显式颜色键，locale 等字符串设置不得进入颜色控件或 CSS 变量映射。 */
export type ColorSettingKey =
    | 'structColor'
    | 'enumColor'
    | 'unionColor'
    | 'selectedNodeBorderColor'
    | 'childEdgeColor'
    | 'parentEdgeColor'

export const DEFAULT_SETTINGS: Readonly<SettingsState> = Object.freeze({
    locale: DEFAULT_LOCALE,
    flowAnimationEnabled: true,
    structColor: '#4a90d9',
    enumColor: '#50a050',
    unionColor: '#e8743b',
    selectedNodeBorderColor: '#ff0000',
    childEdgeColor: '#2563eb',
    parentEdgeColor: '#9333ea',
    nodeMaxWidth: 260
})

export function isSettingsObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 仅规范 locale；既有颜色/动画/宽度的覆盖语义保持不变。 */
export function normalizeSettings(value: unknown): SettingsData {
    const source = isSettingsObject(value) ? value : {}
    return { ...DEFAULT_SETTINGS, ...source, locale: normalizeLocale(source.locale) }
}

/** 设置是 JSON 数据；深复制同时去除 Vue Proxy，适用于草稿、快照与 IPC 入参。 */
export function cloneSettings(value: SettingsState): SettingsData {
    return normalizeSettings(JSON.parse(JSON.stringify(value)))
}
