
import { SystemEnvironment, Resolver } from '../../types'

import * as Multiprogress from 'multi-progress'
import * as through2 from 'through2'

import * as lazypipe from 'lazypipe'

import { EventEmitter } from 'events'

import * as jsonImporter from './jsonImporter'

import * as cliImporter from './cliImporter'
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
  private importer: any
  private events: EventEmitter = cliImporter.events
  private multi = new Multiprogress()

  private readDataBar = this.multi.newBar('Reading [:bar] :size :percent :etas', {
    complete: '=',
    incomplete: ' ',
    renderThrottle: 100,
    size: '0',
    width: 60,
    total: 0
  })

  private readObjectsBar = this.multi.newBar('Records read: :number, skipped :skip existing records :complete', {
    total: 0,
    'number': '0',
    renderThrottle: 100,
    'skip': '0',
    'complete' : ''
  })

  private writeObjectsBar = this.multi.newBar('Records imported: :number :complete', {
    total: 0,
    'number': '0',
    renderThrottle: 100,
    'complete' : ''
  })

  constructor(props: Props, env: SystemEnvironment) {
    this.props = props
    this.resolver = env.resolver

    this.readDataBar.total = this.resolver.size(this.props.dataPath!)
    this.props.batchSize = Math.max(this.props.batchSize || 25, 50)

    this.importer = jsonImporter //Ignore format argument for now
  }

  public doImport = async () => {

    this.events
      .on("tick", (processed) => { this.readDataBar.tick(processed, { 'size': bytes(this.readDataBar.curr) }) })
      .on("writeCount", (count) => { this.writeObjectsBar.tick({'number': count, 'complete': ''}) })
      .on("readCount", (count, skipCount) => { this.readObjectsBar.tick({'number': count, 'skip': skipCount, 'complete': ''}) })
      .on("readComplete", (count, skipCount) => { this.readObjectsBar.tick({'complete': '- Done', 'skip': skipCount, 'number': count}) })
      .on("writeComplete", (count) => { this.writeObjectsBar.tick({'complete': '- Done', 'number': count}) })
      .on("skippedRecord", (count, skipCount) => { this.readObjectsBar.tick({'number': count, 'skip': skipCount, 'complete': ''}) })
      .on("message", (message) => { console.log(`\n${message}`); cliImporter.SaveStateToFile() })

    await cliImporter.readState()

    let chain = lazypipe()
      .pipe(this.importer.reader || this.resolver.readStream, this.props.dataPath!)
      .pipe(cliImporter.count)

    this.importer.transforms.forEach((transform: any) => { chain = chain.pipe(transform) })

    chain = await chain
      .pipe(cliImporter.filterImported)
      .pipe(cliImporter.toMutation)
      .pipe(cliImporter.toBatchMutation)
      .pipe(cliImporter.toApi, this.props.projectId)
      .pipe(cliImporter.toSaveStateInMemory)
      .pipe(cliImporter.toConsole)()
  }
}
