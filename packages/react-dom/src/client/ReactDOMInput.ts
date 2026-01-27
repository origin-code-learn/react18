import assign from "shared/assign";
import getActiveElement from "./getActiveElement";
import { ToStringValue, getToStringValue, toString } from "./ToStringValue";
import { disableInputAttributeSyncing } from "shared/ReactFeatureFlags";
import { setValueForProperty } from "./DOMPropertyOperations";
import { getFiberCurrentPropsFromNode } from "./ReactDOMComponentTree";
import { updateValueIfChanged } from "./inputValueTracking";

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
    const node = element as InputWithWrapperState
    const checked = (props as any).checked
    const hostProps = assign({}, props, {
        defaultChecked: undefined,
        defaultValue: undefined,
        value: undefined,
        checked: checked != null ? checked : node._wrapperState.initialChecked
    })
    return hostProps
}

export function updateWrapper(element: Element, props: any) {
    const node = element as InputWithWrapperState
    updateChecked(element, props)
    const value = getToStringValue(props.value)
    const type = props.type
    if (value != null) {
        if (type === 'number') {
            if ((value === 0 && node.value === '') || node.value != value) {
                node.value = toString(value)
            }
        } else if (node.value !== toString(value)) {
            node.value = toString(value)
        }
    } else if (type === 'submit' || type === 'reset') {
        node.removeAttribute('value')
        return
    }

    if (disableInputAttributeSyncing) {
        if (props.hasOwnProperty('defaultValue')) {
            setDefaultValue(node, props.type, getToStringValue(props.defaultValue))
        }
    } else {
        if (props.hasOwnProperty('value')) {
            setDefaultValue(node, props.type, value)
        } else if (props.hasOwnProperty('defaultvalue')) {
            setDefaultValue(node, props.type, getToStringValue(props.defaultValue))
        }
    }

    if (disableInputAttributeSyncing) {
        if (props.defaultChecked == null) {
            node.removeAttribute('checked')
        } else {
            node.defaultChecked = !!props.defaultChecked
        }
    } else {
        if (props.checked == null && props.defaultChecked != null) {
            node.defaultChecked = !!props.defaultChecked
        }
    }
}

export function initWrapperState(element, props) {
    const node = element
    const defaultValue = props.defaultValue == null ? '' : props.defaultValue
    node._wrapperState = {
        initialChecked: props.checked != null ? props.checked : props.defaultChecked,
        initialValue: getToStringValue(props.value != null ? props.value : defaultValue),
        controlled: isControlled(props)
    }
}


function isControlled(props) {
    const usesChecked = props.type === 'checkbox' || props.type === 'radio'
    return usesChecked ? props.checked != null : props.value != null
}

function updateChecked(element: Element, props: Object) {
    const node = element as InputWithWrapperState
    const checked = (props as any).checked
    if (checked !== null) {
        setValueForProperty(node, 'checked', checked, false)
    }
}

export function restoreControlledState(element: Element, props: Object) {
    const node = element as InputWithWrapperState
    updateWrapper(node, props)
    updateNamedCousins(node, props)
}

function updateNamedCousins(rootNode, props) {
    const name = props.name
    if (props.type === 'radio' && name != null) {
        let queryRoot: Element = rootNode
        while (queryRoot.parentNode) {
            queryRoot = queryRoot.parentNode as Element
        }
        const group = queryRoot.querySelectorAll('input[name=' + JSON.stringify('' + name) + '][type="radio"]')
        for (let i = 0; i < group.length; i++) {
            const otherNode: any = group[i]
            if (otherNode === rootNode || otherNode.form !== rootNode.form) continue
            const otherProps = getFiberCurrentPropsFromNode(otherNode)
            if (!otherProps) {
                throw new Error('input updateNamedCousins 报错了')
            }
            updateValueIfChanged(otherNode)
            updateWrapper(otherNode, otherProps)
        }
    }
}

export function postMountWrapper(
    element: Element,
    props: any,
    isHydrating: boolean
) {
    const node = element as InputWithWrapperState
    if (props.hasOwnProperty('value') || props.hasOwnProperty('defaultValue')) {
        const type = props.type
        const isButton = type === 'submit' || type === 'reset'
        if (isButton && (props.value === undefined || props.value === null)) {
            return
        }
        const initialValue = toString(node._wrapperState.initialValue)
        if (!isHydrating) {
            if (disableInputAttributeSyncing) {
                const value = getToStringValue(props.value)
                if (value != null) {
                    if (isButton || value !== node.value) {
                        node.value = toString(value)
                    }
                }
            } else {
                if (initialValue !== node.value) {
                    node.value = initialValue
                }
            }
        }
        if (disableInputAttributeSyncing) {
            const defaultValue = getToStringValue(props.defaultValue)
            if (defaultValue != null) {
                node.defaultValue = toString(defaultValue)
            }
        } else {
            node.defaultValue = initialValue
        }
    }
    const name = node.name
    if (name !== '') {
        node.name = ''
    }
    if (disableInputAttributeSyncing) {
        if (!isHydrating) {
            updateChecked(element, props)
        }

        if (props.hasOwnProperty('defaultChecked')) {
            node.defaultChecked = !node.defaultChecked
            node.defaultChecked = !!props.defaultChecked
        }
    } else {
        node.defaultChecked = !node.defaultChecked
        node.defaultChecked = !!node._wrapperState.initialChecked
    }
    if (name !== '') {
        node.name = name
    }
}