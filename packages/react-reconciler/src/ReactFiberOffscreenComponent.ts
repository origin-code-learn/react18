import { OffscreenMode, ReactNodeList } from "shared/ReactTypes"
import { Lanes } from "./ReactFiberLane.old"
import { Transition } from "./ReactFiberTransition"


export type OffscreenProps = {
    mode?: OffscreenMode | null | void,
    children?: ReactNodeList
}

export type OffscreenState = {
    baseLanes: Lanes,
    cachePool: any,
    transitions: Set<Transition> | null
}

export type OffscreenInstance = {
    isHidden: boolean
}