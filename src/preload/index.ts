import { contextBridge, webUtils, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
        /** 获取拖入文件的真实本地路径（绕过上下文隔离限制） */
        getPathForFile: (file: File): string => webUtils.getPathForFile(file),
        /** CLI 集成打桩接口 */
        cli: {
                locate: (): Promise<string> => ipcRenderer.invoke('cli:locate')
        }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
        try {
                contextBridge.exposeInMainWorld('electron', electronAPI)
                contextBridge.exposeInMainWorld('api', api)
        } catch (error) {
                console.error(error)
        }
} else {
        // @ts-ignore (define in dts)
        window.electron = electronAPI
        // @ts-ignore (define in dts)
        window.api = api
}
