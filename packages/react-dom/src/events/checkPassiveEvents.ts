import { canUseDOM } from "shared/ExecutionEnvironment";

export let passiveBrowserEventsSupported = false

if (canUseDOM) {
    try {
        const options = {}
        Object.defineProperty(options, 'passive', {
            get: function() {
                passiveBrowserEventsSupported = true
            }
        });
        (window as any).addEventListener('test', options, options)
        (window as any).removeEventListener('test', options, options)
    } catch (e) {
        passiveBrowserEventsSupported = false
    }
}
