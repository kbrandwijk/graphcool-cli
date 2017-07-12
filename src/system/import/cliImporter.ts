import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'
import { EventEmitter } from 'events'
import { sendProjectMutation } from '../../api/api'
import * as zlib from 'zlib'
import * as fs from 'fs'
import * as ndjson from 'ndjson'

interface normalizedData{
  record: any,
  typeName: string
}

interface apiResult{
  type: string,
  id: string,
  oldId: string
}

interface singleMutation{
  mutation: string,
  variable: object,
  typeName: string
}

interface batchMutation{
  batchMutation: string,
  variables: object
}

interface apiResponse{
  data: apiResult[]
}

let start: number

const mutationTemplate: (index: number, typeName: string) => string =
  (index: number, typeName: string): string => `mut${index}: updateOrCreate${typeName}( update: { id: \"\"}, create: $obj${index}) { type:__typename oldId id }`
const batchMutationTemplate: (data: string[], variables: object, typenames: string[]) => string =
  (data: string[], variables: object, typenames: string[]): string => `mutation(${Object.keys(variables).map((k, index) => `$${k}: Create${typenames[index]}!`)}) { ${data.map(mutation => `${mutation}`).join(' ')} }`
const mutationState: apiResult[] = []
const mutationMap: Set<string> = new Set()

export const events: EventEmitter = new EventEmitter()

/**
 * count - Counts incoming raw data
 *
 * @returns {through2} Transform stream
 */
export function count(): through2 {
  start = Date.now()
  return through2.obj((data: string, enc: string, cb: Function) => {
    events.emit("tick", data.length)
    cb(null, data)
  })
}

/**
 * filterImported - Filters records based on mutation state
 *
 * @returns {through2} Transform stream
 */
export function filterImported(): through2 {
  let mutationCount: number = 0
  let skipCount: number = 0

  function transform(data: normalizedData, enc: string, cb: Function) {
    mutationCount++
    if (!mutationMap.has(`${data.typeName}_${data.record.oldId}`))
    {
      //New
      events.emit("readCount", mutationCount, skipCount)
      cb(null,data)
    }
    else
    {
      //Already imported
      skipCount++
      events.emit("skippedRecord", mutationCount, skipCount)
      cb()
    }
  }

  function flush(cb: Function) {
    events.emit("readComplete", mutationCount, skipCount)
    cb()
  }

  return through2.obj(transform, flush)
}

/**
 * toMutation - Transforms normalizedData into singleMutation
 *
 * @returns {through2} Transform stream
 */
export function toMutation():through2 {
  let mutationCount:number = 0
  return through2.obj((data: normalizedData, enc: string, cb: Function) => {
    const mutation: string = mutationTemplate(mutationCount, data.typeName)
    const variable: object = { [`obj${mutationCount}`]: data.record }
    mutationCount++
    cb(null, { mutation, variable, typeName: data.typeName })
  })
}

/**
 * toBatchMutation - Batches a set of singleMutations into batchMutation
 *
 * @returns {through2} Transform stream
 */
export function toBatchMutation():through2 {
  let mutationBatch: string[] = []
  let typeNames: string[] = []
  let variables: object = {}

  function transform(data: singleMutation, enc: string, cb: Function) {
    mutationBatch.push(data.mutation)
    typeNames.push(data.typeName)
    variables = { ...variables, ...data.variable}

    if (mutationBatch.length == 25) {
      const result: batchMutation = createBatchMutation()
      this.push(result)
    }
    cb()
  }

  function flush(cb: Function) {
    if (mutationBatch.length > 0) {
      const result: batchMutation = createBatchMutation()
      this.push(result)
    }
    cb()
  }

  function createBatchMutation(): batchMutation {
    const batchMutation: string = batchMutationTemplate(mutationBatch, variables, typeNames)
    const result: batchMutation = { batchMutation, variables }
    mutationBatch = []
    typeNames = []
    variables = {}
    return result
  }

  return through2.obj(transform, flush)
}

export function toApi(projectId: string): through2 {
  async function transform(data: batchMutation, enc: string, cb: Function){
    const newChunk: apiResponse = await sendProjectMutation(projectId, data)
    Object.keys(newChunk.data).forEach((key: string) => this.push(newChunk.data[key]))
    cb()
  }

  return through2concurrent.obj({ maxConcurrency: 10 }, transform)
};

export function toSaveStateInMemory(): through2 {
  return through2.obj(function(data: apiResult, enc: string, cb: Function) {
    mutationState.push(data)
    cb(null, 1)
  })
};

export function toConsole():through2 {
  let persistedRecordCount: number = 0

  function transform(data: number, enc: string, cb: Function) {
    persistedRecordCount += data
    events.emit("writeCount", persistedRecordCount)
    cb(null, null)
  }

  function flush(cb: Function) {
    const end: number = Date.now();
    events.emit("writeComplete", persistedRecordCount)
    events.emit('message', `Import done. Imported ${persistedRecordCount} records in ${(end - start) / 1000} seconds.`)
    cb()
  }

  return through2.obj(transform, flush)
}

export function SaveStateToFile(): Promise<void> { return new Promise((resolve, reject) => {
    const file: fs.WriteStream = fs.createWriteStream('./.migrationstate').on('close', () => resolve())
    const serializeStream = ndjson.serialize()
    serializeStream.pipe(zlib.createGzip()).pipe(file)

    mutationState.forEach(m => serializeStream.write(m))
    serializeStream.end()
  })
}

export function readState(): Promise<void> { return new Promise((resolve,reject) => {
  if (!fs.existsSync('./.migrationstate')) { return resolve() }
  fs.createReadStream('./.migrationstate')
    .on('close', () => resolve())
    .pipe(zlib.createGunzip())
    .pipe(ndjson.parse())
    .on('data', obj => {
      mutationState.push(obj)
      mutationMap.add(`${obj.type}_${obj.oldId}`)
    })
  })
}
