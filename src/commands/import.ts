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
  defaultImport
} from '../system/importers/default-import'


import * as fs from 'fs'
import * as ProgressBar from 'progress'
import * as meter from 'stream-meter'

interface Props {
  dataPath?: string
  batchSize?: number
}

export default async (props: Props, env: SystemEnvironment): Promise<void> => {

  // TODO: Reorder variable initialization, rename/move, coding standards etc.

  const { resolver } = env

  const projectFilePath = getProjectFilePath(props, resolver)

  const projectInfo = readProjectInfoFromProjectFile(resolver, projectFilePath)
  if (!projectInfo) {
    throw new Error(invalidProjectFileMessage)
  }

  if (!props.dataPath) {
    throw new Error(noDataForImportMessage)
  }

  const progress = new ProgressBar('importing [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 50,
      total: fs.statSync(props.dataPath!).size // TODO: Move fs to resolver
    })

  const importer = new defaultImport({
    progressBar: progress,
    projectId: projectInfo.projectId,
    dataPath: props.dataPath}, env)

  importer.batchSize = props.batchSize || 25

  importer.doImport()
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
