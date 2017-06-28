import {
  SystemEnvironment,
  Resolver
} from '../types'
import {
  invalidProjectFileMessage,
  noDataForImportMessage,
  multipleProjectFilesMessage,
  noProjectFileForImportMessage
} from '../utils/constants'
import {
  readProjectInfoFromProjectFile,
} from '../utils/file'

import {
  ImportEngine
} from '../system/importers/import-engine'

interface Props {
  dataPath?: string
  batchSize?: number
  format?: string
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

  const importer = new ImportEngine({
    projectId: projectInfo.projectId,
    dataPath: props.dataPath,
    batchSize: props.batchSize,
    format: props.format}, env)

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
