import { REACT_PORTAL_TYPE } from "shared/ReactSymbols";
import { ReactNodeList, ReactPortal } from "shared/ReactTypes";

export function createPortal(
    children: ReactNodeList,
    containerInfo: any,
    implementation: any,
    key: string | null
): ReactPortal {
    return {
        $$typeof: REACT_PORTAL_TYPE,
        key: key == null ? null : '' + key,
        children,
        containerInfo,
        implementation
    }
}