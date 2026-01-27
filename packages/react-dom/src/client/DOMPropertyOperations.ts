import { enableCustomElementPropertySupport } from "shared/ReactFeatureFlags"
import { BOOLEAN, getPropertyInfo, isAttributeNameSafe, PropertyInfo, shouldIgnoreAttribute, shouldRemoveAttribute } from "../shared/DOMProperty"

export function setValueForProperty(
    node: Element,
    name: string,
    value: any,
    isCustomComponentTag: boolean
) {
    // 1. 属性元信息与过滤（前期准备）
    const propertyInfo: PropertyInfo | null = getPropertyInfo(name)
    if (shouldIgnoreAttribute(name, propertyInfo, isCustomComponentTag)) {
        return
    }
    // 2. 自定义组件的事件处理（onXXX 事件）
    if (
        enableCustomElementPropertySupport &&
        isCustomComponentTag &&
        name[0] === 'o' &&
        name[1] === 'n'
    ) {
        // 提取事件名（如 onClick → click，onClickCapture → click 并标记捕获阶段）
        let eventName = name.replace(/Capture$/, '');
        const useCapture = name !== eventName
        eventName = eventName.slice(2)
        debugger
    }
    if (
        enableCustomElementPropertySupport &&
        isCustomComponentTag &&
        name in node
    ) {
        debugger
    }
    if (shouldRemoveAttribute(name, value, propertyInfo, isCustomComponentTag)) {
        value = null
    }
    if (enableCustomElementPropertySupport) {
        debugger
    }
    if (isCustomComponentTag || propertyInfo === null) {
        if (isAttributeNameSafe(name)) {
            const attributeName = name
            if (value === null) {
                node.removeAttribute(attributeName)
            } else {
                node.setAttribute(attributeName, value)
            }
        }
        return
    }

    const { mustUseProperty } = propertyInfo as PropertyInfo
    if (mustUseProperty) {
        const { propertyName } = propertyInfo
        if (value === null) {
            const { type } = propertyInfo
            node[propertyName] = type === BOOLEAN ? false : ''
        } else {
            node[propertyName] = value
        }
        return
    }
    const { attributeName, attributeNamespace } = propertyInfo as any
    if (value === null) {
        node.removeAttribute(attributeName)
    } else {
        debugger
    }
}