import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'
import { EventEmitter } from 'events'
import { sendProjectMutation } from '../../api/api'

export const events: EventEmitter = new EventEmitter()

export function count() {
  start = Date.now()
  return through2.obj((data, enc, cb) => {
    events.emit("tick", data.length)
    cb(null, data)
  })
}

const mutationTemplate = (index, data) => `mut${index}: updateOrCreate${data.typeName}( update: { id: \"\"}, create: $obj${index}) { id }`

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
    cb(null, null)
  }, function(cb) {
    let end = Date.now();
    console.log(`Import done. Imported ${persistedRecordCount} records in ${end - start}ms`)
    cb()
  })
}

export function toApi(projectId) {
  const _self = this
  return through2concurrent.obj({ maxConcurrency: 10 }, async function(data, enc, cb) {
    const newChunk = await sendProjectMutation(projectId, data)
    cb(null, Object.keys(newChunk.data).length)
  })
};
