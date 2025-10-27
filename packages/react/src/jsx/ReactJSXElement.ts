import hasOwnProperty from "shared/hasOwnProperty";
import ReactSharedInternals from "shared/ReactSharedInternals";
import { REACT_ELEMENT_TYPE } from "shared/ReactSymbols";
import { Key } from "shared/ReactTypes";

const ReactCurrentOwner = ReactSharedInternals?.ReactCurrentOwner

const RESERVED_PROPS = {
    key: true,
    ref: true,
    __self: true,
    __source: true
}

function hasValidKey(config: any) {
    return config.key !== undefined
}

function hasValidRef(config: any) {
    return config.ref !== undefined
}

const ReactElement = function(type: any, key, ref, self, source, owner, props) {
    const element = {
        $$typeof: REACT_ELEMENT_TYPE,

        type,
        key,
        ref,
        props,

        _owner: owner
    }

    return element
}

export function jsx(type: any, config: any, maybeKey: unknown) {
    let propName;
    const props = {}
    let key: Key | null = null
    let ref: Key | null = null
    if (maybeKey !== undefined) {
        key = '' + maybeKey
    }
    if (hasValidKey(config)) {
        key = '' + config.key
    }
    
    if (hasValidRef(config)) {
        ref = config?.ref
    }

    for (propName in config) {
        if (
            hasOwnProperty.call(config, propName) && 
            !RESERVED_PROPS.hasOwnProperty(propName)
        ) {
            props[propName] = config[propName]
        }
    }

    if (type && type.defaultProps) {
        const defaultProps = type.defaultProps
        for (propName in defaultProps) {
            if (props[propName] === undefined) {
                props[propName] = defaultProps[propName]
            }
        }
    }

    return ReactElement(
        type,
        key,
        ref,
        undefined,
        undefined,
        ReactCurrentOwner?.current,
        props
    )
}

export function jsxDEV(type: unknown, config: unknown, maybeKey: unknown, source: unknown, self: unknown) {
    console.log(type, config, maybeKey, source, self)
}
