
import assign from "shared/assign";

export function resolveDefaultProps(Component: any, baseProps: Object): Object {
    if (Component && Component.defaultProps) {
        const props = assign({}, baseProps)
        const defaultProps = Component.defaultProps
        for (const propName in defaultProps) {
            if (props[propName] === undefined) {
                propName[propName] = defaultProps[propName]
            }
        }
        return props
    }
    return baseProps
}