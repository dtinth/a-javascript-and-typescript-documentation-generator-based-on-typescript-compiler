import * as colors from './colors'

import styled from 'styled-components'

export { colors }

export const Bordered = styled.div`
  border: 1px solid ${props => props.b};
  border-top-color: ${props => props.a};
  border-left-color: ${props => props.a};
`
