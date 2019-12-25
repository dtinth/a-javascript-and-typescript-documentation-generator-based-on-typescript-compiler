export interface Something {
  a: string
}
export interface Something {
  b: number
}
export interface Something {
  /**
   * Return the sum as number
   */
  getSum(): number
  /**
   * Return the sum as string
   * @param asString Return as string
   */
  getSum(asString: false): number
  /**
   * Return the sum as number
   * @param asString Return as string
   */
  getSum(asString: true): string
}
export interface Something {
  (): [number, string]
}
export let something: Something
