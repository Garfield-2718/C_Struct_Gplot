/**
 * 红黑树服务模块：维护一棵红黑树，记录 ipc-handlers.ts 中通过 db-service 读取的
 * StructRecord 数据，对外提供独立的增删改查接口。
 *
 * 设计要点：
 * - 泛型红黑树核心（RBTree<K, V>），以 key 排序，支持 O(log n) 增删改查；
 * - 模块级单例 structRecordTree，以 hash 为键存储 StructRecord；
 * - 导出函数式接口供 ipc-handlers.ts 或其他主进程模块调用。
 */

// ─── 红黑树节点颜色 ───────────────────────────────────────────────────────────
const enum Color {
        RED = 0,
        BLACK = 1
}

// ─── 红黑树节点 ───────────────────────────────────────────────────────────────
interface RBNode<K, V> {
        key: K
        value: V
        color: Color
        left: RBNode<K, V> | null
        right: RBNode<K, V> | null
        parent: RBNode<K, V> | null
}

// ─── 泛型红黑树实现 ───────────────────────────────────────────────────────────
/**
 * 基于比较函数的红黑树，支持重复键时覆盖（update 语义）。
 * 对外暴露 insert / delete / update / find / findAll / inorder / size 等方法。
 */
export class RBTree<K, V> {
        private root: RBNode<K, V> | null = null
        private _size = 0
        private compare: (a: K, b: K) => number

        constructor(compare: (a: K, b: K) => number) {
                this.compare = compare
        }

        /** 当前树中节点数量 */
        get size(): number {
                return this._size
        }

        // ─── 增 ─────────────────────────────────────────────────────────────────
        /** 插入键值对；若键已存在则覆盖旧值并返回旧值，否则返回 null */
        insert(key: K, value: V): V | null {
                const existing = this.findNode(key)
                if (existing) {
                        const old = existing.value
                        existing.value = value
                        return old
                }
                this.bstInsert(key, value)
                return null
        }

        // ─── 删 ─────────────────────────────────────────────────────────────────
        /** 删除指定键的节点；返回被删除的值，未找到返回 null */
        delete(key: K): V | null {
                const node = this.findNode(key)
                if (!node) return null
                const value = node.value
                this.rbDelete(node)
                return value
        }

        // ─── 改 ─────────────────────────────────────────────────────────────────
        /** 更新指定键的值；键不存在则返回 false */
        update(key: K, value: V): boolean {
                const node = this.findNode(key)
                if (!node) return false
                node.value = value
                return true
        }

        // ─── 查 ─────────────────────────────────────────────────────────────────
        /** 查找指定键的值；未找到返回 undefined */
        find(key: K): V | undefined {
                const node = this.findNode(key)
                return node ? node.value : undefined
        }

        /** 判断指定键是否存在 */
        has(key: K): boolean {
                return this.findNode(key) !== null
        }

        /** 中序遍历，返回按 key 升序排列的所有值 */
        inorder(): V[] {
                const result: V[] = []
                const walk = (node: RBNode<K, V> | null): void => {
                        if (!node) return
                        walk(node.left)
                        result.push(node.value)
                        walk(node.right)
                }
                walk(this.root)
                return result
        }

        /** 中序遍历，返回按 key 升序排列的所有 [key, value] 对 */
        entries(): Array<[K, V]> {
                const result: Array<[K, V]> = []
                const walk = (node: RBNode<K, V> | null): void => {
                        if (!node) return
                        walk(node.left)
                        result.push([node.key, node.value])
                        walk(node.right)
                }
                walk(this.root)
                return result
        }

        /** 按值谓词过滤，返回所有匹配的值 */
        findAll(predicate: (value: V) => boolean): V[] {
                const result: V[] = []
                const walk = (node: RBNode<K, V> | null): void => {
                        if (!node) return
                        walk(node.left)
                        if (predicate(node.value)) result.push(node.value)
                        walk(node.right)
                }
                walk(this.root)
                return result
        }

        /** 清空整棵树 */
        clear(): void {
                this.root = null
                this._size = 0
        }

        // ─── 内部：BST 查找 ────────────────────────────────────────────────────
        private findNode(key: K): RBNode<K, V> | null {
                let current = this.root
                while (current) {
                        const cmp = this.compare(key, current.key)
                        if (cmp === 0) return current
                        current = cmp < 0 ? current.left : current.right
                }
                return null
        }

        // ─── 内部：BST 插入 + 红黑修复 ─────────────────────────────────────────
        private bstInsert(key: K, value: V): void {
                const newNode: RBNode<K, V> = {
                        key,
                        value,
                        color: Color.RED,
                        left: null,
                        right: null,
                        parent: null
                }
                if (!this.root) {
                        this.root = newNode
                        newNode.color = Color.BLACK
                        this._size++
                        return
                }
                let current: RBNode<K, V> | null = this.root
                let parent: RBNode<K, V> | null = null
                while (current) {
                        parent = current
                        const cmp = this.compare(key, current.key)
                        current = cmp < 0 ? current.left : current.right
                }
                newNode.parent = parent
                if (this.compare(key, parent!.key) < 0) {
                        parent!.left = newNode
                } else {
                        parent!.right = newNode
                }
                this._size++
                this.insertFixup(newNode)
        }

        private insertFixup(node: RBNode<K, V>): void {
                let z: RBNode<K, V> | null = node
                while (z && z.parent && z.parent.color === Color.RED) {
                        const zp = z.parent
                        const zpp = zp.parent
                        if (!zpp) break
                        if (zp === zpp.left) {
                                const uncle = zpp.right
                                if (uncle && uncle.color === Color.RED) {
                                        zp.color = Color.BLACK
                                        uncle.color = Color.BLACK
                                        zpp.color = Color.RED
                                        z = zpp
                                } else {
                                        if (z === zp.right) {
                                                z = zp
                                                this.rotateLeft(z!)
                                        }
                                        z!.parent!.color = Color.BLACK
                                        z!.parent!.parent!.color = Color.RED
                                        this.rotateRight(z!.parent!.parent!)
                                }
                        } else {
                                const uncle = zpp.left
                                if (uncle && uncle.color === Color.RED) {
                                        zp.color = Color.BLACK
                                        uncle.color = Color.BLACK
                                        zpp.color = Color.RED
                                        z = zpp
                                } else {
                                        if (z === zp.left) {
                                                z = zp
                                                this.rotateRight(z!)
                                        }
                                        z!.parent!.color = Color.BLACK
                                        z!.parent!.parent!.color = Color.RED
                                        this.rotateLeft(z!.parent!.parent!)
                                }
                        }
                }
                this.root!.color = Color.BLACK
        }

        // ─── 内部：红黑树删除 ──────────────────────────────────────────────────
        private rbDelete(node: RBNode<K, V>): void {
                this._size--
                // 寻找实际被移除或替换的节点
                let y: RBNode<K, V> = node
                let yOriginalColor = y.color
                let x: RBNode<K, V> | null
                let xParent: RBNode<K, V> | null

                if (!node.left) {
                        x = node.right
                        xParent = node.parent
                        this.transplant(node, node.right)
                } else if (!node.right) {
                        x = node.left
                        xParent = node.parent
                        this.transplant(node, node.left)
                } else {
                        // 找右子树最小节点（中序后继）
                        y = this.minimum(node.right)
                        yOriginalColor = y.color
                        x = y.right
                        if (y.parent === node) {
                                xParent = y
                        } else {
                                xParent = y.parent
                                this.transplant(y, y.right)
                                y.right = node.right
                                y.right.parent = y
                        }
                        this.transplant(node, y)
                        y.left = node.left
                        y.left.parent = y
                        y.color = node.color
                }
                if (yOriginalColor === Color.BLACK && (x || xParent)) {
                        this.deleteFixup(x, xParent)
                }
        }

        private deleteFixup(x: RBNode<K, V> | null, xParent: RBNode<K, V> | null): void {
                while (x !== this.root && (!x || x.color === Color.BLACK)) {
                        const parent = x ? x.parent : xParent
                        if (!parent) break
                        if (x === parent.left) {
                                let w = parent.right
                                if (w && w.color === Color.RED) {
                                        w.color = Color.BLACK
                                        parent.color = Color.RED
                                        this.rotateLeft(parent)
                                        w = parent.right
                                }
                                if (
                                        w &&
                                        (!w.left || w.left.color === Color.BLACK) &&
                                        (!w.right || w.right.color === Color.BLACK)
                                ) {
                                        w.color = Color.RED
                                        x = parent
                                        xParent = parent.parent
                                } else {
                                        if (w && (!w.right || w.right.color === Color.BLACK)) {
                                                if (w.left) w.left.color = Color.BLACK
                                                w.color = Color.RED
                                                this.rotateRight(w)
                                                w = parent.right
                                        }
                                        if (w) {
                                                w.color = parent.color
                                                parent.color = Color.BLACK
                                                if (w.right) w.right.color = Color.BLACK
                                        }
                                        this.rotateLeft(parent)
                                        x = this.root
                                        xParent = null
                                }
                        } else {
                                let w = parent.left
                                if (w && w.color === Color.RED) {
                                        w.color = Color.BLACK
                                        parent.color = Color.RED
                                        this.rotateRight(parent)
                                        w = parent.left
                                }
                                if (
                                        w &&
                                        (!w.right || w.right.color === Color.BLACK) &&
                                        (!w.left || w.left.color === Color.BLACK)
                                ) {
                                        w.color = Color.RED
                                        x = parent
                                        xParent = parent.parent
                                } else {
                                        if (w && (!w.left || w.left.color === Color.BLACK)) {
                                                if (w.right) w.right.color = Color.BLACK
                                                w.color = Color.RED
                                                this.rotateLeft(w)
                                                w = parent.left
                                        }
                                        if (w) {
                                                w.color = parent.color
                                                parent.color = Color.BLACK
                                                if (w.left) w.left.color = Color.BLACK
                                        }
                                        this.rotateRight(parent)
                                        x = this.root
                                        xParent = null
                                }
                        }
                }
                if (x) x.color = Color.BLACK
        }

        private transplant(u: RBNode<K, V>, v: RBNode<K, V> | null): void {
                if (!u.parent) {
                        this.root = v
                } else if (u === u.parent.left) {
                        u.parent.left = v
                } else {
                        u.parent.right = v
                }
                if (v) v.parent = u.parent
        }

        private minimum(node: RBNode<K, V>): RBNode<K, V> {
                let current = node
                while (current.left) current = current.left
                return current
        }

        // ─── 内部：旋转 ────────────────────────────────────────────────────────
        private rotateLeft(x: RBNode<K, V>): void {
                const y = x.right
                if (!y) return
                x.right = y.left
                if (y.left) y.left.parent = x
                y.parent = x.parent
                if (!x.parent) {
                        this.root = y
                } else if (x === x.parent.left) {
                        x.parent.left = y
                } else {
                        x.parent.right = y
                }
                y.left = x
                x.parent = y
        }

        private rotateRight(x: RBNode<K, V>): void {
                const y = x.left
                if (!y) return
                x.left = y.right
                if (y.right) y.right.parent = x
                y.parent = x.parent
                if (!x.parent) {
                        this.root = y
                } else if (x === x.parent.right) {
                        x.parent.right = y
                } else {
                        x.parent.left = y
                }
                y.right = x
                x.parent = y
        }
}

// ─── StructRecord 类型导入 ────────────────────────────────────────────────────
import type { StructRecord } from './db-service'

// ─── 红黑树实例：以 hash 为键存储 StructRecord ───────────────────────────────
const structRecordTree = new RBTree<string, StructRecord>((a, b) => {
        if (a < b) return -1
        if (a > b) return 1
        return 0
})

// ─── 对外导出的函数式 CRUD 接口 ──────────────────────────────────────────────

/**
 * 【增】将一条或多条 StructRecord 插入红黑树（以 hash 为键）。
 * 若 hash 已存在则覆盖旧值。返回实际新增的条数（不含覆盖）。
 */
export function treeInsert(records: StructRecord | StructRecord[]): number {
        const list = Array.isArray(records) ? records : [records]
        let inserted = 0
        for (const record of list) {
                const existed = structRecordTree.has(record.hash)
                structRecordTree.insert(record.hash, record)
                if (!existed) inserted++
        }
        return inserted
}

/**
 * 【删】按 hash 从红黑树中移除记录；返回被移除的 StructRecord 或 null。
 */
export function treeDelete(hash: string): StructRecord | null {
        return structRecordTree.delete(hash)
}

/**
 * 【改】按 hash 更新红黑树中已有记录的字段（浅合并）。
 * 键不存在时返回 false；成功时返回 true。
 */
export function treeUpdate(hash: string, partial: Partial<StructRecord>): boolean {
        const existing = structRecordTree.find(hash)
        if (!existing) return false
        const merged: StructRecord = { ...existing, ...partial, hash }
        return structRecordTree.update(hash, merged)
}

/**
 * 【查】按 hash 精确查找单条记录。
 */
export function treeFindByHash(hash: string): StructRecord | undefined {
        return structRecordTree.find(hash)
}

/**
 * 【查】按结构体名（data_type_latter）查找所有匹配记录。
 */
export function treeFindByStructName(structName: string): StructRecord[] {
        return structRecordTree.findAll((r) => r.data_type_latter === structName)
}

/**
 * 【查】按结构体名 + 类型前缀（data_type_first）精确查找。
 */
export function treeFindByType(structName: string, dataTypeFirst: string): StructRecord[] {
        return structRecordTree.findAll(
                (r) => r.data_type_latter === structName && r.data_type_first === dataTypeFirst
        )
}

/**
 * 【查】返回红黑树中所有记录（按 hash 字典序升序）。
 */
export function treeGetAll(): StructRecord[] {
        return structRecordTree.inorder()
}

/**
 * 【查】返回当前红黑树中的记录总数。
 */
export function treeGetSize(): number {
        return structRecordTree.size
}

/**
 * 清空红黑树中所有记录。
 */
export function treeClear(): void {
        structRecordTree.clear()
}
