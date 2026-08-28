export const STORAGE_KEY = 'project-time-tracker:data'
export const DATA_VERSION = 1 as const

export interface Project {
  id: string
  name: string
  color: string
  createdAt: string
  completedAt: string | null
}

export interface TimeEntry {
  id: string
  projectId: string
  date: string
  durationSeconds: number
  note: string
  createdAt: string
}

export interface ActiveTimer {
  projectId: string
  startedAt: number
}

export interface AppData {
  version: typeof DATA_VERSION
  projects: Project[]
  entries: TimeEntry[]
  activeTimer: ActiveTimer | null
}

export const PROJECT_COLORS = ['#3157d5', '#7c3aed', '#0f8a70', '#d05a2a', '#c23768', '#52606d']

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    projects: [],
    entries: [],
    activeTimer: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`))
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function validateData(value: unknown): AppData {
  if (!isRecord(value) || value.version !== DATA_VERSION) {
    throw new Error('This backup is not a supported Timebase file.')
  }
  if (!Array.isArray(value.projects) || !Array.isArray(value.entries)) {
    throw new Error('The backup is missing its projects or time entries.')
  }

  const ids = new Set<string>()
  const projects = value.projects.map((item): Project => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      typeof item.color !== 'string' ||
      !isIsoTimestamp(item.createdAt) ||
      !(item.completedAt === null || isIsoTimestamp(item.completedAt))
    ) {
      throw new Error('One or more projects in the backup are invalid.')
    }
    ids.add(item.id)
    return {
      id: item.id,
      name: item.name.trim(),
      color: item.color,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    }
  })

  const entryIds = new Set<string>()
  const entries = value.entries.map((item): TimeEntry => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      entryIds.has(item.id) ||
      typeof item.projectId !== 'string' ||
      !ids.has(item.projectId) ||
      !isIsoDate(item.date) ||
      typeof item.durationSeconds !== 'number' ||
      !Number.isInteger(item.durationSeconds) ||
      item.durationSeconds <= 0 ||
      typeof item.note !== 'string' ||
      !isIsoTimestamp(item.createdAt)
    ) {
      throw new Error('One or more time entries in the backup are invalid.')
    }
    entryIds.add(item.id)
    return {
      id: item.id,
      projectId: item.projectId,
      date: item.date,
      durationSeconds: item.durationSeconds,
      note: item.note,
      createdAt: item.createdAt,
    }
  })

  let activeTimer: ActiveTimer | null = null
  if (value.activeTimer !== null) {
    const timer = value.activeTimer
    if (
      !isRecord(timer) ||
      typeof timer.projectId !== 'string' ||
      !ids.has(timer.projectId) ||
      typeof timer.startedAt !== 'number' ||
      !Number.isFinite(timer.startedAt) ||
      timer.startedAt <= 0 ||
      timer.startedAt > Date.now() + 60_000 ||
      projects.find((project) => project.id === timer.projectId)?.completedAt !== null
    ) {
      throw new Error('The running timer in the backup is invalid.')
    }
    activeTimer = { projectId: timer.projectId, startedAt: timer.startedAt }
  }

  return { version: DATA_VERSION, projects, entries, activeTimer }
}

export function loadData(): AppData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return emptyData()

  try {
    return validateData(JSON.parse(stored))
  } catch {
    return emptyData()
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function parseBackup(contents: string): AppData {
  try {
    return validateData(JSON.parse(contents))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('That file does not contain valid JSON.')
    throw error
  }
}
