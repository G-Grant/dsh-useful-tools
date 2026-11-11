/**
 * Hero chips: environment (本机 / Worktree) then branch, to the right of the
 * workspace chip on a blank session of a git repository's MAIN checkout. A
 * blank session inside a linked worktree renders nothing.
 *
 * Interaction:
 *  - environment first: 本机 (default) really checks out; Worktree never
 *    moves the local HEAD;
 *  - branch chip: in 本机 it is the current checkout (switch refuses on
 *    uncommitted / occupied work); in Worktree it is the create base;
 *  - choosing Worktree opens the branch panel; a two-way switch picks the mode:
 *    「新分支」 reads the list as a base and adds the name field,
 *    「已有分支」 checks out a local branch or tracks a remote branch;
 *  - creating makes the worktree, registers it as a Workspace titled with
 *    the worktree name, and opens a blank session there carrying the draft.
 *
 * Placement: the component is a `conversation.input.dock` entry. The hero's
 * workspace row is owned by ui-conversation (its picker slot is the popup, not
 * the chip row), so the chips are portaled into that row right before the
 * agent-preset chip; if the row cannot be found they render as a row of their
 * own inside the dock, so the feature never depends on the markup.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, IconBranchOutlineRegular, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconFolderOpenOutlineRegular,
  IconWorkspaceTreeOutlineRegular, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the session standard kit (`sessionId`, `useSessions`, ...).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: merges `useInput` / `inputActions` into the dock's runtime kit.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { localBranchName, nameIssue } from '../normalize.ts'
import type { BranchInfo, WorktreeMode } from '../wire.ts'
import { requestCreate, requestSwitch } from './api.ts'
import { emitChanged } from './events.ts'
import { describeError, unwrap } from './flows.ts'
import { Popover } from './Popover.tsx'
import type { ChipsInjected } from './slots.ts'
import { useRepoStatus, type RepoFacts } from './useRepoStatus.ts'
import css from './ui.module.css'

/** Full props: dock owner share + standard kits + injected faces + locale seat. */
export type WorktreeChipsProps =
  PropsRuntime<'conversation.input.dock'>
  & ChipsInjected
  & PropsLocale<'useful-tools'>

type Env = 'local' | 'worktree'

/**
 * Find (or create) the portal host inside the hero's workspace row.
 * @param anchorRef - a node inside the dock, used to scope the lookup.
 * @param enabled - whether the chips should be shown at all.
 * @returns the host element, or null while the row cannot be located.
 */
function useHeroRow(anchorRef: RefObject<HTMLElement | null>, enabled: boolean): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!enabled) {
      setHost(null)
      return
    }
    const anchor = anchorRef.current
    if (anchor === null) return
    const content = anchor.closest('[data-conversation-content]')
    let created: HTMLElement | null = null
    const place = (): void => {
      const row = content?.querySelector('[data-slot="conversation.hero.workspace"]')?.parentElement ?? null
      if (row === null) {
        if (created?.isConnected === true) created.remove()
        setHost(current => (current === null ? current : null))
        return
      }
      if (created === null) {
        created = document.createElement('div')
        created.dataset['wtmHost'] = ''
        created.style.display = 'contents'
      }
      if (created.parentElement !== row) {
        row.insertBefore(created, row.querySelector(':scope > [data-slot="conversation.hero.agentPreset"]'))
      }
      const placed = created
      setHost(current => (current === placed ? current : placed))
    }
    place()
    const observer = new MutationObserver(place)
    if (content !== null) observer.observe(content, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      created?.remove()
      setHost(null)
    }
  }, [anchorRef, enabled])
  return host
}

/** One toast on screen; the rest wait their turn. */
function useToasts(): readonly [{ seq: number; text: string } | undefined, (text: string) => void, () => void] {
  const [queue, setQueue] = useState<readonly { seq: number; text: string }[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string) => {
    seq.current += 1
    const next = seq.current
    setQueue(current => [...current, { seq: next, text }])
  }, [])
  const shift = useCallback(() => { setQueue(current => current.slice(1)) }, [])
  return [queue[0], push, shift]
}

/** Case-insensitive substring filter over branch names. */
function filterBranches(branches: readonly BranchInfo[], query: string): BranchInfo[] {
  const needle = query.trim().toLowerCase()
  return needle === '' ? [...branches] : branches.filter(branch => branch.name.toLowerCase().includes(needle))
}

function isReusable(branch: BranchInfo): boolean {
  return !branch.current && branch.occupiedBy === undefined
}

/** The dock entry. */
export function WorktreeChips(props: WorktreeChipsProps) {
  const {
    sessionId, useSessions, useSession, useInput, inputActions, namingMode, adoptWorktree, takePendingDraft, t,
  } = props
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const blank = useSession(session => session.blank)
  const draft = useInput(state => state.draft)
  const [facts, refresh] = useRepoStatus(cwd)

  // A draft handed over by the session we came from (worktree creation).
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    const pending = takePendingDraft(sessionId)
    if (pending === undefined || pending === '') return
    inputActions.setDraft(pending)
    const retry = window.setTimeout(() => {
      if (draftRef.current === '') inputActions.setDraft(pending)
    }, 250)
    return () => { window.clearTimeout(retry) }
  }, [sessionId, takePendingDraft, inputActions])

  const visible = blank && facts !== null && facts.main
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const host = useHeroRow(anchorRef, visible)

  const chips = visible && facts !== null
    ? <ChipsBody facts={facts} cwd={cwd as string} draft={draft} refresh={refresh} namingMode={namingMode()} adoptWorktree={adoptWorktree} t={t} />
    : null

  return (
    <>
      <span ref={anchorRef} hidden data-wtm-anchor="" />
      {chips !== null && (host === null ? <div className={css.inlineRow}>{chips}</div> : createPortal(chips, host))}
    </>
  )
}

interface ChipsBodyProps {
  facts: RepoFacts
  cwd: string
  draft: string
  refresh: () => Promise<void>
  namingMode: 'manual' | 'auto'
  adoptWorktree: ChipsInjected['adoptWorktree']
  t: WorktreeChipsProps['t']
}

type Panel = 'branch' | 'env' | null

function ChipsBody({ facts, cwd, draft, refresh, namingMode, adoptWorktree, t }: ChipsBodyProps) {
  const [env, setEnv] = useState<Env>('local')
  const [mode, setMode] = useState<WorktreeMode>('new')
  const [panel, setPanel] = useState<Panel>(null)
  const [base, setBase] = useState<string | undefined>(undefined)
  const [target, setTarget] = useState<Pick<BranchInfo, 'name' | 'remote'>>()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [toast, pushToast, shiftToast] = useToasts()
  const branchRef = useRef<HTMLButtonElement | null>(null)
  const envRef = useRef<HTMLButtonElement | null>(null)
  const modeGroup = useId()

  // A different directory is a different repository context.
  useEffect(() => {
    setEnv('local')
    setMode('new')
    setPanel(null)
    setBase(undefined)
    setTarget(undefined)
    setName('')
    setQuery('')
  }, [cwd])

  const reuse = mode === 'reuse'
  const currentBranch = facts.currentBranch ?? 'HEAD'
  const effectiveBase = base ?? facts.currentBranch ?? facts.branches[0]?.name ?? 'HEAD'
  const selectedTarget = target === undefined ? undefined : facts.branches.find(
    branch => branch.name === target.name && branch.remote === target.remote,
  )
  const targetReady = selectedTarget !== undefined && isReusable(selectedTarget)
  const hasReusable = facts.branches.some(isReusable)
  const branchField = env === 'local' ? t('chip.branchLabel') : reuse ? t('create.branchTarget') : t('create.branchBase')
  const auto = namingMode === 'auto'
  const trimmed = name.trim()
  const issue = nameIssue(name)
  const exists = facts.branches.some(branch => !branch.remote && branch.name === trimmed)
  const nameProblem: 'empty' | 'illegal' | 'tooLong' | 'exists' | null = auto
    ? null
    : issue !== null ? issue : exists ? 'exists' : null
  const canCreate = !busy && (reuse ? targetReady : nameProblem === null)

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
    } catch (error) {
      pushToast(describeError(t, error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [pushToast, t])

  const pickBranch = (branch: BranchInfo): void => {
    if (env === 'worktree') {
      if (reuse) setTarget({ name: branch.name, remote: branch.remote })
      else setBase(branch.name)
      return
    }
    if (branch.current) {
      setPanel(null)
      return
    }
    void run(async () => {
      unwrap(await requestSwitch({ path: cwd, branch: branch.name }))
      emitChanged()
      await refresh()
      setPanel(null)
    })
  }

  const chooseLocal = (): void => {
    setEnv('local')
    setMode('new')
    setBase(undefined)
    setTarget(undefined)
    setName('')
    setPanel(null)
  }

  const chooseWorktree = (): void => {
    setEnv('worktree')
    setQuery('')
    setPanel('branch')
    void refresh()
  }

  const create = (): void => {
    if (!canCreate) return
    void run(async () => {
      const result = unwrap(await requestCreate(reuse && selectedTarget !== undefined
        ? { path: cwd, mode: 'reuse', branch: selectedTarget.name, branchSource: selectedTarget.remote ? 'remote' : 'local' }
        : { path: cwd, mode: 'new', ...(auto ? {} : { name: trimmed }), base: effectiveBase }))
      emitChanged()
      await adoptWorktree({ path: result.path, title: result.title, draft })
      setPanel(null)
      if (result.copyWarnings.length > 0) pushToast(t('create.warnings', { n: result.copyWarnings.length }))
    })
  }

  const visibleBranches = useMemo(() => filterBranches(facts.branches, query), [facts.branches, query])

  const branchLabel = reuse
    ? target?.name ?? t('create.modeReuse')
    : env === 'worktree' ? t('chip.base', { branch: effectiveBase }) : currentBranch
  const envLabel = env === 'local' ? t('env.local') : t('env.worktree')

  const togglePanel = (next: Exclude<Panel, null>): void => {
    setPanel(current => (current === next ? null : next))
    if (next === 'branch') setQuery('')
    if (next === 'branch' || next === 'env') void refresh()
  }

  return (
    <>
      <button
        ref={envRef}
        type="button"
        className={css.chip}
        aria-label={t('chip.envLabel')}
        aria-haspopup="dialog"
        aria-expanded={panel === 'env'}
        onClick={() => { togglePanel('env') }}
      >
        {env === 'worktree'
          ? <IconWorkspaceTreeOutlineRegular className={`${css.chipIcon} ${css.chipAccent}`} size={16} />
          : <IconFolderOpenOutlineRegular className={css.chipIcon} size={16} />}
        <span className={css.chipLabel}>{envLabel}</span>
        <IconChevronDownOutlineRegular className={css.chipChevron} size={12} />
      </button>
      <button
        ref={branchRef}
        type="button"
        className={css.chip}
        aria-label={t('chip.branchLabel')}
        aria-haspopup="dialog"
        aria-expanded={panel === 'branch'}
        onClick={() => { togglePanel('branch') }}
      >
        <IconBranchOutlineRegular className={css.chipIcon} size={16} />
        <span className={css.chipLabel}>{branchLabel}</span>
        <IconChevronDownOutlineRegular className={css.chipChevron} size={12} />
      </button>

      <Popover open={panel === 'env'} anchorRef={envRef} onClose={() => { setPanel(null) }} label={t('chip.envLabel')} width={280}>
        <button
          type="button"
          className={css.row}
          onClick={chooseLocal}
        >
          <IconFolderOpenOutlineRegular className={css.chipIcon} size={16} />
          <span className={css.rowText}>{t('env.local')}</span>
          {env === 'local' && <IconCheckOutlineRegular className={css.rowCheck} size={14} />}
        </button>
        <button
          type="button"
          className={css.row}
          onClick={chooseWorktree}
        >
          <IconWorkspaceTreeOutlineRegular className={css.chipIcon} size={16} />
          <span className={css.rowText}>{t('env.worktree')}</span>
          {env === 'worktree' && <IconCheckOutlineRegular className={css.rowCheck} size={14} />}
        </button>
      </Popover>

      <Popover open={panel === 'branch'} anchorRef={branchRef} onClose={() => { setPanel(null) }} label={t('chip.branchLabel')} width={env === 'worktree' ? 360 : 300}>
        {env === 'worktree' && (
          <div className={css.segmented} role="radiogroup" aria-label={t('create.modeLabel')}>
            <label className={css.segment}>
              <input type="radio" name={modeGroup} checked={!reuse} disabled={busy} onChange={() => { setMode('new'); setQuery('') }} />
              <span>{t('create.modeNew')}</span>
            </label>
            <label className={css.segment}>
              <input type="radio" name={modeGroup} checked={reuse} disabled={busy} onChange={() => { setMode('reuse'); setQuery('') }} />
              <span>{t('create.modeReuse')}</span>
            </label>
          </div>
        )}
        {env === 'worktree' && <span className={css.fieldLabel}>{branchField}</span>}
        <input
          className={css.search}
          autoFocus={env === 'local' || auto || reuse}
          value={query}
          aria-label={t('branch.search')}
          placeholder={t('branch.search')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <div className={css.list} role="listbox" aria-label={branchField}>
          {visibleBranches.length === 0 && (query.trim() !== '' || !reuse) && <div className={css.empty}>{t('branch.empty')}</div>}
          {visibleBranches.map((branch) => {
            const selected = reuse
              ? branch.name === target?.name && branch.remote === target?.remote
              : env === 'worktree' ? branch.name === effectiveBase : branch.current
            const blocked = env === 'local'
              ? branch.occupiedBy !== undefined
              : reuse && !isReusable(branch)
            return (
              <button
                key={`${branch.remote ? 'remote' : 'local'}:${branch.name}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={css.row}
                disabled={busy || blocked}
                title={branch.occupiedBy === undefined ? branch.name : t('branch.occupiedTitle', { path: branch.occupiedBy })}
                onClick={() => { pickBranch(branch) }}
              >
                <span className={css.rowText}>{branch.name}</span>
                {branch.remote && <span className={css.tag}>{t('branch.remote')}</span>}
                {blocked && <span className={css.tag}>{t('branch.occupied')}</span>}
                {selected && <IconCheckOutlineRegular className={css.rowCheck} size={14} />}
              </button>
            )
          })}
        </div>
        {env === 'worktree' && (
          <div className={css.createBar}>
            {!reuse && !auto && (
              <input
                className={`${css.input} ${nameProblem !== null && nameProblem !== 'empty' ? css.inputBad : ''}`}
                autoFocus
                value={name}
                placeholder={t('name.label')}
                aria-label={t('name.label')}
                aria-invalid={nameProblem !== null && nameProblem !== 'empty'}
                onChange={(event) => { setName(event.target.value) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    create()
                  }
                }}
              />
            )}
            {!reuse && nameProblem === 'illegal' && <p className={css.hintBad} role="status">{t('name.illegal')}</p>}
            {!reuse && nameProblem === 'tooLong' && <p className={css.hintBad} role="status">{t('name.tooLong')}</p>}
            {!reuse && nameProblem === 'exists' && <p className={css.hintBad} role="status">{t('name.exists', { name: trimmed })}</p>}
            {reuse && target !== undefined && !targetReady && (
              <p className={css.hintBad} role="status">{t('create.targetUnavailable', { branch: target.name })}</p>
            )}
            {reuse && target === undefined && !hasReusable && (
              <p className={css.hint} role="status">{t('create.noAvailableBranch')}</p>
            )}
            {reuse && targetReady && selectedTarget.remote && (
              <p className={css.hint}>{t('create.trackHint', { branch: localBranchName(selectedTarget.name) })}</p>
            )}
            <div className={css.actions}>
              <Button variant="primary" size="sm" disabled={!canCreate} onClick={create}>
                {busy ? t('create.busy') : t('create.action')}
              </Button>
            </div>
          </div>
        )}
      </Popover>

      {toast !== undefined && <Toast key={toast.seq} text={toast.text} onDone={shiftToast} />}
    </>
  )
}
