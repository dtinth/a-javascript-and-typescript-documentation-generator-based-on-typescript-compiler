require('ts-node/register')
let data

module.exports = function ({ args }) {
  let rootFileNames = (args.doc || {}).input
  if (!rootFileNames) {
    console.error('Please specify the file names to generate the docs.')
    console.error('')
    console.error('    --doc.input src/index.js')
    process.exit(1)
  }
  return {
    webpack: {
      config (config) {
        config.resolve.extensions.push('.ts', '.tsx', '.jsx')
        config.module.rules = config.module.rules.filter(rule => {
          return !/babel-loader/.test(rule.loader)
        })
        config.module.rules.push({
          test: /\.tsx?$/,
          loader: 'awesome-typescript-loader'
        })
        config.module.rules.push({
          test: /\.jsx?$/,
          exclude: /node_modules/,
          loader: 'awesome-typescript-loader'
        })
        return config
      }
    },
    devServer: {
      before (app) {
        app.get('/docs-data', (req, res) => {
          if (!data) {
            console.log('Generating documentation data...')
            const generateDocs = require('./src/generator/generateDocs').default
            if (!Array.isArray(rootFileNames)) {
              rootFileNames = [String(rootFileNames)]
            }
            data = generateDocs(rootFileNames).documentation
          }
          res.json(data)
        })
      }
    }
  }
}
