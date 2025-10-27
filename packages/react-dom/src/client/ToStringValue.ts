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