import * as JSONStream from 'JSONStream'

function toJSON() {
  return JSONStream.parse('*.*')
}

export const transforms = [toJSON]
