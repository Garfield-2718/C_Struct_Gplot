import type { InjectionKey } from 'vue'
import { getRectOfNodes, getTransformForBounds } from '@vue-flow/core'
import type { GraphNode } from '@vue-flow/core'
import type { ExportFormat } from '../../../../shared/export'

// html-to-image / jspdf 体积较大（合计约 900KB），且仅导出时才需要；
// 用动态 import 让其拆分为独立 chunk，避免拖慢画布首屏。
// 进一步：点击「导出」时只跑一次 toSvg（唯一依赖存活 DOM 的操作），
// jspdf 与位图编码全部延迟到导出页「保存」时才按所选格式加载/生成。

/**
 * 画布快照的中间产物：由画布页在顶栏「导出」按键点击时生成（此时画布 DOM 仍存活），
 * 存入 exportStore 单例后跳转 /export 页，由导出页在「保存」时按用户所选格式派生最终产物。
 * - svgDataUrl：html-to-image 生成的自包含 SVG data-url（已内联样式并施加捕获变换），
 *   作为所有导出格式的唯一中间源：svg 直接解码其文本；png/jpeg/pdf 在保存时按需光栅化。
 * - width / height：图形的 CSS 像素尺寸（含内边距），供导出页展示与位图/PDF 尺寸使用。
 */
export interface ExportArtifacts {
    svgDataUrl: string
    width: number
    height: number
}

/**
 * 画布导出能力的注入键：CanvasView（持有 Vue Flow nodes）在 setup 中 provide 捕获函数，
 * 其子组件 TopbarView 的 useTopbarView inject 后于「导出」按键点击时调用。
 * 用注入而非直接依赖，避免顶栏组件耦合画布内部状态。
 */
export const CANVAS_EXPORT_KEY: InjectionKey<() => Promise<ExportArtifacts | null>> =
    Symbol('canvas-export')

/** 图形四周留白（px），避免导出图紧贴边缘 */
const EXPORT_PADDING = 24
/** 位图光栅化像素比：2 倍以兼顾清晰度与体积 */
const EXPORT_PIXEL_RATIO = 2
/** 导出底色：与画布 .node-editor 背景一致，且填充 JPEG 无透明通道时的背景 */
const EXPORT_BACKGROUND = '#fafafa'
/** JPEG 压缩质量（0–1） */
const EXPORT_JPEG_QUALITY = 0.92
/** html-to-image 生成的 SVG data-url 前缀 */
const SVG_DATA_URL_PREFIX = /^data:image\/svg\+xml;charset=utf-8,/

/** 去掉 data-url 前缀，仅保留 base64 主体（找不到前缀时原样返回） */
export function stripDataUrlPrefix(dataUrl: string): string {
    const marker = 'base64,'
    const index = dataUrl.indexOf(marker)
    return index >= 0 ? dataUrl.slice(index + marker.length) : dataUrl
}

/** 解码 SVG data-url 为纯 SVG 标记文本（供 .svg 落盘） */
function decodeSvgDataUrl(dataUrl: string): string {
    return decodeURIComponent(dataUrl.replace(SVG_DATA_URL_PREFIX, ''))
}

/** 加载 data-url 为 HTMLImageElement（onload 后 resolve） */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.decoding = 'sync'
        img.src = src
    })
}

/**
 * 将中间 SVG data-url 光栅化到位图 canvas：复刻 html-to-image 的 toCanvas 行为
 * （canvas 尺寸 = CSS 尺寸 × pixelRatio，先填背景再整幅绘制），用于 png/jpeg/pdf 派生。
 */
async function rasterizeSvg(
    svgDataUrl: string,
    width: number,
    height: number,
    pixelRatio: number,
    backgroundColor: string
): Promise<HTMLCanvasElement> {
    const img = await loadImage(svgDataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width * pixelRatio))
    canvas.height = Math.max(1, Math.ceil(height * pixelRatio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建 canvas 2d 上下文')
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
}

/**
 * 基于当前画布节点生成导出中间产物（点击「导出」时调用，此时画布 DOM 仍存活）。
 * 以节点整体包围盒（含内边距）为输出尺寸，用 getTransformForBounds 计算 1:1 适配变换，
 * 仅捕获一次 .vue-flow__transformationpane（仅含节点与连线，不含缩放控件/点阵背景）得到自包含 SVG。
 * 位图/PDF 的重活延迟到导出页保存时按所选格式派生（见 buildExportPayloadData）。
 * 无节点或找不到视口元素时返回 null（导出页据此展示空态）。
 */
export async function generateExportArtifacts(nodes: GraphNode[]): Promise<ExportArtifacts | null> {
    // 捕获目标必须是 .vue-flow__transformationpane：它是 Vue Flow 真正施加
    // transform: translate(x,y) scale(zoom) 且 transform-origin:0 0 的元素，内含全部节点与连线；
    // .vue-flow__viewport 只是外层 overflow:clip 容器（无自身变换、origin 默认 50% 50%），
    // 若捕获它则 getTransformForBounds 的平移/缩放公式与实际 origin 不符，导致内容错位而导出空白。
    const viewportEl = document.querySelector<HTMLElement>('.vue-flow__transformationpane')
    if (!viewportEl || nodes.length === 0) return null

    const bounds = getRectOfNodes(nodes)
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null

    // 按需加载导出依赖：点击导出时仅需 html-to-image（jspdf 延迟到保存 PDF 时才加载）
    const { toSvg } = await import('html-to-image')

    const width = Math.max(1, Math.ceil(bounds.width + EXPORT_PADDING * 2))
    const height = Math.max(1, Math.ceil(bounds.height + EXPORT_PADDING * 2))
    // 输出尺寸即包围盒+留白。注意：getTransformForBounds 的 padding 传数字会被当作「比例」，
    // 传 24 相当于 2400% 使缩放被 clamp 到最小值而图形缩成极小（表现为空白画布）；
    // 故必须传像素字符串 '24px'，才能得到约 1:1 的适配缩放。
    const transform = getTransformForBounds(bounds, width, height, 0.1, 4, `${EXPORT_PADDING}px`)
    const captureStyle: Partial<CSSStyleDeclaration> = {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`
    }

    // 矢量中间源：自包含 SVG，透明背景（不传 backgroundColor，便于二次编辑/叠加）
    // skipFonts:true —— 结构体卡片文字用 monospace + ASCII，无需内联字体；
    // 若不加，html-to-image 会把全局 @font-face 的 17.8MB CJK 字体 base64 内联，使 SVG 膨胀到 ~27MB。
    const svgDataUrl = await toSvg(viewportEl, {
        width,
        height,
        skipFonts: true,
        style: captureStyle
    })

    return { svgDataUrl, width, height }
}

/**
 * 导出页「保存」时按所选格式，从中间产物派生最终载荷数据（延迟生成，只算需要的那一种）：
 * - svg：直接解码中间 SVG 文本；
 * - png / jpeg：将中间 SVG 光栅化到 2 倍像素比 canvas 后编码（背景已填充，无透明变黑问题）；
 * - pdf：动态加载 jsPDF，以图形 CSS 像素尺寸建单页（pt），嵌入高清 PNG。
 * 返回 ExportSavePayload 所需的 text（svg）或 dataBase64（去前缀的 base64 主体）。
 */
export async function buildExportPayloadData(
    artifacts: ExportArtifacts,
    format: ExportFormat
): Promise<{ text?: string; dataBase64?: string }> {
    if (format === 'svg') {
        return { text: decodeSvgDataUrl(artifacts.svgDataUrl) }
    }

    const canvas = await rasterizeSvg(
        artifacts.svgDataUrl,
        artifacts.width,
        artifacts.height,
        EXPORT_PIXEL_RATIO,
        EXPORT_BACKGROUND
    )

    if (format === 'png') {
        return { dataBase64: stripDataUrlPrefix(canvas.toDataURL('image/png')) }
    }
    if (format === 'jpeg') {
        return {
            dataBase64: stripDataUrlPrefix(canvas.toDataURL('image/jpeg', EXPORT_JPEG_QUALITY))
        }
    }

    // pdf：仅在真正保存 PDF 时才加载 jsPDF
    const { jsPDF } = await import('jspdf')
    const { width, height } = artifacts
    const pdf = new jsPDF({
        orientation: width >= height ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [width, height],
        compress: true
    })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height)
    return { dataBase64: stripDataUrlPrefix(pdf.output('datauristring')) }
}
