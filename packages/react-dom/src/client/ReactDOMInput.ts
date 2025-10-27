import getActiveElement from "./getActiveElement";
import { ToStringValue, toString } from "./ToStringValue";

type InputWithWrapperState = HTMLInputElement & {
    _wrapperState: {
      initialValue: ToStringValue,
      initialChecked?: boolean,
      controlled?: boolean,
    },
    [key: string]: any
};

export function setDefaultValue(
    node: InputWithWrapperState,
    type: string,
    value: any
) {
    if (type !== 'number' || getActiveElement(node.ownerDocument) !== node) {
        if (value == null) {
            node.defaultValue = toString(node._wrapperState?.initialValue)
        } else if (node.defaultValue !== toString(value)) {
            node.defaultValue = toString(value)
        }
    }
}

export function getHostProps(element: Element, props: Object): Object {
    debugger
}

export function updateWrapper(element: Element, props: Object) {
    debugger
}