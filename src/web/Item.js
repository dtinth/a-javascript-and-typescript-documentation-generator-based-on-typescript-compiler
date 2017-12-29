import * as React from 'react'

import { Bordered, colors } from './ui'
import Window, { WindowTitle } from './Window'

import styled from 'styled-components'

export const Item = ({ title, children }) => (
  <ItemContainer>
    <Window>
      <WindowTitle>{title}</WindowTitle>
      {children}
    </Window>
  </ItemContainer>
)
const ItemContainer = styled.div`
  margin: 0 0 2em;
`
export const ItemInfo = ({ children }) => (
  <ItemInfoContainer>
    <Bordered a={colors.SHADOW_1} b={colors.HIGHLIGHT_1}>
      <Bordered a={colors.SHADOW_2} b={colors.HIGHLIGHT_2}>
        <ItemInfoContent>
          {children}
        </ItemInfoContent>
      </Bordered>
    </Bordered>
  </ItemInfoContainer>
)
const ItemInfoContainer = styled.div`
  margin-top: 2px;
`
const ItemInfoContent = styled.div`
  padding: 8px;
  background: #fff;
`
export const ItemType = ({ children }) => (
  <ItemTypeContainer>
    <Bordered a={colors.SHADOW_1} b={colors.HIGHLIGHT_2}>
      <Bordered a={colors.HIGHLIGHT_2} b={colors.SHADOW_1}>
        <ItemTypeContent>{children}</ItemTypeContent>
      </Bordered>
    </Bordered>
  </ItemTypeContainer>
)
const ItemTypeContainer = styled.div`
  margin-top: 2px;
`
const ItemTypeContent = styled.pre`
  font-size: 14px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  white-space: pre-wrap;
  font-family: Cousine, Menlo, Consolas, monospace;
`
export default Item
