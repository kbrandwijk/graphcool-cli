import * as JSONStream from 'JSONStream'

function toJSON() {
  return JSONStream.parse([true, true, {emitPath:true}])
}

export const transforms = [toJSON]
