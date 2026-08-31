import './popup.css'
import { loadData, saveData, type Project } from './storage'
import { formatDuration, splitDurationByDay } from './time'
import { watchForExternalChanges } from './sync'

type ExtensionApi = {
  runtime?: { getURL: (path: string) => string }
  tabs?: { create: (options: { url: string }) => void }
}
const chromeApi = (globalThis as { chrome?: ExtensionApi }).chrome

const app = document.querySelector<HTMLDivElement>('#app')!
let data = loadData()
let tickHandle: number | undefined

const icons: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
}

function icon(name: keyof typeof icons): string {
  const fill = name === 'play' || name === 'stop'
  return `<svg viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${icons[name]}</svg>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
    return entities[character]
  })
}

function activeProjects(): Project[] {
  return data.projects.filter((project) => project.completedAt === null)
}

function projectTotal(projectId: string): number {
  const recorded = data.entries
    .filter((entry) => entry.projectId === projectId)
    .reduce((total, entry) => total + entry.durationSeconds, 0)
  const running =
    data.activeTimer?.projectId === projectId ? Math.floor((Date.now() - data.activeTimer.startedAt) / 1000) : 0
  return recorded + running
}

function openDashboard(): void {
  const url = chromeApi?.runtime?.getURL ? chromeApi.runtime.getURL('index.html') : 'index.html'
  if (chromeApi?.tabs?.create) {
    chromeApi.tabs.create({ url })
    window.close()
  } else {
    window.open(url, '_blank')
  }
}

function startTimer(projectId: string): void {
  if (data.activeTimer && data.activeTimer.projectId !== projectId) stopTimer(data.activeTimer.projectId)
  if (!data.activeTimer) {
    data.activeTimer = { projectId, startedAt: Date.now() }
    saveData(data)
  }
  render()
}

function stopTimer(projectId: string): void {
  if (!data.activeTimer || data.activeTimer.projectId !== projectId) return
  const endedAt = Date.now()
  const startedAt = data.activeTimer.startedAt
  splitDurationByDay(startedAt, endedAt).forEach((segment) => {
    data.entries.push({
      id: crypto.randomUUID(),
      projectId,
      date: segment.date,
      durationSeconds: segment.durationSeconds,
      note: '',
      createdAt: new Date().toISOString(),
    })
  })
  data.activeTimer = null
  saveData(data)
}

function render(): void {
  data = loadData()
  const runningProject = data.activeTimer ? data.projects.find((project) => project.id === data.activeTimer?.projectId) : null
  const active = activeProjects()

  app.innerHTML = `
    <div class="popup-shell">
      <div class="popup-header">${icon('clock')} timebase</div>
      ${
        runningProject
          ? `<section class="popup-running">
              <span class="popup-dot pulse" style="--project-color:${runningProject.color}"></span>
              <div class="popup-running-info"><small>Tracking now</small><strong>${escapeHtml(runningProject.name)}</strong></div>
              <b class="popup-timer" id="popup-timer">${formatDuration(projectTotal(runningProject.id), true)}</b>
              <button class="popup-stop-button" data-stop="${runningProject.id}">${icon('stop')} Stop timer</button>
            </section>`
          : active.length
            ? `<p class="popup-subhead">Start tracking</p>
               <div class="popup-list">
                 ${active
                   .map(
                     (project) => `
                   <button class="popup-project-row" data-start="${project.id}">
                     <span class="popup-dot" style="--project-color:${project.color}"></span>
                     <span class="popup-project-name">${escapeHtml(project.name)}</span>
                     <span class="popup-project-time">${formatDuration(projectTotal(project.id))}</span>
                     <span class="popup-play-icon">${icon('play')}</span>
                   </button>`,
                   )
                   .join('')}
               </div>`
            : `<div class="popup-empty">No active projects yet. Open the dashboard to create one.</div>`
      }
      <button class="popup-dashboard-link" id="popup-open-dashboard">Open full dashboard ${icon('arrow')}</button>
    </div>`

  document
    .querySelectorAll<HTMLElement>('[data-start]')
    .forEach((button) => button.addEventListener('click', () => startTimer(button.dataset.start!)))
  document.querySelectorAll<HTMLElement>('[data-stop]').forEach((button) =>
    button.addEventListener('click', () => {
      stopTimer(button.dataset.stop!)
      render()
    }),
  )
  document.querySelector<HTMLButtonElement>('#popup-open-dashboard')!.addEventListener('click', openDashboard)

  window.clearInterval(tickHandle)
  if (runningProject) {
    tickHandle = window.setInterval(() => {
      const display = document.querySelector<HTMLElement>('#popup-timer')
      if (display) display.textContent = formatDuration(projectTotal(runningProject.id), true)
    }, 1000)
  }
}

// Keep this popup in sync if data changes in the dashboard tab while it's open
// (e.g. the dashboard tab was already open and the user starts/stops a timer there).
watchForExternalChanges(render)

render()
