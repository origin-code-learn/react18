import { ReactScopeInstance } from "shared/ReactTypes";
import { DOMEventName } from "../events/DOMEventNames";
import { SyntheticEvent } from "../events/ReactSyntheticEventType";

export type ReactDOMEventHandle = (
    target: EventTarget | ReactScopeInstance,
    callback: (event: SyntheticEvent<EventTarget>) => void
) => () => void

export type ReactDOMEventHandleListener = {
    callback: (event: SyntheticEvent<EventTarget>) => void;
    capture: boolean;
    type: DOMEventName
}