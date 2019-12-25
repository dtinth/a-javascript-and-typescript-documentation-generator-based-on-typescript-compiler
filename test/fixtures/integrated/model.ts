/**
 * A physical Thing that has 2 sides, `leftSide` and `rightSide`.
 * Two Thing objects can be connected together by putting them side-by-side.
 */
export abstract class Thing {
  /**
   * The left Side of a Thing
   */
  public readonly leftSide = new Side(this, 'left', () => this.rightSide)
  /**
   * The right Side of a Thing
   */
  public readonly rightSide = new Side(this, 'right', () => this.leftSide)
  public isThing() {
    return true
  }
  abstract getDisplayName(): string
}

/**
 * A Side of a thing.
 */
export class Side {
  private _connection: Side | null = null
  private _side: string
  private _getOppositeSide: () => Side
  constructor(
    /**
     * The Thing this Side belongs to.
     */
    public thing: Thing,
    side,
    getOppositeSide,
  ) {
    this._side = side
    this._getOppositeSide = getOppositeSide
  }

  /**
   * Returns true if this Side is already connected to another Side.
   */
  isConnected() {
    return !!this._connection
  }

  /**
   * The opposite Side of the belonging Thing.
   */
  get oppositeSide() {
    return this._getOppositeSide()
  }

  /**
   * A Side of another Thing that is connected to this Side.
   */
  get connectedSide() {
    return this._connection
  }

  /**
   * Connects this Side to another Side of another Thing.
   * This is the way you put things side-by-side.
   */
  connect(otherSide) {
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

  reduce<T>(fn: (accumulator: T, side: Side) => T, value: T): T {
    const nextValue = fn(value, this)
    if (!this.oppositeSide.isConnected()) {
      return nextValue
    }
    return this.oppositeSide.connectedSide.reduce(fn, nextValue)
  }
}
