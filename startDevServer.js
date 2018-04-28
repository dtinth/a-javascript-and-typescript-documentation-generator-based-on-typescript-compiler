const Bundler = require('parcel-bundler')
const app = require('express')()
let data

process.on('unhandledRejection', up => { throw up })

function generate () {
  const files = [ 'src/generator/index.ts' ]
  return new Promise((resolve, reject) => {
    require('child_process').execFile(
      './node_modules/.bin/ts-node',
      [ 'src/cli/index.ts', ...files ],
      (err, stdout, stderr) => {
        if (err) return reject(err)
        try {
          resolve(JSON.parse(stdout))
        } catch (e) {
          reject(e)
        }
      }
    )
  })
}

async function start() {
  const file = require.resolve('./src/web/dev/index.html')
  const options = {}
  const bundler = new Bundler(file, options);
  app.get('/docs-data', async (req, res, next) => {
    try {
      if (!data) {
        console.log('Generating documentation data...')
        data = generate().catch(e => { data = null; throw e })
      }
      res.json(await data)
    } catch (e) {
      next(e)
    }
  })
  app.use(bundler.middleware());
  app.listen(1235);
}

start()
