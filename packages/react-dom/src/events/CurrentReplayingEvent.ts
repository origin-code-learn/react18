import { AnyNativeEvent } from "./PluginModuleType";


let currentReplayingEvent = null

export function isReplayingEvent(event: AnyNativeEvent) {
    return event === currentReplayingEvent
}