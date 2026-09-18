import type { zhCN } from './zh-CN'

type WidenMessages<T> = {
    -readonly [Key in keyof T]: T[Key] extends string ? string : WidenMessages<T[Key]>
}

/** 英文必须覆盖中文所有命名空间与键，不能用任意字符串索引绕过检查。 */
export type MessageSchema = WidenMessages<typeof zhCN>
export type MessageKey = {
    [Namespace in keyof MessageSchema]: `${Namespace}.${keyof MessageSchema[Namespace] & string}`
}[keyof MessageSchema]

export type TranslationParams = Record<string, string | number>

export type PlaceholderNames<Text extends string> =
    Text extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholderNames<Rest> : never

/** 双向比较命名插值集合：允许语序不同，不允许英文遗漏或新增参数。 */
export type MatchingPlaceholders<Source, Target> = {
    [Key in keyof Source]: Key extends keyof Target
        ? Source[Key] extends string
            ? Target[Key] extends string
                ? [PlaceholderNames<Source[Key]>] extends [PlaceholderNames<Target[Key]>]
                    ? [PlaceholderNames<Target[Key]>] extends [PlaceholderNames<Source[Key]>]
                        ? Target[Key]
                        : never
                    : never
                : never
            : MatchingPlaceholders<Source[Key], Target[Key]>
        : never
}
