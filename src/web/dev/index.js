/* eslint import/no-webpack-loader-syntax: off */
import '!!style-loader!../global.css.js'

import * as React from 'react'
import * as ReactDOM from 'react-dom'

import App from './App'

ReactDOM.render(<App />, document.getElementById('app'))
module.hot.accept()
