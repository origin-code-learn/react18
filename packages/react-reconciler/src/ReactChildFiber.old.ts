import { getIteratorFn, REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, REACT_LAZY_TYPE, REACT_PORTAL_TYPE } from "shared/ReactSymbols"
import { Lanes } from "./ReactFiberLane.old"
import { Fiber } from "./ReactInternalTypes"
import { ChildDeletion, Forked, Placement } from "./ReactFiberFlags"
import { ReactElement } from "shared/ReactElementType"
import { TypeOfMode } from "./ReactTypeOfMode"
import { createFiberFromElement, createFiberFromFragment, createFiberFromPortal, createFiberFromText, createWorkInProgress } from "./ReactFiber.old"
import isArray from "shared/isArray"
import { ClassComponent, Fragment, HostPortal, HostText } from "./ReactWorkTags"
import { ReactPortal } from "shared/ReactTypes"
import { getIsHydrating } from "./ReactFiberHydrationContext.old"

function throwOnInvalidObjectType(returnFiber: Fiber, newChild: Object) {
    const childString = Object.prototype.toString.call(newChild);
    throw new Error('ChildReconciler 调合阶段出错了!')
}

function resolveLazy (lazyType) {
    const payload = lazyType._payload
    const init = lazyType._init
    return init(payload)
}

function ChildReconciler(shouldTrackSideEffects) {
    function deleteChild(returnFiber: Fiber, childToDelete: Fiber) {
        if (!shouldTrackSideEffects) {
            return
        }
        const deletions = returnFiber.deletions
        if (deletions === null) {
            returnFiber.deletions = [childToDelete]
            returnFiber.flags |= ChildDeletion
        } else {
            deletions.push(childToDelete)
        }
        
    }

    function mapRemainingChildren(
        returnFiber: Fiber,
        currentFirstChild: Fiber
    ): Map<string | number, Fiber> {
        const existingChildren: Map<string | number, Fiber> = new Map()
        let existingChild: any = currentFirstChild
        while (existingChild !== null) {
            if (existingChild.key !== null) {
                existingChildren.set(existingChild.key, existingChild)
            } else {
                existingChildren.set(existingChild.index, existingChild)
            }
            existingChild = existingChild.sibling
        }
        return existingChildren
    }

    function useFiber(
        fiber: Fiber,
        pendingProps: any
    ): Fiber {
        const clone = createWorkInProgress(fiber, pendingProps)
        clone.index = 0
        clone.sibling = null
        return clone
    }

    // 更新文本节点
    function updateTextNode(
        returnFiber: Fiber,   // 父 Fiber 节点
        current: Fiber | null, // 旧的文本 Fiber 节点（可能为 null）
        textContent: string, // 新的文本内容
        lanes: Lanes  // 本次更新的优先级通道
    ) {
        // 1. 若旧节点不存在，或旧节点不是文本节点（HostText），则创建新节点
        if (current === null || current.tag !== HostText) {
            // 创建新的文本 Fiber 节点（HostText 类型）
            const created = createFiberFromText(textContent, returnFiber.mode, lanes)
            created.return = returnFiber  // 设置父节点指针
            return created
        } else {
            // 2. 若旧节点是文本节点，复用并更新内容
            const existing = useFiber(current, textContent) // 复用旧节点的结构
            existing.return = returnFiber
            return existing
        }
    }

    // 更新元素节点
    function updateElement(
        returnFiber: Fiber,
        current: Fiber | null,
        element: ReactElement,
        lanes: Lanes
    ): Fiber {
        const elementType = element.type  // // 新元素的类型（如 'div'、MyComponent）
        // 1. 特殊处理：若元素是 Fragment（React.Fragment）
        if (elementType === REACT_FRAGMENT_TYPE) {
            return updateFragment(returnFiber, current, element.props.children, lanes, element.key)
        }
        // 2. 若旧节点存在，检查是否可复用
        if (current !== null) {
            if (
                current.elementType === elementType || 
                (typeof elementType === 'object' && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current.type) 
            ) {
                const existing = useFiber(current, element.props)
                existing.ref = coerceRef(returnFiber, current, element)
                existing.return = returnFiber
                return existing
            }
        }
        // 3. 无法复用旧节点，创建新的 Fiber 节点
        const created: any = createFiberFromElement(element, returnFiber.mode, lanes)
        // 处理 ref
        created.ref = coerceRef(returnFiber, current, element)
        // 设置父节点指针
        created.return = returnFiber
        return created
    }

    function updatePortal(
        returnFiber: Fiber,
        current: Fiber | null,
        portal: ReactPortal,
        lanes: Lanes
    ): Fiber {
        if (
            current === null ||   // 旧节点不存在
            current.tag !== HostPortal ||  // 旧节点不是 Portal 类型
            current.stateNode.containerInfo !== portal.containerInfo ||  // 目标容器不同
            current.stateNode.implementation !== portal.implementation  // 实现方式不同
        ) {
            // 创建新的 Portal Fiber 节点
            const created = createFiberFromPortal(portal, returnFiber.mode, lanes)
            created.return = returnFiber
            return created
        } else {
            // 2. 复用旧节点，更新子节点
            // 复用旧节点结构，将子节点更新为新 Portal 的 children
            const existing = useFiber(current, portal.children || [])
            existing.return = returnFiber
            return existing
        }
    }

    function updateFragment(
        returnFiber: Fiber,
        current: Fiber | null,
        fragment: Iterable<any>,
        lanes: Lanes,
        key: null | string
    ): Fiber {
        // 1. 若旧节点不存在，或旧节点不是文本节点（Fragment），则创建新节点
        if (current === null || current.tag !== Fragment) {
            const created = createFiberFromFragment(fragment, returnFiber.mode, lanes, key)
            created.return = returnFiber
            return created
        } else {
            // 2. 若旧节点是文本节点，复用并更新内容
            const existing = useFiber(current, fragment)
            existing.return = returnFiber
            return existing
        }
    }

    // 判断是否可复用旧节点，返回 null 表示无法复用
    function updateSlot(
        returnFiber: Fiber,
        oldFiber: Fiber | null,
        newChild: any,
        lanes: Lanes
    ): Fiber | null {
        const key = oldFiber !== null ? oldFiber.key : null
        // 1. 处理新节点为非空字符串或数字（文本节点）
        if (
            (typeof newChild === 'string' && newChild !== '') ||
            typeof newChild === 'number'
        ) {
            if (key !== null) {
                return null
            }
            // 复用旧节点（若存在）或创建新文本节点的 Fiber
            return updateTextNode(returnFiber, oldFiber, '' + newChild, lanes)
        }

        // 2. 处理新节点为对象（可能是 React 元素、Portal 等）
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                // 2.1 React 元素（如 <div />）
                case REACT_ELEMENT_TYPE: {
                    if (newChild.key === key) {
                        return updateElement(returnFiber, oldFiber, newChild, lanes)
                    } else {
                        return null
                    }
                }
                // 2.2 Portal 节点（React.createPortal 创建）
                case REACT_PORTAL_TYPE: {
                    if (newChild.key === key) {
                        return updatePortal(returnFiber, oldFiber, newChild, lanes)
                    } else {
                        return null
                    }
                }
                // 2.3 懒加载组件（React.lazy 创建）
                case REACT_LAZY_TYPE: {
                    const payload = newChild._payload
                    const init = newChild._init
                    // 解析懒加载组件的实际内容，递归调用 updateSlot
                    return updateSlot(returnFiber, oldFiber, init(payload), lanes)
                }
            }
            // 2.4 处理数组或可迭代对象（如 [child1, child2]）
            if (isArray(newChild) || getIteratorFn(newChild)) {
                // 数组/可迭代对象无 key 时才能复用旧节点（若旧节点有 key 则无法复用）
                if (key !== null) {
                    return null
                }
                return updateFragment(returnFiber, oldFiber, newChild, lanes, null)
            }

            // 其他无效对象类型，抛出错误
            throwOnInvalidObjectType(returnFiber, newChild)
        }
        // 所有条件不匹配，返回 null（无法复用旧节点）
        return null
    }

    // updateFromMap 是 React 协调阶段中从现有节点映射表（existingChildren）中查找可复用节点并更新的核心函数。当新旧节点数组对比进入 “剩余节点处理” 阶段（如列表元素重排），React 会将未匹配的旧节点存入 Map 结构（existingChildren），而 updateFromMap 则负责根据新节点的类型和 key 从该映射表中查找匹配的旧节点，复用并更新其属性，以最小化节点重建开销
    function updateFromMap(
        existingChildren: Map<string | number, Fiber>,
        returnFiber: Fiber,
        newIdx: number,
        newChild: any,
        lanes: Lanes
    ): Fiber | null {
        // 1. 处理文本节点（非空字符串或数字）
        if (
            (typeof newChild === 'string' && newChild !== '') ||
            typeof newChild === 'number'
        ) {
            // 文本节点无 key，通过新索引（newIdx）从映射表查找匹配旧节点
            const matchedFiber = existingChildren.get(newIdx) || null
            // 复用并更新文本节点
            return updateTextNode(returnFiber, matchedFiber, '' + newChild, lanes)
        }
        // 2. 处理对象类型节点（React 元素、Portal 等）
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                // 2.1 React 元素（如 <div />、自定义组件）
                case REACT_ELEMENT_TYPE: {
                    // 生成查找 key：有 key 用 key，无 key 用新索引（newIdx）
                    const key = newChild.key === null ? newIdx : newChild.key
                    // 从映射表查找匹配的旧节点
                    const matchedFiber = existingChildren.get(key) || null
                    // 复用并更新元素节点
                    return updateElement(returnFiber, matchedFiber, newChild, lanes)
                }
                // 2.2 Portal 节点（React.createPortal 创建）
                case REACT_PORTAL_TYPE: {
                    // 同理，用 key 或新索引查找
                    const key = newChild.key === null ? newIdx : newChild.key
                    const matchedFiber = existingChildren.get(key) || null
                    return updatePortal(returnFiber, matchedFiber, newChild, lanes)
                }
                // 2.3 懒加载组件（React.lazy 创建）
                case REACT_LAZY_TYPE: {
                    const payload = newChild._payload
                    const init = newChild._init
                    // 解析懒加载组件的实际内容，递归调用 updateFromMap
                    return updateFromMap(existingChildren, returnFiber, newChild, init(payload), lanes)
                }
            }

            // 2.4 数组或可迭代对象（如 [child1, child2]）
            if (isArray(newChild) || getIteratorFn(newChild)) {
                // 无 key 时用新索引查找匹配的 Fragment 节点
                const matchedFiber = existingChildren.get(newIdx) || null
                // 复用并更新 Fragment 节点
                return updateFragment(returnFiber, matchedFiber, newChild, lanes, null)
            }

            // 无效对象类型，抛出错误
            throwOnInvalidObjectType(returnFiber, newChild);
        }
        // 无匹配节点，返回 null
        return null
    }

    // placeChild 是 React 协调阶段（Reconciliation）中用于确定新 Fiber 节点位置的核心函数。它通过对比节点的新旧位置，判断节点是否需要移动（Placement），并更新已处理节点的最大位置索引，为后续节点的位置判断提供参考。这一函数是实现列表节点高效重排的关键，直接影响提交阶段（Commit）的 DOM 操作（如插入、移动）。
    function placeChild(
        newFiber: Fiber,         // 新的 Fiber 节点（当前正在处理的节点）
        lastPlacedIndex: number,  // 已处理节点的最大旧位置索引（用于判断是否移动）
        newIndex: number,        // 新节点在新列表中的索引（新位置）
    ) {
        // 1. 记录新节点在新列表中的索引
        newFiber.index = newIndex

        // 2. hydration 阶段（服务端渲染 hydration）的特殊处理
        if (!shouldTrackSideEffects) {
            // 在 hydration 时，为列表中的节点标记 Forked 标记（用于 useId 等逻辑）
            newFiber.flags |= Forked
            return lastPlacedIndex  // 不更新 lastPlacedIndex
        }

        // 3. 获取旧的 Fiber 节点（current 树中的对应节点）
        const current = newFiber.alternate

        if (current !== null) {
            // 3.1 旧节点存在：对比新旧位置
            const oldIndex = current.index  // 旧节点在旧列表中的索引（旧位置）
            if (oldIndex < lastPlacedIndex) {
                // 旧位置 < 已处理节点的最大旧位置 → 节点在新列表中位置提前，需要移动
                newFiber.flags |= Placement // 标记移动
                return lastPlacedIndex // 最大位置索引不变
            } else {
                // 旧位置 >= 已处理节点的最大旧位置 → 节点位置未提前，无需移动
                return oldIndex
            }
        } else {
            // 3.2 旧节点不存在：新节点是新增的，需要插入
            newFiber.flags |= Placement  // 标记插入
            return lastPlacedIndex // 最大位置索引不变
        }
    }

    function placeSingleChild(newFiber: Fiber): Fiber {
        if (shouldTrackSideEffects && newFiber.alternate === null) {
            newFiber.flags |= Placement
        }
        return newFiber
    }

    // createChild 是 React 协调阶段（Reconciliation）中根据新子节点类型创建对应 Fiber 节点的核心工具函数。它针对不同类型的 newChild（如文本、元素、Portal、数组等），调用专门的 Fiber 创建函数生成新节点，并建立与父节点的关联，是构建新 Fiber 树的基础逻辑。
    function createChild(
        returnFiber: Fiber,
        newChild: any,
        lanes: Lanes
    ): Fiber | null {
        // 1. 处理文本节点（非空字符串或数字）
        if (
            (typeof newChild === 'string' && newChild !== '') ||
            typeof newChild === 'number'
        ) {
            // 调用 createFiberFromText 创建 HostText 类型 Fiber 节点
            const created = createFiberFromText('' + newChild, returnFiber.mode, lanes)
            created.return = returnFiber // 关联父节点（建立 Fiber 树层级）
            return created
        }

        // 2. 处理对象类型节点（React 元素、Portal 等）
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                // 2.1 React 元素（如 <div />、自定义组件）
                case REACT_ELEMENT_TYPE: {
                    // 调用 createFiberFromElement 创建元素对应的 Fiber 节点
                    const created = createFiberFromElement(newChild, returnFiber.mode, lanes)
                    // 处理 ref 属性（转换为标准格式，如函数或对象）
                    created.ref = coerceRef(returnFiber, null, newChild) as any
                    created.return = returnFiber
                    return created
                }
                // 2.2 Portal 节点（React.createPortal 创建）
                case REACT_PORTAL_TYPE: {
                    // 调用 createFiberFromPortal 创建 HostPortal 类型 Fiber 节点
                    const created = createFiberFromPortal(newChild, returnFiber.mode, lanes)
                    created.return = returnFiber
                    return created
                }
                // 2.3 懒加载组件（React.lazy 创建）
                case REACT_LAZY_TYPE: {
                    const payload = newChild._payload  // 懒加载组件的加载信息
                    const init = newChild._init  // 初始化函数（用于解析组件）
                    // 解析懒加载组件的实际内容，递归创建 Fiber 节点
                    return createChild(returnFiber, init(payload), lanes)
                }
            }

            // 2.4 数组或可迭代对象（如 [child1, child2]）
            if (isArray(newChild) || getIteratorFn(newChild)) {
                // 调用 createFiberFromFragment 创建 Fragment 类型 Fiber 节点
                const created = createFiberFromFragment(newChild, returnFiber.mode, lanes, null)
                created.return = returnFiber
                return created
            }

            // 无效对象类型（如非 React 规范的对象），抛出错误
            throwOnInvalidObjectType(returnFiber, newChild)
        }
        // 所有类型不匹配，返回 null（无法创建有效 Fiber 节点）
        return null
    }

    function reconcileSingleElement(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        element: ReactElement,
        lanes: Lanes
    ): Fiber {
        const key = element.key
        let child = currentFirstChild  // 从大儿子开始遍历
        // 遍历当前树中的字节点，寻找可复用的节点
        while(child !== null) {
            if (child.key === key) {  // 如果找到了key 匹配的节点
                const elementType = element.type
                if (elementType === REACT_FRAGMENT_TYPE) { // 如果新节点类型是 Fragment 类型
                    if (child.tag === Fragment) {  // 如果旧节点类型也是 Fragment 类型
                        deleteRemainingChildren(returnFiber, child.sibling)  // 删除剩余的兄弟节点 (因为只需要处理单个元素)
                        const existing = useFiber(child, element.props.children)  // 复用现有的 Fiber 节点，更新其props
                        existing.return = returnFiber
                        return existing
                    }
                } else { // 如果是非 Fragment 元素
                    // 检查元素类型是否匹配，或者是否可以热重载兼容，或者是否是lazy组件
                    if (child.elementType === elementType || (typeof elementType === 'object' && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === child.type)) {
                        deleteRemainingChildren(returnFiber, child.sibling)  // 删除剩余的兄弟节点
                        const existing = useFiber(child, element.props)  // 复用现有的 Fiber 节点，更新其props
                        existing.ref = coerceRef(returnFiber, child, element) as any  // 处理 ref 属性
                        existing.return = returnFiber
                        return existing
                    }
                }
                // 如果类型不匹配，删除这个节点及其所有的兄弟节点
                deleteRemainingChildren(returnFiber, child)
                break
            } else {
                // 如果key 不匹配，删除当前节点
                deleteChild(returnFiber, child)
            }
            child = child.sibling
        }

        if (element.type === REACT_FRAGMENT_TYPE) {
            const created = createFiberFromFragment(element.props.children, returnFiber.mode, lanes, element.key)
            created.return = returnFiber
            return created
        } else {
            const created = createFiberFromElement(element, returnFiber.mode, lanes)
            created.ref = coerceRef(returnFiber, currentFirstChild, element) as any
            created.return = returnFiber
            return created
        }
    }

    function reconcileSinglePortal(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        portal: ReactElement,
        lanes: Lanes
    ): Fiber {
        debugger
    }

    function reconcileSingleTextNode(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        textContent: string,
        lanes: Lanes
    ): Fiber {
        debugger
    }

    function deleteRemainingChildren(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null
    ): null {
        if (!shouldTrackSideEffects) {
            return null
        }
        let childToDelete = currentFirstChild
        while(childToDelete !== null) {
            deleteChild(returnFiber, childToDelete)
            childToDelete = childToDelete.sibling
        }
        return null
    }

    // diff 算法
    function reconcileChildrenArray(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChildren: Array<any>,
        lanes: Lanes
    ): Fiber | null {
        let resultingFirstChild: Fiber | null = null       // 最终返回的新子树第一个节点
        let previousNewFiber: any = null          // 上一个新创建的 Fiber 节点（用于构建链表）
        let oldFiber: Fiber | null = currentFirstChild     // 当前正在对比的旧 Fiber 节点
        let lastPlacedIndex = 0                            // 记录已处理节点的最大位置索引（用于判断节点是否需要移动）
        let newIdx = 0                                   // 新子节点数组的当前索引
        let nextOldFiber: Fiber | null = null              // 下一个旧 Fiber 节点（用于提前缓存）
        // 第一阶段：按索引顺序对比新旧节点（尽可能复用同位置节点）
        for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
            if (oldFiber.index > newIdx) {

            } else {
                // 缓存下一个旧节点（避免后续查找）
                nextOldFiber = oldFiber.sibling
            }

            // 尝试更新当前位置的节点（复用旧节点或创建新节点）
            const newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], lanes) as any
            if (newFiber === null) {
                // 若无法更新（如类型不匹配），中断顺序对比
                if (oldFiber === null) {
                    oldFiber = nextOldFiber
                }
                break
            }

            // 若需要追踪副作用（如删除旧节点）
            if (shouldTrackSideEffects) {
                if (oldFiber && newFiber.alternate === null) {
                    // 若旧节点存在但未被复用（新节点是全新的），标记旧节点为删除
                    deleteChild(returnFiber, oldFiber)
                }
            }

            // 确定新节点的位置（是否需要移动），更新 lastPlacedIndex
            lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx)

            // 构建新的 Fiber 链表
            if (previousNewFiber === null) {
                resultingFirstChild = newFiber // 第一个节点作为结果的起点
            } else {
                previousNewFiber.sibling = newFiber // 链接到上一个节点的 sibling
            }
            previousNewFiber = newFiber
            oldFiber = nextOldFiber // 移动到下一个旧节点
        }

        // 第二阶段：新节点数组已遍历完，删除剩余的旧节点
        if (newIdx === newChildren.length) {
            deleteRemainingChildren(returnFiber, oldFiber)
            if (getIsHydrating()) {
                debugger
            }
            return resultingFirstChild
        }

        // 第三阶段：旧节点已遍历完，剩余新节点均为插入
        if (oldFiber === null) {
            for (; newIdx < newChildren.length; newIdx++) {
                // 创建新节点
                const newFiber = createChild(returnFiber, newChildren[newIdx], lanes)
                if (newFiber === null) {
                    continue
                }
                // 确定插入位置
                lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx)
                // 构建链表
                if (previousNewFiber === null) {
                    resultingFirstChild = newFiber
                } else {
                    previousNewFiber.sibling = newFiber
                }
                previousNewFiber = newFiber
            }
            if (getIsHydrating()) {
                debugger
            }
            return resultingFirstChild
        }

        // 第四阶段：新旧节点均有剩余，通过 key 映射表查找可复用节点
        // 将剩余旧节点按 key 存入 Map（key 为节点 key 或索引）
        const existingChildren = mapRemainingChildren(returnFiber, oldFiber)
        // 遍历剩余新节点，从映射表中查找可复用的旧节点
        for (; newIdx < newChildren.length; newIdx++) {
            // 从映射表中查找并更新节点
            const newFiber = updateFromMap(existingChildren, returnFiber, newIdx, newChildren[newIdx], lanes)
            if (newFiber !== null) {
                if (shouldTrackSideEffects) {
                    if (newFiber.alternate !== null) {
                        // 若复用了旧节点，从映射表中移除（避免被误删）
                        existingChildren.delete(newFiber.key === null ? newIdx : newFiber.key)
                    }
                }
                // 确定节点位置（可能需要移动）
                lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx)
                // 构建链表
                if (previousNewFiber === null) {
                    resultingFirstChild = newFiber
                } else {
                    previousNewFiber.sibling = newFiber
                }
                previousNewFiber = newFiber
            }
        }

        if (shouldTrackSideEffects) {
            existingChildren.forEach(child => deleteChild(returnFiber, child))
        }

        if (getIsHydrating()) {
            debugger
        }

        return resultingFirstChild
    }

    function reconcileChildrenIterator(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChildrenIterable: Iterable<any>,
        lanes: Lanes,
    ): Fiber | null {
        debugger
    }
    
    
    function reconcileChildFibers(
        returnFiber: Fiber,
        currentFirstChild: Fiber | null,
        newChild: any,
        lanes: Lanes
    ) {
        const isUnkeyedTopLevelFragment = typeof newChild === 'object' && newChild !== null && newChild.type === REACT_FRAGMENT_TYPE && newChild.key === null
        if (isUnkeyedTopLevelFragment) {
            newChild = newChild.props.children
        }
        
        if (typeof newChild === 'object' && newChild !== null) {
            switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE:
                    return placeSingleChild(reconcileSingleElement(returnFiber, currentFirstChild, newChild, lanes))
                case REACT_PORTAL_TYPE:
                    return placeSingleChild(reconcileSinglePortal(returnFiber, currentFirstChild, newChild, lanes))
                case REACT_LAZY_TYPE: {
                    const payload = newChild._payload
                    const init = newChild._init
                    return reconcileChildFibers(returnFiber, currentFirstChild, init(payload), lanes)
                }
                    
            }
            if (isArray(newChild)) {
                return reconcileChildrenArray(
                    returnFiber,
                    currentFirstChild,
                    newChild,
                    lanes
                )
            }

            if (getIteratorFn(newChild)) {
                return reconcileChildrenIterator(
                    returnFiber,
                    currentFirstChild,
                    newChild,
                    lanes
                )
            }
            throwOnInvalidObjectType(returnFiber, newChild)
        }

        if ((newChild === 'string' && newChild !== '') || typeof newChild === 'number') {
            return placeSingleChild(reconcileSingleTextNode(returnFiber, currentFirstChild, '' + newChild, lanes))
        }

        return deleteRemainingChildren(returnFiber, currentFirstChild)
    }
    return reconcileChildFibers
}

export const reconcileChildFibers = ChildReconciler(true)
export const mountChildFibers = ChildReconciler(false)

/**
 * coerceRef 是 React 中处理 ref 属性转换与校验的核心函数。它主要负责将元素上定义的 ref（可能是字符串、函数、createRef 创建的对象等）转换为 React 内部可处理的格式，并对不推荐的用法（如字符串 ref）进行警告或报错，确保 ref 机制的安全性和一致性。
 * 核心背景：ref 的多种形式与历史问题
ref 用于获取 DOM 元素或组件实例的引用，在 React 中有多种写法：
字符串 ref（旧写法，如 <div ref="myDiv" />）：通过 this.refs.myDiv 访问，存在潜在问题（如模糊所有权、不利于静态分析），已不推荐使用。
函数 ref（如 <div ref={(el) => this.myDiv = el} />）：通过回调函数获取引用，灵活且推荐。
对象 ref（通过 createRef 或 useRef 创建，如 <div ref={this.myRef} />）：通过 myRef.current 访问，适合类组件和函数组件。
coerceRef 的核心作用是统一处理这些形式，尤其是将不推荐的字符串 ref 转换为函数 ref 以兼容内部逻辑，并对错误用法进行提示。
*/
function coerceRef(
    returnFiber: Fiber,  // 父 Fiber 节点（引用的所有者）
    current: Fiber | null, // 旧 Fiber 节点（用于对比 ref 是否变化）
    element: ReactElement // 当前元素（包含 ref 属性）
) {
    const mixedRef = element.ref  // 获取元素上定义的 ref
    // 仅处理非空且类型不是函数/对象的 ref（主要针对字符串 ref）
    if (mixedRef !== null && typeof mixedRef !== 'function' && typeof mixedRef !== 'object') {
        // 2. 校验字符串 ref 的合法性
        if (element._owner) {
            const owner: Fiber = element._owner
            let inst
            // 检查所有者是否为类组件（函数组件不支持字符串 ref）
            if (owner) {
                const ownerFiber = owner
                if (ownerFiber.tag !== ClassComponent) {
                    throw new Error('coerceRef 出错了')
                }
                inst = ownerFiber.stateNode  // 获取类组件实例
            }

            if (!inst) {
                throw new Error('coerceRef 出错了')
            }

            // 3. 将字符串 ref 转换为函数 ref
            const resolvedInst = inst

            const stringRef = '' + mixedRef // 确保是字符串

            // 优化：若新旧字符串 ref 相同，复用旧的函数 ref
            if (current !== null && current.ref !== null && typeof current.ref === 'function' && current.ref._stringRef === stringRef) {
                return current.ref
            }

            // 创建函数 ref：更新组件实例的 refs 属性
            const ref = function (value) {
                const refs = resolvedInst.refs
                if (value === null) {
                    delete refs[stringRef];  // 卸载时删除引用
                } else {
                    refs[stringRef] = value;  // 挂载时保存引用
                }
            }

            ref._stringRef = stringRef  // // 标记这是转换后的字符串 ref
            return ref
        } else {
            if (typeof mixedRef !== 'string') {
                throw new Error('coerceRef 出错了')
            }
            if (!element._owner) {
                throw new Error('coerceRef 出错了')
            }
        }
    }
    return mixedRef
}

export function cloneChildFibers(
    current: Fiber | null,
    workInProgress: Fiber
) {
    if (current !== null && workInProgress.child !== current.child) {
        throw new Error('Resuming work not yet implemented.')
    }

    if (workInProgress.child === null) {
        return
    }

    let currentChild = workInProgress.child
    let newChild = createWorkInProgress(currentChild, currentChild.pendingProps)
    workInProgress.child = newChild
    newChild.return = workInProgress

    while (currentChild.sibling !== null) {
        currentChild = currentChild.sibling
        newChild = newChild.sibling = createWorkInProgress(currentChild, currentChild.pendingProps)
        newChild.return = workInProgress
    }
    newChild.sibling = null
}