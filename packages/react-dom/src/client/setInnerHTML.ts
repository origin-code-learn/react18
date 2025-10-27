import createMicrosoftUnsafeLocalFunction from "./createMicrosoftUnsafeLocalFunction"


const setInnerHTML = createMicrosoftUnsafeLocalFunction(function (node: Element, html: {valueOf(): { toString(): string }}){
    debugger
})

export default setInnerHTML