import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

import { DEFAULT_LOCALE, isSettingsObject, normalizeSettings } from '../shared/settings'
import type { AppLocale, SettingsData } from '../shared/settings'

// 保留 IPC 现有导入路径，设置结构统一由 shared 定义。
export type { SettingsData } from '../shared/settings'

export type SettingsLocaleSavedListener = (locale: AppLocale) => void | Promise<void>
const localeSavedListeners = new Set<SettingsLocaleSavedListener>()
let savedLocale: AppLocale | undefined

/** 主进程原生 UI 的集成点：首次调用读取配置，此后返回最近加载/保存的语言。 */
export function getSettingsLocale(): AppLocale {
    if (savedLocale === undefined) loadSettings()
    return savedLocale ?? DEFAULT_LOCALE
}

/**
 * 每次磁盘保存成功后通知（即使 locale 未变）；失败不通知，返回取消订阅函数。
 * 后续菜单/对话框可先 getSettingsLocale() 初始化，再订阅；本阶段不改原生 UI。
 */
export function onSettingsLocaleSaved(listener: SettingsLocaleSavedListener): () => void {
    localeSavedListeners.add(listener)
    return () => {
        localeSavedListeners.delete(listener)
    }
}

/**
 * 返回设置文件的绝对路径：app.getPath('userData')/settings.json。
 * Linux → ~/.config/c-struct-gplot/settings.json
 * Windows → %APPDATA%/c-struct-gplot/settings.json
 * macOS → ~/Library/Application Support/c-struct-gplot/settings.json
 */
function getSettingsFilePath(): string {
    const userDataDir = app.getPath('userData')
    mkdirSync(userDataDir, { recursive: true })
    return join(userDataDir, 'settings.json')
}

/**
 * 从磁盘加载设置；文件不存在或 JSON 解析失败时返回 null，由调用方决定回退策略。
 */
export function loadSettings(): SettingsData | null {
    try {
        const filePath = getSettingsFilePath()
        const raw = readFileSync(filePath, 'utf-8')
        const parsed: unknown = JSON.parse(raw)
        if (!isSettingsObject(parsed)) {
            savedLocale = DEFAULT_LOCALE
            return null
        }
        const settings = normalizeSettings(parsed)
        savedLocale = settings.locale
        return settings
    } catch {
        savedLocale = DEFAULT_LOCALE
        return null
    }
}

/**
 * 将设置写入磁盘（覆盖式写入，带 4 空格缩进以便人工查看/调试）。
 */
export function saveSettings(data: SettingsData): void {
    if (!isSettingsObject(data)) throw new TypeError('设置必须是完整的 JSON 对象')
    const settings = normalizeSettings(data)
    const filePath = getSettingsFilePath()
    writeFileSync(filePath, JSON.stringify(settings, null, 4), 'utf-8')
    savedLocale = settings.locale
    console.log('[Main] 设置已持久化到:', filePath)

    // 通知失败不能让已经成功的磁盘写入变成 IPC reject，避免两端语言状态不一致。
    for (const listener of localeSavedListeners) {
        try {
            void Promise.resolve(listener(settings.locale)).catch((err: unknown) => {
                console.warn('[Main] 设置语言保存通知失败:', err)
            })
        } catch (err) {
            console.warn('[Main] 设置语言保存通知失败:', err)
        }
    }
}
