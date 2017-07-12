import * as JSONStream from 'JSONStream'
import * as jsonImporter from './jsonImporter'
import * as request from 'request'

function fromURL(filePath) {
  return request(filePath)
}

export const reader = [fromURL]
export const transforms = [...jsonImporter.transforms]
