import {
  SystemEnvironment,
  Resolver
} from '../types'
import {
  invalidProjectFileMessage,
  noDataForImportMessage,
  noTypeSpecifiedForImportMessage,
  multipleProjectFilesMessage,
  noProjectFileForImportMessage
} from '../utils/constants'
import {
  readProjectInfoFromProjectFile,
} from '../utils/file'
import {
  sendProjectMutation
} from '../api/api'

import * as JSONStream from 'JSONStream'
import * as through2 from 'through2'
import * as through2concurrent from 'through2-concurrent'
import * as fs from 'fs'
import * as ProgressBar from 'progress'
import * as meter from 'stream-meter'

interface Props {
  dataPath?: string
  batchSize?: number
}

export default async (props: Props, env: SystemEnvironment): Promise<void> => {

  const { resolver } = env
  const projectFilePath = getProjectFilePath(props, resolver)

  const projectInfo = readProjectInfoFromProjectFile(resolver, projectFilePath)
  if (!projectInfo) {
    throw new Error(invalidProjectFileMessage)
  }

  if (!props.dataPath) {
    throw new Error(noDataForImportMessage)
  }

  let progress = new ProgressBar('importing [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 50,
      total: fs.statSync(props.dataPath!).size
    });

  //var progress = new ProgressBar(':bar', { total: fs.statSync(props.dataPath!).size });


  const batchSize = props.batchSize || 25

  const batchMutationTemplate = data => `mutation { ${data.map(mutation => `${mutation}`).join(' ')} }`

  const mutationTemplate = (index, data) => `mut${index}: createMovie( ${data.map(field => `${field[0]}: \"${field[1]}\"`).join(', ')}) { id }`;

  const toBatchMutation = () => {
    let i = 0;
    let batch: any = [];

    return through2.obj((data, enc, cb) => {
      if (i++ < batchSize) {
        batch.push(data)
        cb(null, null)
      }
      else {
        let result = batchMutationTemplate(batch)
        i = 0
        batch = []
        cb(null, result)
      }
    }, function(cb) {
      let result = batchMutationTemplate(batch)
      i = 0
      batch = []
      this.push(result);
      cb()
    }
    )
  }

  let mutationCount = 0;
  const toMutation = () => {
    return through2.obj((data, enc, cb) => {
      let result = mutationTemplate(mutationCount, data)
      mutationCount++
      cb(null, result)
    })
  }

  const toFieldArray = () => {
    let bytesprocessed = 0;
    return through2.obj((data, enc, cb) => {
      if (rateMeter.bytes - bytesprocessed > 0) progress.tick(rateMeter.bytes - bytesprocessed)
      bytesprocessed = rateMeter.bytes;

      let out = Object.keys(data).map(d => [d, data[d]]);
      cb(null, out)
    })
  }

  const toConsole = () => {
    let count = 0;
    return through2.obj(function(data, enc, cb) {
      count++;
      cb(null, null);
    }, function(cb) {
      console.log(`Import done. Imported ${mutationCount} records`)
      this.push(count);
      cb();
    });
  };

  const toApi = () => {
    return through2concurrent.obj({ maxConcurrency: 8 }, function(data, enc, cb) {
      var self = this;
      sendProjectMutation(projectInfo.projectId, data).then(function(newChunk) {
        self.push(newChunk);
        cb();
      });
    })
  };

  let rateMeter = meter()

  resolver.readStream(props.dataPath!)
    .pipe(rateMeter)
    .pipe(JSONStream.parse('*.*'))
    .pipe(toFieldArray())
    .pipe(toMutation())
    .pipe(toBatchMutation())
    .pipe(toApi())
    .pipe(toConsole())


}

function getProjectFilePath(props: Props, resolver: Resolver): string {

  // no project file provided, search for one in current dir
  const projectFiles = resolver.projectFiles('.')
  if (projectFiles.length === 0) {
    throw new Error(noProjectFileForImportMessage)
  } else if (projectFiles.length > 1) {
    throw new Error(multipleProjectFilesMessage(projectFiles))
  }

  return projectFiles[0]
}
