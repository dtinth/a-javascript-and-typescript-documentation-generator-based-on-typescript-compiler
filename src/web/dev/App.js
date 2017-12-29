import * as React from 'react'

import generateDocumentationSite, {
  renderPage
} from '../generateDocumentationSite'

import DocumentationLoader from './DocumentationLoader'
import enableHotReload from 'enable-hot-reload'

const hot = enableHotReload(module)

function Error ({ children }) {
  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        fontSize: 20,
        padding: 10,
        fontFamily: 'Comic Sans MS, sans-serif',
        textShadow: '0 0 5px #aaffaa, 0 0 10px #aaffaa'
      }}
    >
      {children}
    </pre>
  )
}

function App () {
  return (
    <DocumentationLoader
      render={data => {
        if (typeof data === 'string') {
          return <Error>{data}</Error>
        }
        try {
          const site = generateDocumentationSite(data)
          return renderPage(site.pages[0])
        } catch (e) {
          setTimeout(() => { throw e })
          return <Error>{e.stack}</Error>
        }
      }}
    />
  )
}

export default hot(React, App)
