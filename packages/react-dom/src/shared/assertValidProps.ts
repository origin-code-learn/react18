
import voidElementTags from './voidElementTags'

const HTML = '__html'

export default function assertValidProps(tag: string, props?: any) {
    if (!props) {
        return
    }
    if (voidElementTags[tag]) {
        if (props.children != null || props.dangerouslySetInnerHTML != null) {
            throw new Error(`${tag} 是一个空元素标签，既不能有子元素，也不能使用 dangerouslySetInnerHTML。`)
        }
    }
    if (props.dangerouslySetInnerHTML != null) {
        if (props.children != null) {
            throw new Error(`只能设置 children 或 props.dangerouslySetInnerHTML 中的一个。`)
        }
        if (typeof props.dangerouslySetInnerHTML !== 'object' || !(HTML in props.dangerouslySetInnerHTML)) {
            throw new Error(`props.dangerouslySetInnerHTML 必须采用 {__html: ...} 的形式。`)
        }
    }
    if (props.style != null && typeof props.style !== 'object') {
        throw new Error(` style 属性需要一个从样式属性到值的映射，不是 string。例如：style={{marginRight: spacing + 'em'} 使用JSX。`)
    }
}