import fs from 'node:fs'
import { readJsonSource } from '../../shared/json.js'

export function readJsonFile<T>(filePath: string, fallback: T): T {
  return readJsonSource(() => fs.readFileSync(filePath, 'utf8'), fallback)
}
