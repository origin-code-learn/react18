import { canUseDOM } from "shared/ExecutionEnvironment"

function makePrefixMap(styleProp, eventName) {
    const prefixes: any = {}
    // 1. 小写基础名称（无厂商前缀）：如 'animation' -> 'animationend'
    prefixes[styleProp.toLowerCase()] = eventName.toLowerCase()
    // 2. Webkit 前缀（Chrome/Safari 早期版本）：如 'WebkitAnimation' -> 'webkitAnimationEnd'
    prefixes['Webkit' + styleProp] = 'webkit' + eventName
    // 3. Moz 前缀（Firefox 早期版本）：如 'MozAnimation' -> 'mozAnimationEnd'
    prefixes['Moz' + styleProp] = 'moz' + eventName
    return prefixes
}

const vendorPrefixes = {
    // 动画结束事件的前缀映射：如 { 'animation': 'animationend', 'WebkitAnimation': 'webkitAnimationEnd', ... }
    animationend: makePrefixMap('Animation', 'AnimationEnd'),
    // 动画迭代事件的前缀映射
    animationiteration: makePrefixMap('Animation', 'AnimationIteration'),
    // 动画开始事件的前缀映射
    animationstart: makePrefixMap('Animation', 'AnimationStart'),
    // 过渡结束事件的前缀映射
    transitionend: makePrefixMap('Transition', 'TransitionEnd'),
}

let style = {}
if (canUseDOM) {
    style = document.createElement('div').style
    // 检查是否支持原生 AnimationEvent 构造函数（无前缀事件的标志）
    if (!('AnimationEvent' in window)) { // 若不支持，则移除动画事件中无前缀的映射（如 'animation' -> 'animationend'）
        delete vendorPrefixes.animationend.animation;
        delete vendorPrefixes.animationiteration.animation;
        delete vendorPrefixes.animationstart.animation;
    }
    // 同理，处理过渡事件：检查是否支持原生 TransitionEvent 构造函数
    if (!('TransitionEvent' in window)) { // 若不支持，则移除过渡事件中无前缀的映射（如 'transition' -> 'transitionend'）
        delete vendorPrefixes.transitionend.transition;
    }
}

const prefixedEventNames = {}
function getVendorPrefixedEventName(eventName) {
    // 1. 若已缓存，直接返回（避免重复检测）
    if (prefixedEventNames[eventName]) {
        return prefixedEventNames[eventName]
    } else if (!vendorPrefixes[eventName]) { // 2. 若事件名无需处理厂商前缀（不在 vendorPrefixes 中），直接返回原事件名
        return eventName
    }
    // 3. 需处理前缀：获取该事件的前缀映射表
    const prefixMap = vendorPrefixes[eventName]

    // 4. 遍历映射表，检测哪个样式属性存在于 style 对象中（即浏览器支持该前缀）
    for (const styleProp in prefixMap) {
        if (prefixMap.hasOwnProperty(styleProp) && styleProp in style) {
            // 找到支持的前缀，缓存结果并返回对应的事件名
            return prefixedEventNames[eventName] = prefixMap[styleProp]
        }
    }
    // 5. 若未找到任何前缀（理论上不会发生，除非浏览器不支持该事件），返回原事件名
    return eventName
}

export default getVendorPrefixedEventName