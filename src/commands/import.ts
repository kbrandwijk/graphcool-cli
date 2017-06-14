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
import * as oboe from 'oboe'

interface Props {
  dataPath?: string
  batchSize?: number
}

export default async (props: Props, env: SystemEnvironment): Promise<void> => {

  const {resolver} = env
  const projectFilePath = getProjectFilePath(props, resolver)

  const projectInfo = readProjectInfoFromProjectFile(resolver, projectFilePath)
  if (!projectInfo) {
    throw new Error(invalidProjectFileMessage)
  }

  if (!props.dataPath) {
    throw new Error(noDataForImportMessage)
  }

  // Set default batch size if not specified
  const batchSize = props.batchSize || 10

  // Define building blocks for batch mutation
  const mutationStartElement = 'mutation { '
  let objectElement = ''
  const endElement = ') { id } '
  const mutationEndElement = '}'

  let mutation = ''
  let sent = false

  // Stream read data file
  await new Promise((resolve, reject) => {
    oboe(resolver.readStream(props.dataPath!))
      .on('node', {
        '*': async (scheme, path) => {

          // NOTE: This is WIP and won't work yet
          const typeName = path[0] as string
          const startElement = `create${typeName} ( `

          // Current mutation has not been sent
          sent = false

          // Element of current object
          if (path.length === 3) {
            // Add element to mutation
            objectElement += `${path[2]}: ${JSON.stringify(scheme)},`
          }

          // End of object
          if (path.length === 2) {
            // Give mutation a unique name
            const mutationAlias = `mut${path[1]}: `

            // Add mutation to batch
            mutation += `${mutationAlias}${startElement}${objectElement.substr(0, objectElement.length - 1)}${endElement}`

            // Start new mutation
            objectElement = ''

            // Send batch every n-th element
            if (path[1] % batchSize == 0) {
              // Wrap mutations in batch
              const fullMutation = mutationStartElement + mutation + mutationEndElement
              await sendProjectMutation(projectInfo.projectId, fullMutation)

              // Start new batch
              mutation = ''
              sent = true
            }
          }
        }
      })
      .on('done', async () => {
        if (!sent) {
          // There are left-overs after the last batch of n

          const fullMutation = mutationStartElement + mutation + mutationEndElement
          await sendProjectMutation(projectInfo.projectId, fullMutation)

          resolve()
        }

      })
      .on('fail', reject)
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
