// Never replace the value being typed: rewriting a numeric field moves its caret
// and turns the first digit into a decimal before the person finishes the number.
export function setComputedValue(control,value,activeElement=globalThis.document?.activeElement){if(control&&control!==activeElement)control.value=String(value);}
