import hasOwnProperty from "shared/hasOwnProperty";
import { enableCustomElementPropertySupport, enableFilterEmptyStringAttributesDOM } from "shared/ReactFeatureFlags";

// 属性类型
type PropertyType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// 保留属性，由 React 单独处理（不直接写入 DOM）。 例如:  key、ref（React 内部处理，不映射到 DOM）
export const RESERVED = 0

// 简单字符串属性，直接作为字符串应用到 DOM 特性。	例如： id、className（对应 class 特性）
export const STRING = 1

// 接受布尔值的字符串属性（HTML 中的 “枚举属性”），true 对应 "true"，false 对应 "false"。 例如：contentEditable（值为 "true" 或 "false"）
export const BOOLEANISH_STRING = 2

// 布尔属性：true 时需 “存在特性”（值为空字符串），false 时需 “移除特性”。 例如：disabled、checked（存在即表示 true）
export const BOOLEAN = 3

// 重载布尔属性：true 时存在特性（空字符串），false 时移除，其他值作为字符串。	例如: allowFullScreen（可设为 true 或具体值）
export const OVERLOADED_BOOLEAN = 4

// 数值属性：值必须是数字或可解析为数字， falsy 值（如 0 除外）时移除。	例如：tabIndex、cols
export const NUMERIC = 5

// 正数值属性：值必须是正数或可解析为正数， falsy 值时移除。 例如：width、height（非负数值）
export const POSITIVE_NUMERIC = 6

// 合法特性名的 “起始字符集”（正则片段）。定义了特性名第一个字符允许的范围（如字母、下划线、特定 Unicode 字符等），符合 HTML 规范。
export const ATTRIBUTE_NAME_START_CHAR = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';

// 合法特性名的 “非起始字符集”（正则片段）。除起始字符外，后续字符可包含的范围（如数字、连字符、特定符号等）
export const ATTRIBUTE_NAME_CHAR = ATTRIBUTE_NAME_START_CHAR + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';

// 基于上述字符集的正则表达式，用于校验一个字符串是否为合法的 HTML 特性名。例如："data-id" 匹配（合法），"123-id" 不匹配（起始字符为数字，非法）。
export const VALID_ATTRIBUTE_NAME_REGEX = new RegExp('^[' + ATTRIBUTE_NAME_START_CHAR + '][' + ATTRIBUTE_NAME_CHAR + ']*$',);

// 转换后的 PropertyInfo 类型定义
export type PropertyInfo = {
    readonly acceptsBooleans: boolean;  // 是否接受布尔值作为输入（如 BOOLEAN 类型属性为 true）。
    readonly attributeName: string;  // 对应 HTML 特性名（如 className 对应的特性名是 class）。
    readonly attributeNamespace: string | null; // 特性的命名空间（如 SVG 元素的 xlink:href 需指定 xlink 命名空间，普通 HTML 属性为 null）。
    readonly mustUseProperty: boolean; // 是否必须设置为 DOM 属性（property）而非 HTML 特性（attribute）（如 input.value 必须设置为 DOM 属性，因为特性仅反映初始值）。
    readonly propertyName: string; // 对应 DOM 元素的属性名（如 className 对应 DOM 属性 classList 或 className）。
    readonly type: PropertyType; // 属性类型（即上述 PropertyType 枚举，如 BOOLEAN、STRING）。
    readonly sanitizeURL: boolean; // 是否需要对属性值进行 URL 安全校验（如 src、href 等可能包含恶意 URL 的属性，需过滤 javascript: 等危险协议）
    readonly removeEmptyString: boolean; // 当值为空字符串时是否移除该属性（部分属性空字符串等效于未设置）
};

// 避免重复校验同一特性名（提高性能）：已验证为合法的存入 validatedAttributeNameCache，非法的存入 illegalAttributeNameCache。例如：多次处理 data-foo 时，首次校验后存入缓存，后续直接读取结果。
// 用于缓存校验结果，避免重复计算，提升性能。
const illegalAttributeNameCache = {};
const validatedAttributeNameCache = {};

// 属性信息记录的构造函数
function PropertyInfoRecord(
    name: string,
    type: PropertyType,
    mustUseProperty: boolean,
    attributeName: string,
    attributeNamespace: string | null,
    sanitizeURL: boolean,
    removeEmptyString: boolean
) {
    this.acceptsBooleans = type === BOOLEANISH_STRING || type === BOOLEAN || type === OVERLOADED_BOOLEAN
    this.attributeName = attributeName
    this.attributeNamespace = attributeNamespace
    this.mustUseProperty = mustUseProperty
    this.propertyName = name
    this.type = type
    this.sanitizeURL = sanitizeURL
    this.removeEmptyString = removeEmptyString
}

const properties = {}

const reservedProps = [
    'children',
    'dangerouslySetInnerHTML',
    'defaultValue',
    'defaultChecked',
    'innerHTML',
    'suppressContentEditableWarning',
    'suppressHydrationWarning',
    'style',
]

enableCustomElementPropertySupport && reservedProps.push('innerText', 'textContent')

reservedProps.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, RESERVED, false, name, null, false, false)
})

const specialWordProps = [
    ['acceptCharset', 'accept-charset'],
    ['className', 'class'],
    ['htmlFor', 'for'],
    ['httpEquiv', 'http-equiv'],
]
specialWordProps.forEach(([name, attributeName]) => {
    properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, null, false, false)
})

const booleanProps = ['contentEditable', 'draggable', 'spellCheck', 'value']
booleanProps.forEach(name => {
    properties[name] = new PropertyInfoRecord(
        name,
        BOOLEANISH_STRING,
        false, // mustUseProperty
        name.toLowerCase(), // attributeName
        null, // attributeNamespace
        false, // sanitizeURL
        false, // removeEmptyString
    );
});

const svgPrpos = [
    'autoReverse',
    'externalResourcesRequired',
    'focusable',
    'preserveAlpha',
]
svgPrpos.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, BOOLEANISH_STRING, false, name, null, false, false)
})

const htmlProps = [
    'allowFullScreen',
    'async',
    'autoFocus',
    'autoPlay',
    'controls',
    'default',
    'defer',
    'disabled',
    'disablePictureInPicture',
    'disableRemotePlayback',
    'formNoValidate',
    'hidden',
    'loop',
    'noModule',
    'noValidate',
    'open',
    'playsInline',
    'readOnly',
    'required',
    'reversed',
    'scoped',
    'seamless',
    // Microdata
    'itemScope',
]
htmlProps.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, BOOLEAN, false, name.toLowerCase(), null, false, false)
})

const domProps = [
    'checked',
    'multiple',
    'muted',
    'selected',
]
domProps.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, BOOLEAN, true, name, null, false, false)
})

const overloadedProps = [
    'capture',
    'download',
]
overloadedProps.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, OVERLOADED_BOOLEAN, false, name, null, false, false)
})

const htmlPositiveprops = [
    'cols',
    'rows',
    'size',
    'span',
]
htmlPositiveprops.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, POSITIVE_NUMERIC, false, name, null, false, false)
})

const htmlOtherProps = [
    'rowSpan',
    'start'
]
htmlOtherProps.forEach(name => {
    properties[name] = new PropertyInfoRecord(name, NUMERIC, false, name.toLowerCase(), null, false, false)
})

const CAMELIZE = /[\-\:]([a-z])/g;
const capitalize = token => token[1].toUpperCase();
const camelizeProps = [
    'accent-height',
    'alignment-baseline',
    'arabic-form',
    'baseline-shift',
    'cap-height',
    'clip-path',
    'clip-rule',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'dominant-baseline',
    'enable-background',
    'fill-opacity',
    'fill-rule',
    'flood-color',
    'flood-opacity',
    'font-family',
    'font-size',
    'font-size-adjust',
    'font-stretch',
    'font-style',
    'font-variant',
    'font-weight',
    'glyph-name',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'horiz-adv-x',
    'horiz-origin-x',
    'image-rendering',
    'letter-spacing',
    'lighting-color',
    'marker-end',
    'marker-mid',
    'marker-start',
    'overline-position',
    'overline-thickness',
    'paint-order',
    'panose-1',
    'pointer-events',
    'rendering-intent',
    'shape-rendering',
    'stop-color',
    'stop-opacity',
    'strikethrough-position',
    'strikethrough-thickness',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'text-anchor',
    'text-decoration',
    'text-rendering',
    'underline-position',
    'underline-thickness',
    'unicode-bidi',
    'unicode-range',
    'units-per-em',
    'v-alphabetic',
    'v-hanging',
    'v-ideographic',
    'v-mathematical',
    'vector-effect',
    'vert-adv-y',
    'vert-origin-x',
    'vert-origin-y',
    'word-spacing',
    'writing-mode',
    'xmlns:xlink',
    'x-height',
]
camelizeProps.forEach(attributeName => {
    const name = attributeName.replace(CAMELIZE, capitalize)
    properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, null, false, false)
})

const xlinkProps = [
    'xlink:actuate',
    'xlink:arcrole',
    'xlink:role',
    'xlink:show',
    'xlink:title',
    'xlink:type',
]
xlinkProps.forEach(attributeName => {
    const name = attributeName.replace(CAMELIZE, capitalize)
    properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, 'http://www.w3.org/1999/xlink', false, false)
})

const xmlProps = [
    'xml:base',
    'xml:lang',
    'xml:space',
]
xmlProps.forEach(attributeName => {
    const name = attributeName.replace(CAMELIZE, capitalize)
    properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, 'http://www.w3.org/XML/1998/namespace', false, false)
})

const htmlSvgProps = [
    'tabIndex',
    'crossOrigin'
]
htmlSvgProps.forEach(attributeName => {
    properties[attributeName] = new PropertyInfoRecord(attributeName, STRING, false, attributeName.toLowerCase(), null, false, false)
})

const xlinkHref = 'xlinkHref';
properties[xlinkHref] = new PropertyInfoRecord('xlinkHref', STRING, false, 'xlink:href', 'http://www.w3.org/1999/xlink', true, false)

const hrefProps = ['src', 'href', 'action', 'formAction']
hrefProps.forEach(attributeName => {
    properties[attributeName] = new PropertyInfoRecord(attributeName, STRING, false, attributeName.toLowerCase(), null, true, true)
})

// 获取属性信息
export function getPropertyInfo(name: string): PropertyInfo | null {
    return properties.hasOwnProperty(name) ? properties[name] : null
}

export function isAttributeNameSafe(attributeName: string) {
    if (hasOwnProperty.call(validatedAttributeNameCache, attributeName)) return true
    if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return false
    if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName)) {
        validatedAttributeNameCache[attributeName] = true
        return true
    }
    illegalAttributeNameCache[attributeName] = true
    return false
}

// shouldIgnoreAttribute 是 React 中用于判断某个属性是否应该被忽略（不应用到 DOM 元素上） 的核心函数。它根据属性的元信息、元素类型（是否为自定义组件）和属性名特征，决定该属性是否需要跳过处理，确保只有符合规则的属性才会被应用到真实 DOM 上。
export function shouldIgnoreAttribute(name: string, propertyInfo: PropertyInfo | null, isCustomComponentTag: boolean) {
    // RESERVED 类型的属性（如 children、ref、dangerouslySetInnerHTML）由 React 内部单独处理，不应该直接映射到 DOM 特性或属性
    if (propertyInfo !== null) {
        return propertyInfo.type === RESERVED
    }
    // 自定义组件（如 Web Components）的属性处理逻辑由组件自身定义，React 不应擅自忽略，需全部传递给组件实例。例如，自定义组件 <my-component> 可能依赖 customProp 等属性，React 需确保这些属性被正常应用。
    if (isCustomComponentTag) {
        return false
    }
    // 过滤以 on 开头的非自定义组件属性
    if (
        name.length > 2 &&
        (name[0] === 'o' || name[0] === 'O') &&
        (name[1] === 'n' || name[1] === 'N')
    ) {
        return true
    }
    return false
}

export function shouldRemoveAttributeWithWarning(name: string, value: any, propertyInfo: PropertyInfo | null, isCustomComponentTag: boolean) {
    if (propertyInfo !== null && propertyInfo.type === RESERVED) return false
    switch (typeof value) {
        case 'function':
        case 'symbol':
            return true
        case 'boolean': {
            if (isCustomComponentTag) return false
            if (propertyInfo !== null) {
                return !propertyInfo.acceptsBooleans
            } else {
                const prefix = name.toLowerCase().slice(0, 5)
                return prefix !== 'data-' && prefix !== 'aria-'
            }
        }
        default:
            return false
    }
}

export function shouldRemoveAttribute(name: string, value: any, propertyInfo: PropertyInfo | null, isCustomComponentTag: boolean): boolean {
    if (value === null || typeof value === 'undefined') return true
    if (shouldRemoveAttributeWithWarning(name, value, propertyInfo, isCustomComponentTag)) return true
    if (isCustomComponentTag) {
        if (enableCustomElementPropertySupport) {
            if (value === false) return true
        }
        return false
    }
    if (propertyInfo !== null) {
        if (enableFilterEmptyStringAttributesDOM) {
            if (propertyInfo.removeEmptyString && value === '') return true
        }

        switch (propertyInfo.type) {
            case BOOLEAN:
                return !value
            case OVERLOADED_BOOLEAN:
                return value === false
            case NUMERIC:
                return isNaN(value)
            case POSITIVE_NUMERIC:
                return isNaN(value) || value < 1
        }
    }

    return false
}
