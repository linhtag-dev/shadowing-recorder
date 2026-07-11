import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { parseServerEnvironment } from './config.js'

const environment = parseServerEnvironment(process.env)
const app = createApp({
  ...(environment.webDistPath === undefined
    ? {}
    : { webRoot: environment.webDistPath }),
})

serve(
  {
    fetch: app.fetch,
    hostname: environment.host,
    port: environment.port,
  },
  (serverInfo) => {
    console.log(
      `Shadowing Recorder is listening on http://${environment.host}:${serverInfo.port} (${environment.nodeEnv})`,
    )
  },
)
