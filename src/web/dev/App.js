import generateDocumentationSite, { renderPage } from '../generateDocumentationSite'

import React from 'react'
import enableHotReload from 'enable-hot-reload'

const hot = enableHotReload(module)

class App extends React.Component {
  constructor (props) {
    super(props)
    this.state = { data: 'Loading...' }
  }
  async componentDidMount () {
    try {
      const json = await window.fetch('/docs-data').then(res => res.json())
      const site = generateDocumentationSite(json)
      this.setState({ data: site })
    } catch (e) {
      this.setState({ data: e.stack })
      setTimeout(() => { throw e })
    }
  }
  componentDidCatch (e) {
    this.setState({ data: e.stack })
    setTimeout(() => { throw e })
  }
  render () {
    const { data } = this.state
    if (typeof data === 'string') {
      return <pre style={{ whiteSpace: 'pre-wrap', fontSize: 20, padding: 10, fontFamily: 'Comic Sans MS, sans-serif', textShadow: '0 0 5px #aaffaa, 0 0 10px #aaffaa' }}>{data}</pre>
    }
    const site = data
    return renderPage(site.pages[0])
  }
}

export default hot(React, App)
