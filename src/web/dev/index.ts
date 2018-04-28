import * as React from 'react'
import * as ReactDOM from 'react-dom'
import css from '../global.css.js'
import App from './App'

const style = document.createElement('style')
style.textContent = css
document.querySelector('head').appendChild(style)
ReactDOM.render(React.createElement(App), document.getElementById('app'))
