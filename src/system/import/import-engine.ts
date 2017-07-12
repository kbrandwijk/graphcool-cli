
import { SystemEnvironment, Resolver } from '../../types'
import * as jsonNormalizer from './normalizers/jsonNormalizer'
import * as cliImporter from './cliImporter'
import { readDataBar, readObjectsBar, writeObjectsBar } from './progressBars'

import * as lazypipe from 'lazypipe'
import { EventEmitter } from 'events'
import * as bytes from 'bytes'

interface Props {
  projectId: string
  dataPath: string
  batchSize?: number
  format?: string
}

export class ImportEngine {

  private props: Props
  private resolver: Resolver
  private normalizer: any
  private events: EventEmitter = cliImporter.events

  constructor(props: Props, env: SystemEnvironment) {
    this.props = props
    this.resolver = env.resolver

    readDataBar.total = this.resolver.size(this.props.dataPath!)
    this.props.batchSize = Math.max(this.props.batchSize || 25, 50)

    this.normalizer = jsonNormalizer //Ignore format argument for now
  }

  public doImport = async () => {

    this.addEventsHandlers()

    await cliImporter.readState()
    await this.buildAndExecuteChain()

    await cliImporter.SaveStateToFile()
  }

  private buildAndExecuteChain = () => {
    return new Promise((resolve, reject) => {
      let chain = lazypipe()
        .pipe(this.normalizer.reader || this.resolver.readStream, this.props.dataPath!)
        .pipe(cliImporter.count)

      this.normalizer.transforms.forEach((transform: any) => { chain = chain.pipe(transform) })

      chain = chain
        .pipe(cliImporter.filterImported)
        .pipe(cliImporter.toMutation)
        .pipe(cliImporter.toBatchMutation)
        .pipe(cliImporter.toApi, this.props.projectId)
        .pipe(cliImporter.toSaveStateInMemory)
        .pipe(cliImporter.toConsole)()
        .on('end', () => resolve())
    })
  }

  private addEventsHandlers = () => {
    this.events
      .on("tick", (processed) => { readDataBar.tick(processed, { 'size': bytes(readDataBar.curr) }) })
      .on("writeCount", (count) => { writeObjectsBar.tick({'number': count, 'complete': ''}) })
      .on("readCount", (count, skipCount) => { readObjectsBar.tick({'number': count, 'skip': skipCount, 'complete': ''}) })
      .on("readComplete", (count, skipCount) => { readObjectsBar.tick({'complete': '- Done', 'skip': skipCount, 'number': count}) })
      .on("writeComplete", (count) => { writeObjectsBar.tick({'complete': '- Done', 'number': count}) })
      .on("skippedRecord", (count, skipCount) => { readObjectsBar.tick({'number': count, 'skip': skipCount, 'complete': ''}) })
      .on("message", (message) => { console.log(`\n${message}`) })
  }
}
