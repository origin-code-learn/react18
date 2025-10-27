import { TEXT_NODE } from "../shared/HTMLNodeType"

function getEventTarget(nativeEvent) {
    // 1. 兼容处理：获取事件目标（兼容 IE9 及其他浏览器）
    // IE9 中事件目标用 srcElement，其他浏览器用 target；若均不存在则 fallback 到 window
    let target = nativeEvent.target || nativeEvent.srcElement || window

    // 2. 标准化 SVG <use> 元素的事件目标
    // SVG 中 <use> 元素可能会转发事件，对应的实际元素需通过 correspondingUseElement 获取
    if (target.correspondingUseElement) {
        target = target.correspondingUseElement
    }

    // 3. 处理 Safari 中事件目标为文本节点的情况
    // Safari 可能将文本节点（nodeType 为 3）作为事件目标，而 React 期望目标是元素节点
    // 因此将目标修正为文本节点的父节点（通常是元素节点）
    return target.nodeType === TEXT_NODE ? target.parentNode : target
}

export default getEventTarget