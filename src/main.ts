import './style.css'
import {
  DATA_VERSION,
  PROJECT_COLORS,
  type AppData,
  type Project,
  type TimeEntry,
  loadData,
  parseBackup,
  pauseActiveTimer,
  resumeActiveTimer,
  saveData,
  stopActiveTimer,
  timerElapsedSeconds,
} from './storage'
import { formatDate, formatDuration, formatShortDate, toLocalDate, todayRunningSeconds } from './time'
import { watchForExternalChanges } from './sync'

const app = document.querySelector<HTMLDivElement>('#app')!
let data = loadData()
let selectedProjectId: string | null = null
let pendingImport: AppData | null = null
let toastTimeout: number | undefined

const icons: Record<string, string> = {
  overview: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  download: '<path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16"/>',
  upload: '<path d="M12 16V4m0 0 5 5m-5-5L7 9M4 21h16"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
  edit: '<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  restore: '<path d="M4 8v5h5M5.5 17a8 8 0 1 0 .4-10.4L4 8"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
}

function icon(name: keyof typeof icons): string {
  const fill = name === 'overview' || name === 'play' || name === 'pause' || name === 'stop'
  return `<svg viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}>${icons[name]}</svg>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
    return entities[character]
  })
}

function timerStateFor(projectId: string): 'running' | 'paused' | 'idle' {
  if (data.activeTimer?.projectId !== projectId) return 'idle'
  return data.activeTimer.running ? 'running' : 'paused'
}

function projectTotal(projectId: string, includeRunning = true): number {
  const recorded = data.entries
    .filter((entry) => entry.projectId === projectId)
    .reduce((total, entry) => total + entry.durationSeconds, 0)
  const timer = data.activeTimer?.projectId === projectId ? data.activeTimer : null
  const running = includeRunning && timer ? timerElapsedSeconds(timer) : 0
  return recorded + running
}

// The active timer's contribution to a given day: whatever it already banked
// into `segments` for that date, plus the live running stretch if it's today
// and still ticking. Shared by the "Today" stat and the week chart so they
// can't drift apart, and covers every day a segment was banked on (not just
// today) — a timer paused across several days should show up on each one.
function activeTimerSecondsForDay(day: string): number {
  const timer = data.activeTimer
  if (!timer) return 0
  const committed = timer.segments
    .filter((segment) => segment.date === day)
    .reduce((total, segment) => total + segment.durationSeconds, 0)
  const running = timer.running && day === toLocalDate() ? todayRunningSeconds(timer.startedAt) : 0
  return committed + running
}

function todayTotal(): number {
  const today = toLocalDate()
  const recorded = data.entries
    .filter((entry) => entry.date === today)
    .reduce((total, entry) => total + entry.durationSeconds, 0)
  return recorded + activeTimerSecondsForDay(today)
}

function activeProjects(): Project[] {
  return data.projects.filter((project) => project.completedAt === null)
}

function completedProjects(): Project[] {
  return data.projects
    .filter((project) => project.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
}

function projectNavItem(project: Project): string {
  const state = timerStateFor(project.id)
  return `
    <button class="project-nav-item ${selectedProjectId === project.id ? 'active' : ''}" data-select-project="${project.id}">
      <span class="project-dot ${state === 'running' ? 'pulse' : ''} ${state === 'paused' ? 'paused' : ''}" style="--project-color:${project.color}"></span>
      <span class="project-nav-name">${escapeHtml(project.name)}</span>
      <span class="project-nav-time">${formatDuration(projectTotal(project.id), state !== 'idle')}</span>
    </button>`
}

function renderSidebar(): string {
  const active = activeProjects()
  const completed = completedProjects()
  return `
    <aside class="sidebar">
      <div class="brand" aria-label="Timebase home">
        <span class="brand-mark">${icon('clock')}</span>
        <span>timebase</span>
      </div>
      <nav aria-label="Primary navigation">
        <button class="nav-item ${selectedProjectId === null ? 'active' : ''}" data-overview>
          ${icon('overview')} <span>Overview</span>
        </button>
      </nav>
      <div class="sidebar-section">
        <div class="sidebar-heading">
          <span>Active projects</span>
          <button class="icon-button" data-open-project aria-label="Add project">${icon('plus')}</button>
        </div>
        <div class="project-nav-list">
          ${active.length ? active.map(projectNavItem).join('') : '<p class="sidebar-empty">No active projects yet.</p>'}
        </div>
      </div>
      ${
        completed.length
          ? `<details class="archive">
              <summary>Completed <span>${completed.length}</span></summary>
              <div class="project-nav-list">${completed.map(projectNavItem).join('')}</div>
            </details>`
          : ''
      }
      <div class="sidebar-footer">
        <button class="utility-button" data-export>${icon('download')} Export JSON</button>
        <button class="utility-button" data-import>${icon('upload')} Import JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <p>Stored privately in this browser</p>
      </div>
    </aside>`
}

function renderWeekChart(): string {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    return toLocalDate(date)
  })
  const values = days.map(
    (day) =>
      data.entries.filter((entry) => entry.date === day).reduce((sum, entry) => sum + entry.durationSeconds, 0) +
      activeTimerSecondsForDay(day),
  )
  const max = Math.max(...values, 1)

  return `
    <div class="chart" aria-label="Last seven days tracked time">
      ${days
        .map((day, index) => {
          const height = values[index] ? Math.max(8, Math.round((values[index] / max) * 100)) : 3
          const label = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${day}T12:00:00`))
          return `<div class="chart-day" title="${formatShortDate(day)}: ${formatDuration(values[index])}">
            <div class="chart-track"><span style="height:${height}%"></span></div>
            <span>${label.slice(0, 1)}</span>
          </div>`
        })
        .join('')}
    </div>`
}

function renderRecentEntries(): string {
  const entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  if (!entries.length) {
    return `<div class="empty-inline">${icon('calendar')}<p>Your recent entries will appear here.</p></div>`
  }
  return `<div class="recent-list">${entries
    .map((entry) => {
      const project = data.projects.find((item) => item.id === entry.projectId)
      if (!project) return ''
      return `<button class="recent-row" data-select-project="${project.id}">
        <span class="project-dot" style="--project-color:${project.color}"></span>
        <span><strong>${escapeHtml(project.name)}</strong><small>${formatShortDate(entry.date)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</small></span>
        <b>${formatDuration(entry.durationSeconds)}</b>
      </button>`
    })
    .join('')}</div>`
}

function renderProjectCard(project: Project): string {
  const state = timerStateFor(project.id)
  const lastEntry = data.entries
    .filter((entry) => entry.projectId === project.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  return `
    <article class="project-card ${state === 'running' ? 'is-running' : ''} ${state === 'paused' ? 'is-paused' : ''}">
      <button class="project-card-body" data-select-project="${project.id}">
        <span class="project-icon" style="--project-color:${project.color}">${icon('folder')}</span>
        <span>
          <strong>${escapeHtml(project.name)}</strong>
          <small>${state === 'running' ? 'Tracking now' : state === 'paused' ? 'Paused' : lastEntry ? `Last tracked ${formatShortDate(lastEntry.date)}` : 'Ready to track'}</small>
        </span>
        ${icon('arrow')}
      </button>
      <div class="project-card-footer">
        <b data-timer-display="${project.id}">${formatDuration(projectTotal(project.id), state !== 'idle')}</b>
        <div class="timer-actions">${timerActionButtons(project.id, state)}</div>
      </div>
    </article>`
}

// Shared button markup for the three timer states, used by the project
// card, the overview running banner, and the project detail page so the
// start/pause/resume/stop affordances stay in sync everywhere they appear.
function timerActionButtons(projectId: string, state: 'running' | 'paused' | 'idle', size: '' | 'large' = ''): string {
  if (state === 'running') {
    return `<button class="timer-button pause ${size}" data-pause-timer="${projectId}">${icon('pause')} Pause</button>
      <button class="timer-button stop" data-stop-timer="${projectId}">${icon('stop')} Stop</button>`
  }
  if (state === 'paused') {
    return `<button class="timer-button ${size}" data-resume-timer="${projectId}">${icon('play')} Resume</button>
      <button class="timer-button stop" data-stop-timer="${projectId}">${icon('stop')} Stop</button>`
  }
  return `<button class="timer-button ${size}" data-start-timer="${projectId}">${icon('play')} Start</button>`
}

function renderOverview(): string {
  const active = activeProjects()
  const overall = data.entries.reduce((sum, entry) => sum + entry.durationSeconds, 0)
  const timerProject = data.activeTimer ? data.projects.find((project) => project.id === data.activeTimer?.projectId) : null
  const timerState = timerProject ? timerStateFor(timerProject.id) : 'idle'

  return `
    <header class="page-header">
      <div><p class="eyebrow">Workspace</p><h1>Good ${getDayPeriod()}</h1><p>Here’s where your time is going.</p></div>
      <button class="primary-button" data-open-project>${icon('plus')} New project</button>
    </header>
    ${
      timerProject
        ? `<section class="running-banner ${timerState === 'paused' ? 'is-paused' : ''}">
            <span class="running-indicator"><i></i>${icon('clock')}</span>
            <div><small>${timerState === 'running' ? 'Tracking now' : 'Paused'}</small><strong>${escapeHtml(timerProject.name)}</strong></div>
            <b data-timer-display="${timerProject.id}">${formatDuration(projectTotal(timerProject.id), true)}</b>
            <div class="running-banner-actions">${timerActionButtons(timerProject.id, timerState)}</div>
          </section>`
        : ''
    }
    <section class="stats-grid" aria-label="Time summary">
      <article class="stat-card"><span class="stat-icon blue">${icon('clock')}</span><div><small>Today</small><strong data-today-total>${formatDuration(todayTotal())}</strong></div></article>
      <article class="stat-card"><span class="stat-icon violet">${icon('folder')}</span><div><small>Active projects</small><strong>${active.length}</strong></div></article>
      <article class="stat-card"><span class="stat-icon green">${icon('calendar')}</span><div><small>All time</small><strong>${formatDuration(overall)}</strong></div></article>
    </section>
    <div class="dashboard-grid">
      <section class="panel activity-panel">
        <div class="section-heading"><div><h2>Last 7 days</h2><p>A quick look at your rhythm</p></div><strong>${formatDuration(valuesForLastSevenDays())}</strong></div>
        ${renderWeekChart()}
      </section>
      <section class="panel recent-panel">
        <div class="section-heading"><div><h2>Recent entries</h2><p>Your latest logged work</p></div></div>
        ${renderRecentEntries()}
      </section>
    </div>
    <section class="projects-section">
      <div class="section-heading"><div><h2>Active projects</h2><p>Pick up where you left off</p></div></div>
      ${
        active.length
          ? `<div class="project-grid">${active.map(renderProjectCard).join('')}</div>`
          : `<div class="empty-state">
              <span>${icon('folder')}</span><h2>Create your first project</h2>
              <p>Keep every hour organized, whether you track live or add it later.</p>
              <button class="primary-button" data-open-project>${icon('plus')} New project</button>
            </div>`
      }
    </section>`
}

function getDayPeriod(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function valuesForLastSevenDays(): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 6)
  const cutoffDate = toLocalDate(cutoff)
  return data.entries.filter((entry) => entry.date >= cutoffDate).reduce((sum, entry) => sum + entry.durationSeconds, 0)
}

function renderEntry(entry: TimeEntry, sessionNumber: number): string {
  const loggedAt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(entry.createdAt))

  return `
    <div class="entry-row">
      <span class="entry-date"><b>${new Date(`${entry.date}T12:00:00`).getDate()}</b><small>${new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${entry.date}T12:00:00`))}</small></span>
      <span class="entry-details">
        <span class="entry-title"><strong>${entry.note ? escapeHtml(entry.note) : `Timer session ${sessionNumber}`}</strong><span class="session-badge">Session ${sessionNumber}</span></span>
        <small>${formatDate(entry.date)} · Logged at ${loggedAt}</small>
      </span>
      <b class="entry-duration">${formatDuration(entry.durationSeconds, true)}</b>
      <span class="entry-actions">
        <button class="icon-button" data-edit-entry="${entry.id}" aria-label="Edit entry">${icon('edit')}</button>
        <button class="icon-button danger" data-delete-entry="${entry.id}" aria-label="Delete entry">${icon('trash')}</button>
      </span>
    </div>`
}

function renderProjectDetail(project: Project): string {
  const entries = data.entries
    .filter((entry) => entry.projectId === project.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const state = timerStateFor(project.id)
  const isCompleted = project.completedAt !== null

  return `
    <header class="page-header detail-header">
      <div class="project-title">
        <span class="project-icon large" style="--project-color:${project.color}">${icon('folder')}</span>
        <div><p class="eyebrow">${isCompleted ? 'Completed project' : state === 'running' ? 'Tracking now' : state === 'paused' ? 'Paused' : 'Active project'}</p><h1>${escapeHtml(project.name)}</h1><p>Created ${formatDate(toLocalDate(new Date(project.createdAt)))}</p></div>
      </div>
      <div class="header-actions">
        <button class="secondary-button" data-edit-project="${project.id}">${icon('edit')} Edit</button>
        ${
          isCompleted
            ? `<button class="secondary-button" data-restore-project="${project.id}">${icon('restore')} Restore</button>
               <button class="secondary-button danger" data-delete-project="${project.id}">${icon('trash')} Delete</button>`
            : `<button class="secondary-button" data-complete-project="${project.id}">${icon('check')} Complete</button>`
        }
      </div>
    </header>
    <section class="project-summary">
      <div><small>Total tracked</small><strong data-timer-display="${project.id}">${formatDuration(projectTotal(project.id), state !== 'idle')}</strong><p>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</p></div>
      ${
        !isCompleted
          ? `<div class="project-summary-actions">
              <button class="secondary-button" data-open-entry="${project.id}">${icon('plus')} Add time</button>
              ${timerActionButtons(project.id, state, 'large')}
            </div>`
          : ''
      }
    </section>
    <section class="panel entries-panel">
      <div class="section-heading">
        <div><h2>Time entries</h2><p>Every session logged for this project</p></div>
        ${!isCompleted ? `<button class="text-button" data-open-entry="${project.id}">${icon('plus')} Add manually</button>` : ''}
      </div>
      ${entries.length ? `<div class="entry-list">${entries.map((entry, index) => renderEntry(entry, entries.length - index)).join('')}</div>` : `<div class="empty-inline tall">${icon('clock')}<p>No time tracked yet.</p></div>`}
    </section>`
}

function renderDialogs(): string {
  return `
    <dialog id="project-dialog">
      <form method="dialog" id="project-form" class="dialog-form">
        <div class="dialog-heading"><div><p class="eyebrow">Project details</p><h2 id="project-dialog-title">New project</h2></div><button class="icon-button" value="cancel" formnovalidate aria-label="Close">${icon('close')}</button></div>
        <input type="hidden" name="projectId">
        <label>Project name<input name="name" maxlength="60" placeholder="e.g. Website redesign" required autofocus></label>
        <fieldset><legend>Color</legend><div class="color-options">${PROJECT_COLORS.map((color, index) => `<label class="color-choice" style="--choice:${color}"><input type="radio" name="color" value="${color}" ${index === 0 ? 'checked' : ''}><span></span></label>`).join('')}</div></fieldset>
        <div class="dialog-actions"><button class="secondary-button" value="cancel" formnovalidate>Cancel</button><button class="primary-button" value="default" type="submit">Save project</button></div>
      </form>
    </dialog>
    <dialog id="entry-dialog">
      <form method="dialog" id="entry-form" class="dialog-form">
        <div class="dialog-heading"><div><p class="eyebrow">Time entry</p><h2 id="entry-dialog-title">Add time</h2></div><button class="icon-button" value="cancel" formnovalidate aria-label="Close">${icon('close')}</button></div>
        <input type="hidden" name="projectId"><input type="hidden" name="entryId">
        <label>Date<input type="date" name="date" required></label>
        <div class="duration-inputs"><label>Hours<input type="number" name="hours" min="0" max="999" value="0" required></label><label>Minutes<input type="number" name="minutes" min="0" max="59" value="30" required></label></div>
        <label>Note <span>(optional)</span><input name="note" maxlength="120" placeholder="What did you work on?"></label>
        <p class="form-error" id="entry-error" role="alert"></p>
        <div class="dialog-actions"><button class="secondary-button" value="cancel" formnovalidate>Cancel</button><button class="primary-button" value="default" type="submit">Save entry</button></div>
      </form>
    </dialog>
    <dialog id="import-dialog">
      <form method="dialog" id="import-form" class="dialog-form">
        <div class="dialog-heading"><div><p class="eyebrow">Restore backup</p><h2>Replace current data?</h2></div><button class="icon-button" value="cancel" formnovalidate aria-label="Close">${icon('close')}</button></div>
        <div id="import-summary"></div>
        <p class="warning-copy">Importing replaces everything currently stored in this browser. Export first if you need a copy.</p>
        <div class="dialog-actions"><button class="secondary-button" value="cancel" formnovalidate>Cancel</button><button class="primary-button" value="default" type="submit">Import backup</button></div>
      </form>
    </dialog>
    <dialog id="confirm-dialog">
      <form method="dialog" class="dialog-form">
        <div class="dialog-heading"><div><h2 id="confirm-title">Are you sure?</h2></div><button class="icon-button" value="cancel" formnovalidate aria-label="Close">${icon('close')}</button></div>
        <p id="confirm-message"></p>
        <div class="dialog-actions"><button class="secondary-button" value="cancel" formnovalidate>Cancel</button><button class="primary-button" id="confirm-confirm-button" value="confirm" type="submit">Confirm</button></div>
      </form>
    </dialog>
    <div class="toast" role="status" aria-live="polite"></div>`
}

function render(): void {
  if (selectedProjectId && !data.projects.some((project) => project.id === selectedProjectId)) selectedProjectId = null
  const project = data.projects.find((item) => item.id === selectedProjectId)
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main-content">${project ? renderProjectDetail(project) : renderOverview()}</main>
    </div>
    ${renderDialogs()}`
  bindEvents()
}

function persist(): void {
  saveData(data)
  render()
}

function showToast(message: string, isError = false): void {
  const toast = document.querySelector<HTMLDivElement>('.toast')
  if (!toast) return
  window.clearTimeout(toastTimeout)
  toast.textContent = message
  toast.className = `toast visible ${isError ? 'error' : ''}`
  toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 3500)
}

function confirmAction(message: string, options: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!
  document.querySelector<HTMLParagraphElement>('#confirm-message')!.textContent = message
  const confirmButton = document.querySelector<HTMLButtonElement>('#confirm-confirm-button')!
  confirmButton.textContent = options.confirmLabel ?? 'Confirm'
  confirmButton.classList.toggle('danger', Boolean(options.danger))
  dialog.showModal()
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue === 'confirm'),
      { once: true },
    )
  })
}

function openProjectDialog(project?: Project): void {
  const dialog = document.querySelector<HTMLDialogElement>('#project-dialog')!
  const form = document.querySelector<HTMLFormElement>('#project-form')!
  form.reset()
  ;(form.elements.namedItem('projectId') as HTMLInputElement).value = project?.id ?? ''
  ;(form.elements.namedItem('name') as HTMLInputElement).value = project?.name ?? ''
  ;(form.elements.namedItem('color') as RadioNodeList).value = project?.color ?? PROJECT_COLORS[0]
  document.querySelector('#project-dialog-title')!.textContent = project ? 'Edit project' : 'New project'
  dialog.showModal()
}

function openEntryDialog(projectId: string, entry?: TimeEntry): void {
  const dialog = document.querySelector<HTMLDialogElement>('#entry-dialog')!
  const form = document.querySelector<HTMLFormElement>('#entry-form')!
  form.reset()
  ;(form.elements.namedItem('projectId') as HTMLInputElement).value = projectId
  ;(form.elements.namedItem('entryId') as HTMLInputElement).value = entry?.id ?? ''
  ;(form.elements.namedItem('date') as HTMLInputElement).value = entry?.date ?? toLocalDate()
  ;(form.elements.namedItem('hours') as HTMLInputElement).value = String(Math.floor((entry?.durationSeconds ?? 1800) / 3600))
  ;(form.elements.namedItem('minutes') as HTMLInputElement).value = String(Math.floor(((entry?.durationSeconds ?? 1800) % 3600) / 60))
  ;(form.elements.namedItem('note') as HTMLInputElement).value = entry?.note ?? ''
  document.querySelector('#entry-dialog-title')!.textContent = entry ? 'Edit time entry' : 'Add time'
  dialog.showModal()
}

async function startTimer(projectId: string): Promise<void> {
  if (data.activeTimer && data.activeTimer.projectId !== projectId) {
    const current = data.projects.find((project) => project.id === data.activeTimer?.projectId)
    const confirmed = await confirmAction(
      `Stop the timer for “${current?.name ?? 'another project'}” and start this one?`,
      { confirmLabel: 'Switch timer' },
    )
    if (!confirmed) return
    // `data` may have been replaced wholesale by a cross-tab sync event while
    // the confirm dialog was open (watchForExternalChanges keeps reloading it
    // even though render() is skipped while a dialog is open) — re-check
    // rather than trusting the activeTimer captured before the await.
    if (data.activeTimer && data.activeTimer.projectId !== projectId) stopTimer(data.activeTimer.projectId, false)
  }
  if (!data.activeTimer) {
    data.activeTimer = { projectId, startedAt: Date.now(), running: true, segments: [] }
    persist()
  }
}

function pauseTimer(projectId: string): void {
  if (pauseActiveTimer(data, projectId)) persist()
}

function resumeTimer(projectId: string): void {
  if (resumeActiveTimer(data, projectId)) persist()
}

function stopTimer(projectId: string, shouldPersist = true): void {
  if (stopActiveTimer(data, projectId) && shouldPersist) persist()
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-overview]').forEach((button) =>
    button.addEventListener('click', () => {
      selectedProjectId = null
      render()
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-select-project]').forEach((button) =>
    button.addEventListener('click', () => {
      selectedProjectId = button.dataset.selectProject ?? null
      render()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-open-project]').forEach((button) => button.addEventListener('click', () => openProjectDialog()))
  document.querySelectorAll<HTMLElement>('[data-edit-project]').forEach((button) =>
    button.addEventListener('click', () => openProjectDialog(data.projects.find((project) => project.id === button.dataset.editProject))),
  )
  document.querySelectorAll<HTMLElement>('[data-open-entry]').forEach((button) =>
    button.addEventListener('click', () => openEntryDialog(button.dataset.openEntry!)),
  )
  document.querySelectorAll<HTMLElement>('[data-edit-entry]').forEach((button) =>
    button.addEventListener('click', () => {
      const entry = data.entries.find((item) => item.id === button.dataset.editEntry)
      if (entry) openEntryDialog(entry.projectId, entry)
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-start-timer]').forEach((button) =>
    button.addEventListener('click', () => startTimer(button.dataset.startTimer!)),
  )
  document.querySelectorAll<HTMLElement>('[data-pause-timer]').forEach((button) =>
    button.addEventListener('click', () => pauseTimer(button.dataset.pauseTimer!)),
  )
  document.querySelectorAll<HTMLElement>('[data-resume-timer]').forEach((button) =>
    button.addEventListener('click', () => resumeTimer(button.dataset.resumeTimer!)),
  )
  document.querySelectorAll<HTMLElement>('[data-stop-timer]').forEach((button) =>
    button.addEventListener('click', () => stopTimer(button.dataset.stopTimer!)),
  )
  document.querySelectorAll<HTMLElement>('[data-complete-project]').forEach((button) =>
    button.addEventListener('click', async () => {
      const project = data.projects.find((item) => item.id === button.dataset.completeProject)
      if (!project) return
      const confirmed = await confirmAction(`Mark “${project.name}” as completed?`, { confirmLabel: 'Complete' })
      if (!confirmed) return
      if (data.activeTimer?.projectId === project.id) stopTimer(project.id, false)
      project.completedAt = new Date().toISOString()
      persist()
      showToast('Project marked complete.')
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-restore-project]').forEach((button) =>
    button.addEventListener('click', () => {
      const project = data.projects.find((item) => item.id === button.dataset.restoreProject)
      if (project) {
        project.completedAt = null
        persist()
      }
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-delete-project]').forEach((button) =>
    button.addEventListener('click', async () => {
      const project = data.projects.find((item) => item.id === button.dataset.deleteProject)
      if (!project) return
      const entryCount = data.entries.filter((entry) => entry.projectId === project.id).length
      const detail = entryCount ? ` and its ${entryCount} time ${entryCount === 1 ? 'entry' : 'entries'}` : ''
      const confirmed = await confirmAction(`Delete “${project.name}”${detail}? This cannot be undone.`, {
        confirmLabel: 'Delete project',
        danger: true,
      })
      if (!confirmed) return
      data.projects = data.projects.filter((item) => item.id !== project.id)
      data.entries = data.entries.filter((entry) => entry.projectId !== project.id)
      if (selectedProjectId === project.id) selectedProjectId = null
      persist()
      showToast('Project deleted.')
    }),
  )
  document.querySelectorAll<HTMLElement>('[data-delete-entry]').forEach((button) =>
    button.addEventListener('click', async () => {
      const confirmed = await confirmAction('Delete this time entry? This cannot be undone.', {
        confirmLabel: 'Delete entry',
        danger: true,
      })
      if (!confirmed) return
      data.entries = data.entries.filter((entry) => entry.id !== button.dataset.deleteEntry)
      persist()
    }),
  )

  document.querySelector<HTMLFormElement>('#project-form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    if ((event as SubmitEvent).submitter?.getAttribute('value') === 'cancel') {
      document.querySelector<HTMLDialogElement>('#project-dialog')!.close()
      return
    }
    const values = new FormData(form)
    const id = String(values.get('projectId') ?? '')
    const name = String(values.get('name') ?? '').trim()
    const color = String(values.get('color') ?? PROJECT_COLORS[0])
    if (!name) return
    if (id) {
      const project = data.projects.find((item) => item.id === id)
      if (project) Object.assign(project, { name, color })
    } else {
      const project: Project = { id: crypto.randomUUID(), name, color, createdAt: new Date().toISOString(), completedAt: null }
      data.projects.push(project)
      selectedProjectId = project.id
    }
    document.querySelector<HTMLDialogElement>('#project-dialog')!.close()
    persist()
  })

  document.querySelector<HTMLFormElement>('#entry-form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    if ((event as SubmitEvent).submitter?.getAttribute('value') === 'cancel') {
      document.querySelector<HTMLDialogElement>('#entry-dialog')!.close()
      return
    }
    const values = new FormData(form)
    const hours = Number(values.get('hours'))
    const minutes = Number(values.get('minutes'))
    const durationSeconds = (hours * 60 + minutes) * 60
    const error = document.querySelector<HTMLParagraphElement>('#entry-error')!
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      error.textContent = 'Enter a duration greater than zero.'
      return
    }
    const entryId = String(values.get('entryId') ?? '')
    const entry: TimeEntry = {
      id: entryId || crypto.randomUUID(),
      projectId: String(values.get('projectId')),
      date: String(values.get('date')),
      durationSeconds,
      note: String(values.get('note') ?? '').trim(),
      createdAt: entryId ? (data.entries.find((item) => item.id === entryId)?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
    }
    if (entryId) data.entries = data.entries.map((item) => (item.id === entryId ? entry : item))
    else data.entries.push(entry)
    document.querySelector<HTMLDialogElement>('#entry-dialog')!.close()
    persist()
  })

  document.querySelector<HTMLElement>('[data-export]')!.addEventListener('click', exportBackup)
  document.querySelector<HTMLElement>('[data-import]')!.addEventListener('click', () => document.querySelector<HTMLInputElement>('#import-file')!.click())
  document.querySelector<HTMLInputElement>('#import-file')!.addEventListener('change', handleImportFile)
  document.querySelector<HTMLFormElement>('#import-form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    if ((event as SubmitEvent).submitter?.getAttribute('value') === 'cancel') {
      pendingImport = null
      document.querySelector<HTMLDialogElement>('#import-dialog')!.close()
      return
    }
    if (!pendingImport) return
    data = pendingImport
    pendingImport = null
    selectedProjectId = null
    document.querySelector<HTMLDialogElement>('#import-dialog')!.close()
    persist()
    window.setTimeout(() => showToast('Backup imported successfully.'), 0)
  })
}

function exportBackup(): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `timebase-backup-${toLocalDate()}.json`
  link.click()
  URL.revokeObjectURL(link.href)
  showToast('Backup downloaded.')
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    pendingImport = parseBackup(await file.text())
    const summary = document.querySelector<HTMLDivElement>('#import-summary')!
    summary.innerHTML = `<div class="import-stats"><span><strong>${pendingImport.projects.length}</strong> projects</span><span><strong>${pendingImport.entries.length}</strong> entries</span><span><strong>v${DATA_VERSION}</strong> format</span></div>`
    document.querySelector<HTMLDialogElement>('#import-dialog')!.showModal()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not import that file.', true)
  }
}

window.setInterval(() => {
  if (!data.activeTimer || !data.activeTimer.running) return
  const projectId = data.activeTimer.projectId
  document.querySelectorAll<HTMLElement>(`[data-timer-display="${projectId}"]`).forEach((element) => {
    element.textContent = formatDuration(projectTotal(projectId), true)
  })
  const today = document.querySelector<HTMLElement>('[data-today-total]')
  if (today) today.textContent = formatDuration(todayTotal())
  document.querySelectorAll<HTMLElement>('.project-nav-item').forEach((item) => {
    if (item.dataset.selectProject === projectId) {
      const time = item.querySelector<HTMLElement>('.project-nav-time')
      if (time) time.textContent = formatDuration(projectTotal(projectId), true)
    }
  })
}, 1000)

// Keep this tab in sync with changes made in another dashboard tab or the
// extension popup — otherwise a timer started/stopped elsewhere never shows
// up here until some unrelated action happens to trigger a re-render.
watchForExternalChanges(() => {
  data = loadData()
  // Don't blow away a dialog the user is actively filling in (render() replaces
  // the whole DOM, which would silently close it) — the next local action will
  // pick up the merged state anyway.
  if (!document.querySelector('dialog[open]')) render()
})

render()
