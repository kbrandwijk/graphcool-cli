import { sendProjectMutation } from '../../api/api'
import { SystemEnvironment, Resolver } from '../../types'

import * as meter from 'stream-meter'
import * as ProgressBar from 'progress'
import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'
import * as lazypipe from 'lazypipe'

import * as jsonImporter from './jsonImporter'

interface Props {
  projectId: string
  dataPath: string
  batchSize?: number
  format?: string
}

export class ImportEngine {

  private props: Props

  private mutationTemplate = (index, data) => `mut${index}: updateOrCreate${data.typeName}( update: { id: \"\"}, create: $obj${index}) { id }`

  private batchMutationTemplate = (data, variables, typenames) => `mutation(${Object.keys(variables).map((k, index) => `$${k}: Create${typenames[index]}!`)}) { ${data.map(mutation => `${mutation}`).join(' ')} }`

  private resolver: Resolver

  private streamMeter: meter = meter()

  private progressBar: ProgressBar = new ProgressBar('Importing [:bar] :percent :etas', {
    complete: '=',
    incomplete: ' ',
    width: 60,
    total: 0
  })

  private importer: any

  private start: number

  constructor(props: Props, env: SystemEnvironment) {
    this.props = props
    this.resolver = env.resolver
    this.progressBar.total = this.resolver.size(this.props.dataPath!)
    this.props.batchSize = Math.max(this.props.batchSize || 25, 50)

    this.importer = jsonImporter //Ignore format argument for now
  }

  private showMeter = () => {
    const _self = this
    let bytesprocessed = 0
    return through2.obj((data, enc, cb) => {
      if (_self.streamMeter.bytes - bytesprocessed > 0) {
        _self.progressBar.tick(_self.streamMeter.bytes - bytesprocessed)
      }
      bytesprocessed = _self.streamMeter.bytes
      cb(null, data)
    })
  }

  private toMutation = () => {
    let mutationCount = 0
    const _self = this
    return through2.obj((data, enc, cb) => {
      const mutation = _self.mutationTemplate(mutationCount, data)
      const variable = {}
      variable[`obj${mutationCount}`] = data.record
      mutationCount++
      
      cb(null, { mutation, variable, typeName: data.typeName })
    })
  }

  private toBatchMutation = () => {
    const _self = this
    let i = 0
    let mutationBatch: any = []
    let typeNames: any = []
    let variables = {}

    return through2.obj((data, enc, cb) => {

      const { mutation, variable, typeName } = data
      mutationBatch.push(mutation)
      typeNames.push(typeName)
      variables = Object.assign(variables, variable)
      i++

      if (i == _self.props.batchSize) {
        const batchMutation = _self.batchMutationTemplate(mutationBatch, variables, typeNames)
        const result = { batchMutation, variables }
        //console.log('variables length: ', Object.keys(variables).length)
        //console.log('batchMutation', batchMutation)
        i = 0
        mutationBatch = []
        typeNames = []
        variables = {}
        cb(null, result)
      }
      else {
        cb(null, null)
      }
    }, function(cb) {
      if (i > 0) {
        const batchMutation = _self.batchMutationTemplate(mutationBatch, variables, typeNames)
        const result = { batchMutation, variables }
        i = 0
        mutationBatch = []
        typeNames = []
        variables = {}

        cb(null, result)
      }
    }
    )
  }

  private toConsole = () => {
    const _self = this
    let persistedRecordCount = 0
    return through2.obj(function(data, enc, cb) {
      persistedRecordCount += data
      cb(null, null)
    }, function(cb) {
      let end = Date.now();
      console.log(`Import done. Imported ${persistedRecordCount} records in ${end - _self.start}ms`)
      cb()
    })
  }

  private toApi = () => {
    const _self = this
    return through2concurrent.obj({ maxConcurrency: 10 }, async function(data, enc, cb) {
      const newChunk = await sendProjectMutation(_self.props.projectId, data)
      cb(null, Object.keys(newChunk.data).length)
    })
  };

  private getStreamMeter = () => this.streamMeter

  private getFileStream = (filepath) => this.resolver.readStream(filepath)

  public doImport = () => {

    this.start = Date.now()

    const transforms = [this.getStreamMeter,
                        this.showMeter,
                        ...this.importer.transforms,
                        this.toMutation,
                        this.toBatchMutation,
                        this.toApi,
                        this.toConsole]

    let chain = lazypipe().pipe(this.importer.reader || this.getFileStream, this.props.dataPath!)
    transforms.forEach((transform: any) => { chain = chain.pipe(transform) })
    chain()
  }
}
