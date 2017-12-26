import Handle from './handle'
import { Thing } from './model'

/**
 * An Actor.
 */
class Actor {
  /**
   * Creates an actor
   */
  constructor () {
    /**
     * @type {Handle[]}
     */
    this.stack = [ ]
  }

  /**
   * Acquires a thing. The actor will announce that this actor has the thing.
   * @param {Thing} thing The thing to acquire.
   */
  acquire (thing) {
    this.say(`I have ${thing}`)
    this.stack.push(new Handle(thing.leftSide))
  }

  /**
   * Recalls the list of things this actor has.
   */
  recall () {
    for (const handle of this.stack) {
      this.say(`${handle}`)
    }
  }

  /**
   * Combines the two last-acquired things, and announce it.
   */
  combine () {
    const rightHandle = this.stack.pop()
    const leftHandle = this.stack.pop()
    leftHandle.endingSide.connect(rightHandle.endingSide)
    this.say('Uhh!')
    this.say(`${leftHandle}`)
    this.stack.push(leftHandle)
  }

  /**
   * Say something
   * @private
   */
  say (text) {
    console.log(text)
  }
}

export default function createActor () {
  return new Actor()
}
