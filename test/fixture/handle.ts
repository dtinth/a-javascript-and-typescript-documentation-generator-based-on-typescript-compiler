import { Side } from './model'

export class Handle {
  constructor (public side: Side) {
  }
  toString () {
    return this.endingSide.reduce(
      (a, side) => [ ...a, side.thing.getDisplayName() ],
      [ ]
    ).join('-')
  }
  get endingSide (): Side {
    return this.side.reduce(
      (_, side) => side.oppositeSide,
      this.side.oppositeSide
    )
  }
}

export default Handle
