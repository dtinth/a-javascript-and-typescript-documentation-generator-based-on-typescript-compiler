import React from 'react'
import styled from 'styled-components'

/**
 * @typedef {{ render: () => RenderedPage }} Page
 */

/**
 * @typedef {{ content: any }} RenderedPage
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
    <Main>
      <Container>
        {renderResult.content}
      </Container>
    </Main>
    <Sidebar></Sidebar>
  </div>
}

const Main = styled.div`
  margin-left: 256px;
`

const Sidebar = styled.div`
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 256px;
  background: #ccc;
`

const Container = styled.div`
  max-width: 700px;
  margin: 0 auto;
`

const Heading = styled.h1`
`

const Item = ({ title, children }) => (
  <ItemBox>
    <ItemTitle>{title}</ItemTitle>
    {children}
  </ItemBox>
)

const ItemBox = styled.section`
  border: 1px solid #bbb;
  margin: 2em 0 0;
  overflow: hidden;
  border-radius: 4px;
`
const ItemTitle = styled.h2`
  font-size: 1.2em;
  padding: 8px;
  margin: 0;
  background: #bbb;
  text-shadow: 0 1px 0 #eee;
`
const ItemInfo = styled.div`
  padding: 8px;
`
const ItemType = styled.pre`
  background: #eee;
  font-size: 14px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  white-space: pre-wrap;
  font-family: Cousine, Menlo, Consolas, monospace;
`
const TocList = styled.ul``
const TocListItem = styled.li``
