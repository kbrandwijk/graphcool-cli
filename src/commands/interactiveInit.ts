import { CheckAuth, SystemEnvironment } from '../types'
import { howDoYouWantToGetStarted, sampleSchemaURL } from '../utils/constants'
import * as chalk from 'chalk'
import figures = require('figures')
import * as _ from 'lodash'
import initCommand from './init'
import { readProjectIdFromProjectFile } from '../utils/file'
const {terminal} = require('terminal-kit')
const debug = require('debug')('graphcool')

const BLANK_PROJECT = 0

interface Props {
  checkAuth: CheckAuth
  name?: string
  alias?: string
  region?: string
  outputPath?: string
}

export default async (props: Props, env: SystemEnvironment): Promise<void> => {

  const {out, resolver} = env

  const schemaFiles = resolver.schemaFiles('.')
  const projectFiles = resolver.projectFiles('.')

  const options = [
    [`${chalk.bold('New blank project')}`, `Creates a new Graphcool project from scratch.`, ''],
    ...schemaFiles.map(f => [`${chalk.bold('From local schema ./' + f)}`, 'Creates a new Graphcool project based on the local schema.', '']),
    ...projectFiles.map(f => [`${chalk.bold('Copy existing project ./' + f)}`, 'Creates a clone of an existing Graphcool project.', '']),
  ]

  // no need for interactivity when there are no options
  // NOTE: this should probably be refactored to an outer layer
  if (schemaFiles.length === 0 && projectFiles.length === 0) {
    await props.checkAuth(env, 'init')

    const schemaUrl = sampleSchemaURL
    const initProps = getPropsForInit(props)
    await initCommand({...initProps, schemaUrl}, env)
    return
  }

  terminal.saveCursor()
  out.write(howDoYouWantToGetStarted())

  terminal.grabInput()
  terminal.hideCursor()

  let currentIndex = BLANK_PROJECT // 0

  render(options, currentIndex)

  await new Promise(resolve => {
    terminal.on('key', async (name: string) => {
      currentIndex = await handleKeyEvent(name, currentIndex, options, props, env, resolve)
    })
  })
}

async function handleKeyEvent(name: string, currentIndex: number, options: string[][], props: Props, env: SystemEnvironment, callback: () => void): Promise<number> {

  switch (name) {
    case 'DOWN': {
      currentIndex = (currentIndex + 1) % options.length
      rerender(options, currentIndex)
      break
    }
    case 'UP': {
      currentIndex = (currentIndex + options.length - 1) % options.length
      rerender(options, currentIndex)
      break
    }
    case 'ENTER': {
      await handleSelect(currentIndex, props, env)
      callback()
      break
    }
    case 'CTRL_C': {
      terminal.restoreCursor()
      terminal.eraseDisplayBelow()
      terminal.hideCursor(false)
      env.out.write('\n')
      process.exit()
    }
    default: {
      break
    }
  }

  return currentIndex
}

async function handleSelect(selectedIndex: number, props: Props, env: SystemEnvironment): Promise<void> {
  terminal.restoreCursor()
  terminal.eraseDisplayBelow()
  terminal.hideCursor(false)
  env.out.write('\n')

  if (selectedIndex === BLANK_PROJECT) {
    terminal.grabInput(false)

    await props.checkAuth(env, 'init')
  }

  switch (selectedIndex) {
    case BLANK_PROJECT: {
      const schemaUrl = sampleSchemaURL
      const initProps = getPropsForInit(props)
      await initCommand({...initProps, schemaUrl}, env)
      break
    }
    default: {
      terminal.grabInput(false)
      const schemaFiles = env.resolver.schemaFiles('.')
      const projectFiles = env.resolver.projectFiles('.')
      const previousOptions = 1
      if (selectedIndex >= previousOptions && selectedIndex < previousOptions + schemaFiles.length) {
        const schemaFileIndex = selectedIndex - previousOptions
        const schemaUrl = schemaFiles[schemaFileIndex]
        const initProps = getPropsForInit(props)
        await initCommand({...initProps, schemaUrl}, env)
      } else if (selectedIndex >= previousOptions + schemaFiles.length && selectedIndex < previousOptions + schemaFiles.length + projectFiles.length) {
        const projectFileIndex = selectedIndex - schemaFiles.length - previousOptions
        const projectFile = projectFiles[projectFileIndex]
        const copyProjectId = readProjectIdFromProjectFile(env.resolver, projectFile)
        const initProps = getPropsForInit(props)
        const initProps2 = {...initProps, copyProjectId, projectFile}
        await initCommand(initProps2, env)
      }

      break
    }
  }
}

function getPropsForInit(props: Props): any {
  return {
    name: props.name,
    alias: props.alias,
    region: props.region,
    outputPath: props.outputPath
  }
}

function rerender(options: string[][], currentIndex: number): void {
  clear(options)
  render(options, currentIndex)
}

function clear(options: string[][]) {
  const lineCount = _.flatten(options).length - 1
  terminal.up(lineCount)
  terminal.left(10000)
  terminal.eraseDisplayBelow()
}

function render(options: string[][], currentIndex: number) {
  const lines = _.chain(options)
    .map((ls, optionIndex) => ls.map((l, lineIndex) => (lineIndex === 0 && optionIndex === currentIndex) ? `  ${chalk.blue(figures.pointer)} ${l}` : `    ${l}`))
    .flatten()
    .join('\n')

  terminal(lines, currentIndex)
}
