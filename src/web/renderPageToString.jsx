import * as ReactDOMServer from 'react-dom/server'

import { ServerStyleSheet } from 'styled-components'
import { renderPage } from './generateDocumentationSite'

export default function renderPageToString (page) {
  const sheet = new ServerStyleSheet()
  const body = ReactDOMServer.renderToStaticMarkup(sheet.collectStyles(renderPage(page)))
  const styleTags = sheet.getStyleTags()
  return `<!doctype html>
    <meta charset='utf-8'>
    <style>${require('./global.css.js')}</style>
    ${styleTags}
    <div id="app">${body}</div>`
}
