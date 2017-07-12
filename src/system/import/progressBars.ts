import * as Multiprogress from 'multi-progress'

const multi = new Multiprogress()

export const readDataBar = multi.newBar('Reading [:bar] :size :percent :etas', {
  complete: '=',
  incomplete: ' ',
  renderThrottle: 100,
  size: '0',
  width: 60,
  total: 0
})

export const readObjectsBar = multi.newBar('Records read: :number, skipped :skip existing records :complete', {
  total: 0,
  'number': '0',
  renderThrottle: 100,
  'skip': '0',
  'complete' : ''
})

export const writeObjectsBar = multi.newBar('Records imported: :number :complete', {
  total: 0,
  'number': '0',
  renderThrottle: 100,
  'complete' : ''
})
