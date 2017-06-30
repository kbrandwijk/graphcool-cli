
import { SystemEnvironment, Resolver } from '../../types'

import * as ProgressBar from 'progress'
import * as through2 from 'through2'

import * as lazypipe from 'lazypipe'

import { EventEmitter } from 'events'

import * as jsonImporter from './jsonImporter'

import * as cliImporter from './cliImporter'

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

  private progressBar: ProgressBar = new ProgressBar('Importing [:bar] :rate bps :percent :etas', {
    complete: '=',
    incomplete: ' ',
    width: 60,
    total: 0
  })

  constructor(props: Props, env: SystemEnvironment) {
    this.props = props
    this.resolver = env.resolver
    this.progressBar.total = this.resolver.size(this.props.dataPath!)
    this.props.batchSize = Math.max(this.props.batchSize || 25, 50)

    this.importer = jsonImporter //Ignore format argument for now
  }

  public doImport = () => {

    this.events.on("tick", (bytesprocessed) => {
      this.progressBar.tick(bytesprocessed)
    })

    let chain = lazypipe()
      .pipe(this.importer.reader || this.resolver.readStream, this.props.dataPath!)
      .pipe(cliImporter.count)

    this.importer.transforms.forEach((transform: any) => { chain = chain.pipe(transform) })

    chain = chain
      .pipe(cliImporter.toMutation)
      .pipe(cliImporter.toBatchMutation)
      .pipe(cliImporter.toApi, this.props.projectId)
      .pipe(cliImporter.toConsole)()
  }
}
