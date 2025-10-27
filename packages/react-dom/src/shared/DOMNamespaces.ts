/**
 * 这段代码是 React 18 中处理 HTML、SVG 和 MathML 等不同 XML 命名空间（Namespace）的工具函数，主要用于在构建和更新 DOM 元素时，正确识别元素所属的命名空间，确保跨文档类型（如 SVG 内嵌 HTML）的元素能被浏览器正确解析。
核心背景：XML 命名空间的作用
在网页中，不同类型的标记语言（如 HTML、SVG、MathML）可能存在同名标签（如 <a> 在 HTML 和 SVG 中含义不同）。为避免冲突，XML 规范通过「命名空间」区分这些元素：

HTML 元素默认属于 http://www.w3.org/1999/xhtml 命名空间
SVG 元素属于 http://www.w3.org/2000/svg 命名空间
MathML（数学标记语言）元素属于 http://www.w3.org/1998/Math/MathML 命名空间

React 在创建这些元素时（如通过 createElement），需要正确指定命名空间，否则浏览器可能无法正确渲染（例如 SVG 元素若使用 HTML 命名空间会被解析为普通标签）。
 * 
 */

export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
export const MATH_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function getIntrinsicNamespace(type: string): string {
    switch (type) {
        case 'svg': 
            return SVG_NAMESPACE
        case 'math':
            return MATH_NAMESPACE
        default:
            return HTML_NAMESPACE
    }
}

export function getChildNamespace(parentNamespace: string | null, type: string) {
    // 情况1：父命名空间为空（根元素）或为HTML命名空间
    if (parentNamespace === null || parentNamespace === HTML_NAMESPACE) {
        // 子元素可能是新命名空间的入口点（如HTML中嵌套<svg>）
        return getIntrinsicNamespace(type)
    }
    // 情况2：父命名空间是SVG，且子元素是<foreignObject>
    if (parentNamespace === SVG_NAMESPACE && type === 'foreignObject') {
        // <foreignObject>是SVG中嵌入其他命名空间内容的容器，默认切换到HTML命名空间
        return HTML_NAMESPACE
    }
    // 情况3：其他场景（如SVG内部的子元素）
    // 子元素继承父元素的命名空间
    return parentNamespace
}