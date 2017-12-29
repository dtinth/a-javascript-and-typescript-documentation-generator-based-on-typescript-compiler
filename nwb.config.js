require('ts-node/register')
let data

module.exports = function ({ args }) {
  return {
    devServer: {
      before (app) {
        app.get('/docs-data', (req, res) => {
          if (!data) {
            console.log('Generating documentation data...')
            const generateDocs = require('./src/generator/generateDocs').default
            let rootFileNames = (args.doc || { }).input
            if (!rootFileNames) {
              console.error('Please specify the file names to generate the docs.')
              console.error('')
              console.error('    --doc.input src/index.js')
              process.exit(1)
            }
            if (!Array.isArray(rootFileNames)) {
              rootFileNames = [ String(rootFileNames) ]
            }
            data = generateDocs(rootFileNames).documentation
          }
          res.json(data)
        })
      }
    }
  }
}
