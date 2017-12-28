import React from 'react'
import styled from 'styled-components'

/**
 * @typedef {{ render: () => RenderedPage }} Page
 */

/**
 * @typedef {{ content: any, sidebar: any }} RenderedPage
 */

/**
 * Generates a documentation site
 */
export default function generateDocumentationSite (data) {
  return {
    pages: data.publicModules.map(id => createPage(id))
  }

  /**
   * @return {Page}
   */
  function createPage (id) {
    const moduleNode = data.symbols[id]
    return {
      render () {
        const exported = moduleNode.exportedSymbols
        return {
          sidebar: renderSidebar(),
          content: (
            <div>
              <Heading>Module ‘{moduleNode.name}’</Heading>
              <TocList>
                {Object.keys(exported).slice().sort().map(key => {
                  return (
                    <TocListItem key={key}>{key}</TocListItem>
                  )
                })}
              </TocList>
              {Object.keys(exported).map(key => {
                const exportedId = exported[key]
                return (
                  <Item title={key} key={key}>
                    {renderSymbolDocumentation(exportedId)}
                  </Item>
                )
              })}
            </div>
          )
        }
      }
    }
  }

  function renderSidebar () {
    return (
      <nav>
        <SidebarNavHeader>Module list</SidebarNavHeader>
        {data.publicModules.map(id => {
          const moduleNode = data.symbols[id]
          return <SidebarItem>{moduleNode.name}</SidebarItem>
        })}
      </nav>
    )
  }

  function renderSymbolDocumentation (id) {
    const symbol = data.symbols[id]
    if (!symbol) return '(unknown)'
    if (symbol.kind === 'module') {
      return (
        <article>
          <ItemInfo>
            <p>Re-exports from ‘{symbol.name}’.</p>
          </ItemInfo>
        </article>
      )
    }
    return (
      <article>
        <ItemType>{symbol.typeString}</ItemType>
        <ItemInfo>
          <p>{symbol.comment.map(x => x.text)}</p>
        </ItemInfo>
      </article>
    )
  }
}

/**
 * @param {Page} page
 */
export function renderPage (page) {
  const renderResult = page.render()
  return <div>
    <Sidebar>
      {renderResult.sidebar}
    </Sidebar>
    <Main>
      <Container>
        {renderResult.content}
      </Container>
    </Main>
  </div>
}

const BASE = '#D3D0C7'
const SHADOW_1 = '#848284'
const SHADOW_2 = '#424142'
const HIGHLIGHT_1 = '#D3D0C7'
const HIGHLIGHT_2 = '#FFF'

const Main = styled.div`
  margin-left: 256px;
`

const Sidebar = styled.div`
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 256px;
  background: #000;
  color: #fff;
  font-family: Comic Sans MS, sans-serif;
`
const SidebarItem = styled.span`
  display: block;
  padding: 3px 8px;
`
const SidebarNavHeader = styled.p`
  text-align: center;
  color: #888;
  font-weight: bold;
  margin: 0;
  padding: 8px;
`

const Container = styled.div`
  max-width: 700px;
  margin: 0 auto;
`

const Heading = styled.h1`
`

const Item = ({ title, children }) => (
  <ItemContainer>
    <Window>
      <WindowTitle>{title}</WindowTitle>
      {children}
    </Window>
  </ItemContainer>
)

const Window = ({ children }) => (
  <Bordered a={HIGHLIGHT_1} b={SHADOW_2}>
    <Bordered a={HIGHLIGHT_2} b={SHADOW_1}>
      <WindowContent>
        {children}
      </WindowContent>
    </Bordered>
  </Bordered>
)

const ItemContainer = styled.div`
  margin: 0 0 2em;
`

const WindowContent = styled.div`
  padding: 2px;
  background: ${BASE};
`

const WindowTitle = styled.h2`
  font-size: 1.2em;
  padding: 8px;
  margin: 0;
  background: linear-gradient(to right, #09246B, #A4CBF6);
  text-shadow: 1px 1px 0 #000;
  color: white;
`
const ItemInfo = ({ children }) => (
  <ItemInfoContainer>
    <Bordered a={SHADOW_1} b={HIGHLIGHT_1}>
      <Bordered a={SHADOW_2} b={HIGHLIGHT_2}>
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
const ItemType = ({ children }) => (
  <ItemTypeContainer>
    <Bordered a={SHADOW_1} b={HIGHLIGHT_2}>
      <Bordered a={HIGHLIGHT_2} b={SHADOW_1}>
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
const TocList = styled.ul``
const TocListItem = styled.li``

const Bordered = styled.div`
  border: 1px solid ${props => props.b};
  border-top-color: ${props => props.a};
  border-left-color: ${props => props.a};
`
