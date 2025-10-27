import { Fiber } from "./ReactInternalTypes";

export type CapturedValue<T> = {
    value: T;
    source: Fiber | null;
    stack: string | null;
    digest: string | null
}
