export type ToStringValue =
  | boolean
  | number
  | Object
  | string
  | null
  | void;

export function toString(value: ToStringValue): string {
  return '' + value
}

export function getToStringValue(value: any): ToStringValue {
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
    case 'undefined':
      return value
    case 'object':
      return value
    default:
      return ''
  }
}