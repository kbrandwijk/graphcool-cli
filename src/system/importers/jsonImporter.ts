import * as JSONStream from 'JSONStream'
import * as through2 from 'through2'

function toJSON() {
  return JSONStream.parse([true, {emitPath:true}])
}

function toNormalizedData() {
  const _self = this;
  return through2.obj((data, enc, cb) => {
    const result = { record: data.value, typeName: data.path[0] }
    cb(null, result)
  })
}

export const transforms = [toJSON, toNormalizedData]
