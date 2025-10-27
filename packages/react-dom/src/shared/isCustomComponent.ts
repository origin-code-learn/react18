/**
 * isCustomComponent 是 React 中用于判断一个 DOM 元素是否为自定义组件（Web Components） 的工具函数。它通过标签名和属性（props.is）识别自定义元素，为后续的 DOM 创建、属性处理等逻辑提供判断依据，确保自定义组件能被正确渲染和处理。
 * 核心背景：自定义组件的特殊性
    Web Components 允许开发者定义自定义 HTML 元素（如 <my-button>）或扩展原生元素（如 <button is="my-button">）。这些自定义组件与普通 HTML 元素（如 <div>、<span>）的处理逻辑不同：
    自定义元素可能需要特殊的命名空间或属性处理。
    扩展原生元素（通过 is 属性）需要在创建 DOM 时使用特定 API（如 document.createElement('button', {is: 'my-button'})）。
    isCustomComponent 的作用就是准确识别这些自定义组件，让 React 能针对性地处理它们的创建和更新。
*/
export function isCustomComponent(tagName: string, props: Object) {
    // 1. 处理不带短横线的标签名（可能是扩展原生元素的自定义组件）
    if (tagName?.indexOf('-') === -1) {
        // 若存在 props.is 且为字符串，则是通过 is 属性扩展的自定义组件
        return typeof (props as any).is === 'string'
    }

    // 2. 处理带短横线的标签名（可能是独立自定义元素）
    switch(tagName) {
        // 排除 SVG 和 MathML 中保留的特殊标签（即使带短横线也不是自定义组件）
        case 'annotation-xml':
        case 'color-profile':
        case 'font-face':
        case 'font-face-src':
        case 'font-face-uri':
        case 'font-face-format':
        case 'font-face-name':
        case 'missing-glyph':
            return false
        default: 
            // 其他带短横线的标签均视为自定义组件
            return true
    }
}