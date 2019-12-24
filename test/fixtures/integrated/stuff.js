import { Thing } from './model'

export class Pen extends Thing {
  getDisplayName () {
    return 'Pen'
  }
  toString () {
    return 'a pen'
  }
}

export class MalusPumila extends Thing {
  getDisplayName () {
    return 'Apple'
  }
  toString () {
    return 'an apple'
  }
}

export class AnanasComosus extends Thing {
  getDisplayName () {
    return 'Pineapple'
  }
  toString () {
    return 'pineapple'
  }
}
