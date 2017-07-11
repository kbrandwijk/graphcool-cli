import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'
import { EventEmitter } from 'events'
import { sendProjectMutation } from '../../api/api'
import * as zlib from 'zlib'
import * as fs from 'fs'
import * as ndjson from 'ndjson'

export const events: EventEmitter = new EventEmitter()

export function count() {
  start = Date.now()
  return through2.obj((data, enc, cb) => {
    events.emit("tick", data.length)
    cb(null, data)
  })
}

const mutationTemplate = (index, data) => `mut${index}: updateOrCreate${data.typeName}( update: { id: \"\"}, create: $obj${index}) { type:__typename oldId id }`

export function filterImported() {
  let mutationCount = 0
  let skipCount = 0

  return through2.obj((data, enc, cb) => {
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
  }, (cb) => {
      events.emit("readComplete", mutationCount, skipCount)
      cb()
    })
}

export function toMutation() {
  let mutationCount = 0
  const _self = this
  return through2.obj((data, enc, cb) => {
    const mutation = mutationTemplate(mutationCount, data)
    const variable = {}
    variable[`obj${mutationCount}`] = data.record
    mutationCount++
    cb(null, { mutation, variable, typeName: data.typeName })
  })
}

const batchMutationTemplate = (data, variables, typenames) => `mutation(${Object.keys(variables).map((k, index) => `$${k}: Create${typenames[index]}!`)}) { ${data.map(mutation => `${mutation}`).join(' ')} }`

export function toBatchMutation() {
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

    if (i == 25) {
      const batchMutation = batchMutationTemplate(mutationBatch, variables, typeNames)
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
      const batchMutation = batchMutationTemplate(mutationBatch, variables, typeNames)
      const result = { batchMutation, variables }
      i = 0
      mutationBatch = []
      typeNames = []
      variables = {}

      cb(null, result)
    }
    cb(null,null)
    }

  )
}

let start: number

export function toConsole() {
  const _self = this
  let persistedRecordCount = 0
  return through2.obj(function(data, enc, cb) {
    persistedRecordCount += data
    events.emit("writeCount", persistedRecordCount)
    cb(null, null)
  }, function(cb) {
    let end = Date.now();
    events.emit("writeComplete", persistedRecordCount)
    events.emit('message', `Import done. Imported ${persistedRecordCount} records in ${(end - start) / 1000} seconds.`)
    cb()
  })
}

export function toApi(projectId) {
  const _self = this
  return through2concurrent.obj({ maxConcurrency: 10 }, async function(data, enc, cb) {
    const newChunk = await sendProjectMutation(projectId, data)
    //console.log('length', Object.keys(newChunk.data).length)
    Object.keys(newChunk.data).map(k => newChunk.data[k]).forEach(r => this.push(r))
    cb()
  })
};

let mutationState:any = []
let mutationMap = new Set()

export function toSaveStateInMemory() {
    return through2.obj(function(data, enc, cb) {
      mutationState.push(data)
      cb(null, 1)
    })
};

export function SaveStateToFile() {
  const file = fs.createWriteStream('./.migrationstate')
  const serializeStream = ndjson.serialize()
  serializeStream.pipe(zlib.createGzip()).pipe(file)

  mutationState.forEach(m => serializeStream.write(m))
  serializeStream.end()
}

export function readState() { return new Promise((resolve,reject) => {
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
