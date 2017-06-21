import { sendProjectMutation } from '../../api/api'
import {
  SystemEnvironment, Resolver
} from '../../types'

import * as JSONStream from 'JSONStream'
import * as meter from 'stream-meter'
import * as ProgressBar from 'progress'
import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'
import * as fs from 'fs'
import * as lazypipe from 'lazypipe'

import * as jsonImporter from './jsonImporter'

interface Props {
  projectId: string
  dataPath: string
  batchSize?: number
}

export class ImportEngine {

  private props: Props

  // TODO: Now hardcoded to movie, because of issue reading type name from data file
  private mutationTemplate = (index, data) => `mut${index}: createMovie( ${data.map(field => `${field[0]}: \"${field[1]}\"`).join(', ')}) { id }`

  private batchMutationTemplate = data => `mutation { ${data.map(mutation => `${mutation}`).join(' ')} }`

  private resolver: Resolver

  private streamMeter:meter = meter()

  private progressBar:ProgressBar = new ProgressBar('importing [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 50,
      total: 0
    })

  private importer:any

  constructor(props: Props, env: SystemEnvironment) {
    this.props = props
    this.resolver = env.resolver
    this.progressBar.total = fs.statSync(this.props.dataPath!).size // TODO: Move fs to resolver
    this.props.batchSize = this.props.batchSize || 25
    this.importer = jsonImporter
  }

  private showMeter = () => {
    const _self = this;
    let bytesprocessed = 0;
    return through2.obj((data, enc, cb) => {
      if (_self.streamMeter.bytes - bytesprocessed > 0) {
        _self.progressBar.tick(_self.streamMeter.bytes - bytesprocessed)
      }
      bytesprocessed = _self.streamMeter.bytes
      cb(null, data)
    })
  }

  private toFieldArray = () => {
    return through2.obj((data, enc, cb) => {
      const out = Object.keys(data).map(d => [d, data[d]])
      cb(null, out)
    })
  }

  mutationCount:number = 0;
  private toMutation = () => {
    const _self = this;
    return through2.obj((data, enc, cb) => {
      //console.log('data', data)
      const result = _self.mutationTemplate(_self.mutationCount, data)
      //console.log('result', result)
      _self.mutationCount++
      cb(null, result)
    })
  }

  private toBatchMutation = () => {
    const _self = this
    let i = 0
    let batch: any = []

    return through2.obj((data, enc, cb) => {
      if (i++ < _self.props.batchSize!) {
        batch.push(data)
        cb(null, null)
      }
      else {
        const result = _self.batchMutationTemplate(batch)
        i = 0
        batch = []
        cb(null, result)
      }
    }, function(cb) {
      const result = _self.batchMutationTemplate(batch)
      i = 0
      batch = []
      this.push(result)
      cb()
    }
    )
  }

  start:number

  private toConsole = () => {
    const _self = this;

    return through2.obj(function(data, enc, cb) {
      cb(null, null);
    }, function(cb) {
      let end = Date.now();
      console.log(`Import done. Imported ${_self.mutationCount} records in ${end - _self.start}ms`)
      cb()
    });
  };

  private toApi = () => {
    const _self = this;
    return through2concurrent.obj({ maxConcurrency: 8 }, async function(data, enc, cb) {
      const newChunk = await sendProjectMutation(_self.props.projectId, data)
      this.push(newChunk)
      cb()
    })
  };

  private getStreamMeter = () => this.streamMeter

  private getFileStream = () => this.resolver.readStream(this.props.dataPath!)

  doImport = () => {

    this.start = Date.now()

    let chain = lazypipe()
      .pipe(this.importer.reader || this.getFileStream)
      .pipe(this.getStreamMeter)
      .pipe(this.showMeter)

    this.importer.transforms.forEach((element:any) => {
      chain = chain.pipe(element)
    })

    chain.pipe(this.toFieldArray)
      .pipe(this.toMutation)
      .pipe(this.toBatchMutation)
      .pipe(this.toApi)
      .pipe(this.toConsole)()
  }
}
