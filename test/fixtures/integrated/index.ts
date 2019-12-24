import * as stuff from './stuff'

export { default as createActor } from './actor'
export { Thing } from './model'

export { stuff }
const answer = 42
const id = <T>(x: T) => x
export const getName = () => id(require('../../package.json').name)
export { answer }
