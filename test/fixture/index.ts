import * as stuff from './stuff'

export { default as createActor } from './actor'
export { Thing } from './model'

export { stuff }
export const getName = () => require('../../package.json').name
