import {
  SystemEnvironment,
  Resolver
} from '../types'
import {
  invalidProjectFileMessage,
  noDataForImportMessage,
  noTypeSpecifiedForImportMessage,
  invalidProjectFilePathMessage,
  multipleProjectFilesMessage,
  noProjectFileForImportMessage
} from '../utils/constants'
import {
  readProjectInfoFromProjectFile,
  isValidProjectFilePath
} from '../utils/file'
import {
  sendProjectMutation
} from '../api/api'
import * as oboe from 'oboe'

interface Props {
  dataPath?: string
  batchSize?: number
  gqType?: string
}

export default async (props: Props, env: SystemEnvironment): Promise<void> => {
  console.log('Start importCommand')

  const { resolver, out } = env
  const projectFilePath = getProjectFilePath(props, resolver)

  const projectInfo = readProjectInfoFromProjectFile(resolver, projectFilePath)
  if (!projectInfo) {
    throw new Error(invalidProjectFileMessage)
  }

  if (!props.dataPath) {
    throw new Error(noDataForImportMessage)
  }

  if (!props.gqType) {
    throw new Error(noTypeSpecifiedForImportMessage)
  }

  // Set default batch size if not specified
  const batchSize = props.batchSize || 10

  // Define building blocks for batch mutation
  const mutationStartElement = "mutation { "
  const startElement = `create${props.gqType} ( `
  var objectElement = ""
  const endElement = ") { id } "
  const mutationEndElement = "}"

  var mutation = ""
  var sent = false

  // Stream read data file
  oboe(resolver.readStream(props.dataPath))
    .on('node', {
      '*': function(scheme, path) {

        // Current mutation has not been sent
        sent = false

        // Element of current object
        if (path.length == 3) {
          // Add element to mutation
          objectElement += `${path[2]}: ${JSON.stringify(scheme)},`
        }

        // End of object
        if (path.length == 2) {
          // Give mutation a unique name
          const mutationName = `mut${path[1]}: `

          // Add mutation to batch
          mutation += `${mutationName}${startElement}${objectElement.substr(0, objectElement.length - 1)}${endElement}`

          // Start new mutation
          objectElement = ""

          // Send batch every n-th element
          if (path[1] % batchSize == 0)
          {
            // Wrap mutations in batch
            const fullMutation = mutationStartElement + mutation + mutationEndElement
            sendProjectMutation(projectInfo.projectId, fullMutation)

            // Start new batch
            mutation = ""
            sent = true;
          }
        }
      }
    })
    .on('done', function() {
      if (!sent) {
        // There are left-overs after the last batch of n

        const fullMutation = mutationStartElement + mutation + mutationEndElement
        sendProjectMutation(projectInfo.projectId, fullMutation)
      }

    })
    .on('fail', function() {
      console.log("Drat! Foiled again!");
    })
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
