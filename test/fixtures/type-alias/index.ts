export type Yes = 'yes'
export type No = 'no'
export type YesNo = Yes | No
export type ResponseWithAnswer = { hasAnswer: Yes; answer: number }
export type ResponseWithoutAnswer = { hasAnswer: No; reason: string }
export type Response = ResponseWithAnswer | ResponseWithoutAnswer
