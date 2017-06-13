import {
  SystemEnvironment,
  Resolver
} from '../types'
import {
  invalidProjectFileMessage,
  invalidProjectFilePathMessage,
  multipleProjectFilesMessage,
  noProjectFileForImportMessage
} from '../utils/constants'
import {
  readProjectInfoFromProjectFile,
  isValidProjectFilePath
} from '../utils/file'
import * as oboe from 'oboe'

interface Props {
  projectFile?: string
  dataPath?: string
}

export default async (props: Props, env: SystemEnvironment): Promise<void> => {
  console.log('Start importCommand')

  const { resolver, out } = env
  const projectFilePath = getProjectFilePath(props, resolver)

  const projectInfo = readProjectInfoFromProjectFile(resolver, projectFilePath)
  if (!projectInfo) {
    throw new Error(invalidProjectFileMessage)
  }

  // Read data file
  if (props.dataPath) {
    oboe(resolver.readStream(props.dataPath))
      .on('node', {
        '*': function(scheme) {
          console.log('Aha! ' + scheme);
        }
      })
      .on('done', function() {
        console.log("*twiddles mustache*");
      })
      .on('fail', function() {
        console.log("Drat! Foiled again!");
      })
  }
}

function getProjectFilePath(props: Props, resolver: Resolver): string {

  // check if provided file is valid (ends with correct suffix)
  if (props.projectFile && isValidProjectFilePath(props.projectFile)) {
    return props.projectFile
  } else if (props.projectFile && !isValidProjectFilePath(props.projectFile)) {
    throw new Error(invalidProjectFilePathMessage(props.projectFile))
  }

  // no project file provided, search for one in current dir
  const projectFiles = resolver.projectFiles('.')
  if (projectFiles.length === 0) {
    throw new Error(noProjectFileForImportMessage)
  } else if (projectFiles.length > 1) {
    throw new Error(multipleProjectFilesMessage(projectFiles))
  }

  return projectFiles[0]
}
