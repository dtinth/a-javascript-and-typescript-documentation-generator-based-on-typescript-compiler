import Item, { ItemInfo, ItemType } from './Item'
import Sidebar, { SidebarItem, SidebarModule, SidebarNavHeader } from './Sidebar'

import React from 'react'
import Tableist from './Tableist'
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

const Main = styled.div`
  margin-left: 256px;
`
const Container = styled.div`
  max-width: 700px;
  margin: 0 auto;
`
const Heading = styled.h1`
`
const TocList = styled.ul``
const TocListItem = styled.li``
