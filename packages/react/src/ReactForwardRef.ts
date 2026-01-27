import { REACT_FORWARD_REF_TYPE } from "shared/ReactSymbols";
import type { ReactNode, ReactRef } from "shared/ReactTypes";

export function forwardRef<Props, ElementType>(
    render: (props: Props, ref: ReactRef<ElementType>) => ReactNode
) {
    const elementType = {
        $$typeof: REACT_FORWARD_REF_TYPE,
        render,
    }

    return elementType
}
