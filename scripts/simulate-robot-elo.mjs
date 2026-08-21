import { build } from 'esbuild'

const result = await build({
  absWorkingDir: process.cwd(),
  entryPoints: ['scripts/robot-elo-cli.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
  tsconfig: 'tsconfig.json',
})

const javascript = result.outputFiles.find((file) => file.path.endsWith('.js')) ?? result.outputFiles[0]
if (!javascript) throw new Error('Elo simulator build produced no JavaScript output')

const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript.contents).toString('base64')}`
await import(moduleUrl)
