import { Bordered, colors } from './ui'

import React from 'react'
import styled from 'styled-components'

export const Window = ({ children }) => (
  <Bordered a={colors.HIGHLIGHT_1} b={colors.SHADOW_2}>
    <Bordered a={colors.HIGHLIGHT_2} b={colors.SHADOW_1}>
      <WindowContent>
        {children}
      </WindowContent>
    </Bordered>
  </Bordered>
)
export default Window
const WindowContent = styled.div`
  padding: 2px;
  background: ${colors.BASE};
`
export const WindowTitle = styled.h2`
  font-size: 1.2em;
  padding: 8px;
  margin: 0;
  background: linear-gradient(to right, #09246B, #A4CBF6);
  text-shadow: 1px 1px 0 #000;
  color: white;
`
