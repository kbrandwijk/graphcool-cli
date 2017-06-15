import { sendProjectMutation } from '../../api/api'
import {
  SystemEnvironment, Resolver
} from '../../types'

import * as JSONStream from 'JSONStream'
import * as meter from 'stream-meter'
import * as ProgressBar from 'progress'
import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'

interface Props {
  progressBar: ProgressBar
  projectId: string
  dataPath: string
}

export class defaultImport {

  props: Props
  batchSize: number = 25
  batchMutationTemplate = data => `mutation { ${data.map(mutation => `${mutation}`).join(' ')} }`

  resolver: Resolver

  streamMeter:meter

  // TODO: Now hardcoded to movie, because of issue reading type name from data file
  mutationTemplate = (index, data) => `mut${index}: createMovie( ${data.map(field => `${field[0]}: \"${field[1]}\"`).join(', ')}) { id }`

  constructor(props: Props, env: SystemEnvironment) {
    this.props = props
    this.resolver = env.resolver
    this.streamMeter = meter()
  }

  private toJSON = () => {
    return JSONStream.parse('*.*')
  }

  private toFieldArray = () => {
    const _self = this;
    let bytesprocessed = 0;
    return through2.obj((data, enc, cb) => {
      if (_self.streamMeter.bytes - bytesprocessed > 0) {
        _self.props.progressBar.tick(_self.streamMeter.bytes - bytesprocessed)
      }
      bytesprocessed = _self.streamMeter.bytes

      const out = Object.keys(data).map(d => [d, data[d]])
      cb(null, out)
    })
  }

  mutationCount:number = 0;
  private toMutation = () => {
    const _self = this;
    return through2.obj((data, enc, cb) => {
      const result = _self.mutationTemplate(_self.mutationCount, data)
      _self.mutationCount++
      cb(null, result)
    })
  }

  private toBatchMutation = () => {
    const _self = this
    let i = 0
    let batch: any = []

    return through2.obj((data, enc, cb) => {
      if (i++ < _self.batchSize) {
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

  private toConsole = () => {
    const _self = this;
    let count = 0;
    return through2.obj(function(data, enc, cb) {
      count++;
      cb(null, null);
    }, function(cb) {
      console.log(`Import done. Imported ${_self.mutationCount} records`)
      this.push(count)
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

  doImport = () => {
    this.resolver.readStream(this.props.dataPath!)
      .pipe(this.streamMeter)
      .pipe(this.toJSON())
      .pipe(this.toFieldArray())
      .pipe(this.toMutation())
      .pipe(this.toBatchMutation())
      .pipe(this.toApi())
      .pipe(this.toConsole())
  }
}
