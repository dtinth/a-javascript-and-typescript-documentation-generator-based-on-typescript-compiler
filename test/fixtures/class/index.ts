export class VeryBase {
  isNice() {
    return true
  }
}

export class Base extends VeryBase {
  static base = true
  static isBase() {
    return true
  }
  answer() {
    return 42
  }
}

export class Thing extends Base {
  public bound = () => 'bound function'
  private parts = 0
  protected thing = 'yeah'
  constructor()
  constructor(count: number)
  constructor(text: string)
  constructor(...args: any[]) {
    super()
  }
  newMethod() {
    return 'ok'
  }
  isNice() {
    return !!this.parts
  }
}
