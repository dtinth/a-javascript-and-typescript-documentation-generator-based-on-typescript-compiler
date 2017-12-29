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
          sidebar: renderSidebar(id),
          content: (
            <div>
              <Heading>Module ‘{moduleNode.name}’</Heading>
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

  function renderSidebar (currentModuleId) {
    return (
      <nav>
        <SidebarNavHeader>Module list</SidebarNavHeader>
        {data.publicModules.map(id => {
          const moduleNode = data.symbols[id]
          return <SidebarItem key={id}>
            <SidebarModule>{moduleNode.name}</SidebarModule>
            {id === currentModuleId && renderIndex(currentModuleId)}
          </SidebarItem>
        })}
      </nav>
    )

    function renderIndex (id) {
      const moduleNode = data.symbols[id]
      const exported = moduleNode.exportedSymbols
      return (
        <TocList>
          {Object.keys(exported).slice().sort().map(key => {
            return (
              <TocListItem key={key}>{key}</TocListItem>
            )
          })}
        </TocList>
      )
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
          <Doc thing={symbol} />
          {symbol.kind === 'function' && renderList('Call signatures', renderSignatures(symbol.callSignatures))}
          {symbol.kind === 'class' && <React.Fragment>
            {symbol.constructSignatures.length > 0 && renderList('Constructors', renderSignatures(symbol.constructSignatures))}
            {Object.keys(symbol.classMembers).length > 0 && renderList('Class members', renderMembers(symbol.classMembers))}
            {Object.keys(symbol.instanceMembers).length > 0 && renderList('Instance members', renderMembers(symbol.instanceMembers))}
          </React.Fragment>}
        </ItemInfo>
      </article>
    )
  }

  function renderSignatures (signatures) {
    return signatures.map((signature, index) =>
      <details key={index}>
        <summary>
          ({signature.parameters.map((param, index) => {
            return <React.Fragment key={index}>
              {index > 0 && ', '}
              <strong>{param.name}</strong>: {param.typeString}
            </React.Fragment>
          })}): {signature.returnType}
        </summary>
        <div>
          <Doc thing={signature} />
          {signature.parameters.length > 0 && <React.Fragment>
            <p><strong>Parameters:</strong></p>
            <ul>
              {signature.parameters.map((param, index) => {
                return <li key={index}>
                  <strong>{param.name}</strong>: {param.typeString}
                  <Doc thing={param} />
                </li>
              })}
            </ul>
          </React.Fragment>}
          <p><strong>Returns</strong> {signature.returnType}</p>
        </div>
      </details>
    )
  }

  function renderMembers (members) {
    return Object.keys(members).map(key => {
      const id = members[key]
      const targetSymbol = data.symbols[id]
      return <details key={key}>
        <summary><strong>{key}</strong>: {renderSymbolRepresentationInline(members[key])}</summary>
        {!!targetSymbol && <React.Fragment>
          <Doc thing={targetSymbol} />
          {targetSymbol.kind === 'function' && renderList('Call signatures', renderSignatures(targetSymbol.callSignatures))}
        </React.Fragment>}
      </details>
    })
  }

  function renderList (title, elements) {
    return (
      <Tableist>
        <Tableist.Title>{title}</Tableist.Title>
        {elements.map(element =>
          <Tableist.Item key={element.key}>{element}</Tableist.Item>
        )}
      </Tableist>
    )
  }

  function renderSymbolRepresentationInline (id) {
    const symbol = data.symbols[id]
    if (!symbol) return '?'
    if (symbol.kind === 'module') {
      return <span>module ‘{symbol.name}’</span>
    }
    return <span>{symbol.typeString}</span>
  }
}

function Doc ({ thing }) {
  return <React.Fragment>
    <p>{thing.comment.map(x => x.text)}</p>
  </React.Fragment>
}

const Section = ({ title, children }) => (
  <section>
    <h3>{title}</h3>
    {children}
  </section>
)

const Tableist = styled.ul`
  padding: 0;
  list-style: none;
  border: 1px solid #bbb;
`
Tableist.Title = styled.li`
  padding: 5px;
  background: #e5e5e5;
  font-weight: bold;
`
Tableist.Item = styled.li`
  padding: 10px;
  border-top: 1px solid #bbb;
`

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
  overflow: auto;
  overflow-x: hidden;
`
const SidebarItem = styled.span`
  display: block;
  padding: 3px 8px;
`
const SidebarModule = styled.span`
  color: #0f0;
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
