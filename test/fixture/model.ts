
export abstract class Thing {
  public readonly leftSide = new Side(this, 'left', () => this.rightSide)
  public readonly rightSide = new Side(this, 'right', () => this.leftSide)
  abstract getDisplayName(): string
}

export class Side {
  private _connection: Side | null = null
  private _side: string
  private _getOppositeSide: () => Side
  constructor (public thing, side, getOppositeSide) {
    this._side = side
    this._getOppositeSide = getOppositeSide
  }
  isConnected () {
    return !!this._connection
  }
  get oppositeSide (): Side {
    return this._getOppositeSide()
  }
  get connectedSide (): Side {
    if (!this._connection) {
      throw new Error('Side is not connected.')
    }
    return this._connection
  }
  connect (otherSide) {
    if (otherSide._connection === this) {
      this._connection = otherSide
      return
    }
    if (otherSide._connection) {
      throw new Error('Other side already connected.')
    }
    this._connection = otherSide
    otherSide.connect(this)
  }
  reduce<T> (fn: (accumulator: T, side: Side) => T, value: T): T {
    const nextValue = fn(value, this)
    if (!this.oppositeSide.isConnected()) {
      return nextValue
    }
    return this.oppositeSide.connectedSide.reduce(fn, nextValue)
  }
}
