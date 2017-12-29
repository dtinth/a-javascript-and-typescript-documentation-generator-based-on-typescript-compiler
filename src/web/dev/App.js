import generateDocumentationSite, { renderPage } from '../generateDocumentationSite'

import React from 'react'
import data from '/tmp/redux.json'
import enableHotReload from 'enable-hot-reload'
import styled from 'styled-components'

const hot = enableHotReload(module)

function App () {
  const site = generateDocumentationSite(data)
  return renderPage(site.pages[0])
}

export default hot(React, App)
