// 小顶堆数据结构，主要用于 React 任务调度系统中管理优先级任务，
// 目的： 他确保每次能够快速获取优先级最高的任务
// 为什么? React 为什么要采用这种小顶堆的数据结构来进行最小值的取值问题，而不采用 通用的数组排序形式取值？ 小顶堆 和 数组排序取值有什么优缺点和使用场景吗？
/**
 * 对于变化频繁的数据，假如想取数组的最小值, 小顶堆的数据结构具有性能优势，
 * 
 * */ 

type HNode = {
    id: number;  // 任务 ID 唯一标识
    sortIndex: number // 排序索引，用于确定任务优先级（值越小优先级越高）
}
type Heap = Array<HNode>  // 堆由节点数组组成

// 将节点添加到数组末尾，并调用 siftUp 方法将新节点向上调整到合适的位置 (如果新节点优先级更高，会向上移动)
export function push(
    heap: Heap,
    node: HNode
) {
    const index = heap.length
    heap.push(node)
    siftUp(heap, node, index)
}

// 获取堆中优先级最高的节点 (堆顶元素)， 但不删除它
export function peek(heap: Heap) {
    return heap.length === 0 ? null : heap[0] 
}

/**
 * 作用: 移除并返回堆中优先级最高的节点（堆顶元素），同时维护堆结构
 * 流程:
 *   1. 保存堆顶元素
 *   2. 将最后一个元素移到堆顶
 *   3. 调用 siftDown 方法，将新堆顶向下调整到合适的位置
 *   4. 返回最初的堆顶元素
 * */ 
export function pop(heap: Heap) {
    if (heap.length === 0) {
        return null
    }
    const first = heap[0]
    const last: any = heap.pop()
    if (first !== last) {
        heap[0] = last
        siftDown(heap, last, 0)
    }
    return first
}

// 节点冒泡
export function siftUp(heap, node, i) {
    let index = i
    while(index > 0) {
        const parentIndex = (index - 1) >>> 1  // 无符号右移一位,等价于 Math.floor((index - 1) / 2)；父节点的位置
        const parent = heap[parentIndex] // 父节点
        if (compare(parent, node) > 0) {  // 当前节点与父节点进行比较，如果当前节点 小于父节点，则进行位置交换
            heap[parentIndex] = node
            heap[index] = parent
            index = parentIndex // 继续向上冒泡比价执行
        } else {
            return
        }
    }
}

// 节点下沉
export function siftDown(heap, node, i) {
    let index = i
    const length = heap.length
    const halfLength = length >>> 1
    while (index < halfLength) {
        const leftIndex = index * 2 + 1
        const left = heap[leftIndex]
        const rightIndex = leftIndex + 1
        const right = heap[rightIndex]
        if (compare(left, node) < 0) {
            if (rightIndex < length && compare(right, left) < 0) {
                heap[index] = right
                heap[rightIndex] = node
                index = rightIndex
            } else {
                heap[index] = left
                heap[leftIndex] = node
                index = leftIndex
            }
        } else if (rightIndex < length && compare(right, node) < 0) {
            heap[index] = right
            heap[rightIndex] = node
            index = rightIndex
        } else {
            return
        }
    }
}

function compare(a: HNode, b: HNode) {
    const diff = a.sortIndex - b.sortIndex
    return diff !== 0 ? diff : a.id - b.id
}
