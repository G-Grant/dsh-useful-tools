/**
 * Sidebar feature-panel collapse: a divider plus a toggle button rendered into
 * the sidebar foot action list. Toggling hides the global panel list
 * (`nav[class*="panelList"]`) through one injected `<style>` tag, so the
 * workspace / session area gains the freed height.
 *
 * The sidebar shell owns its own DOM outside React, so the divider element is
 * created and anchored imperatively (beside the New Session button or the
 * panel list) and kept in place by a MutationObserver plus a slow interval.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Fragment, useEffect, useRef, useState } from 'react'

/** Storage key of the collapse preference; the legacy key is still honoured. */
const STORAGE_KEY = 'dsh-useful-tools:panels-hidden'
/** Preference key written by the pre-merge `dsh-sidebar-collapse` plugin. */
const LEGACY_STORAGE_KEY = 'dsh-sidebar-collapse:panels-hidden'

const PANEL_LIST_SELECTOR = 'nav[class*="panelList"]'
const NEW_SESSION_SELECTOR = 'button[class*="newSession"]'
const DIVIDER_ATTR = 'data-dsh-useful-tools-divider'
const HIDE_PANELS_CSS = `${PANEL_LIST_SELECTOR}{display:none !important}`

const DIVIDER_CSS = [
  `[${DIVIDER_ATTR}]{display:flex;align-items:center;gap:6px;height:16px;margin:-6px 3px 8px;flex:none;color:var(--dsw-alias-label-secondary);}`,
  `[${DIVIDER_ATTR}][data-anchor="new-session"]{margin-top:-8px;}`,
  `[${DIVIDER_ATTR}][data-anchor="panels"]{margin-top:-6px;margin-bottom:6px;}`,
  `[${DIVIDER_ATTR}] .dsh-ut-divider-line{flex:1 1 auto;min-width:8px;height:1px;border-radius:1px;background:currentColor;opacity:.3;}`,
  `[${DIVIDER_ATTR}] .dsh-ut-divider-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:24px;height:16px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;opacity:.75;transition:opacity .12s ease,background-color .12s ease;}`,
  `[${DIVIDER_ATTR}] .dsh-ut-divider-btn:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));}`,
  `[${DIVIDER_ATTR}] .dsh-ut-divider-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px;}`,
  `[${DIVIDER_ATTR}] .dsh-ut-divider-tip{position:absolute;left:50%;top:calc(100% + 6px);transform:translateX(-50%);white-space:nowrap;font-size:12px;line-height:18px;padding:2px 8px;border-radius:6px;background:var(--dsw-alias-label-primary,#2b2b2b);color:var(--dsw-alias-label-primary-inverted,#fff);opacity:0;pointer-events:none;transition:opacity .12s ease;z-index:9;}`,
  `[${DIVIDER_ATTR}] .dsh-ut-divider-btn:hover .dsh-ut-divider-tip,[${DIVIDER_ATTR}] .dsh-ut-divider-btn:focus-visible .dsh-ut-divider-tip{opacity:1;}`,
].join('')

/** Read the persisted collapse preference (legacy key as the fallback). */
function readHidden(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    return stored === '1'
  } catch {
    return false
  }
}

/** Persist the collapse preference; best effort only. */
function writeHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0')
  } catch {
    // Persisting the preference is best effort only.
  }
}

interface DividerDom {
  root: HTMLDivElement
  button: HTMLButtonElement
  apply(hidden: boolean, label: string): void
}

/** Build the divider element the sidebar cannot render as JSX. */
function createDivider(): DividerDom {
  const root = document.createElement('div')
  root.setAttribute(DIVIDER_ATTR, '')
  const left = document.createElement('span')
  left.className = 'dsh-ut-divider-line'
  const right = document.createElement('span')
  right.className = 'dsh-ut-divider-line'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'dsh-ut-divider-btn'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '12')
  svg.setAttribute('height', '12')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.6')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  const tip = document.createElement('span')
  tip.className = 'dsh-ut-divider-tip'
  button.append(svg, tip)
  root.append(left, button, right)
  return {
    root,
    button,
    apply(hidden: boolean, label: string): void {
      path.setAttribute('d', hidden ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4')
      root.setAttribute('data-anchor', hidden ? 'new-session' : 'panels')
      button.setAttribute('aria-label', label)
      button.setAttribute('aria-expanded', hidden ? 'false' : 'true')
      button.title = label
      tip.textContent = label
    },
  }
}

/** The element the divider follows: the New Session button, or the panel list. */
function anchorForDivider(hidden: boolean): Element | null {
  const newSession = document.querySelector(NEW_SESSION_SELECTOR)
  const panels = document.querySelector(PANEL_LIST_SELECTOR)
  const anchor = hidden ? (newSession ?? panels) : (panels ?? newSession)
  return anchor?.parentElement ? anchor : null
}

/** Sidebar foot divider that collapses the global panel list. */
export function SidebarCollapse({
  t,
}: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'useful-tools'>): JSX.Element {
  const [hidden, setHidden] = useState<boolean>(readHidden)
  const label = hidden ? t('panels.show') : t('panels.hide')
  const hiddenRef = useRef(hidden)
  const labelRef = useRef(label)
  const domRef = useRef<DividerDom | null>(null)
  const ensureRef = useRef<(() => void) | null>(null)
  hiddenRef.current = hidden
  labelRef.current = label

  useEffect(() => {
    const dom = createDivider()
    domRef.current = dom
    dom.apply(hiddenRef.current, labelRef.current)
    const onClick = (): void => {
      setHidden((previous) => {
        const next = !previous
        writeHidden(next)
        return next
      })
    }
    dom.button.addEventListener('click', onClick)

    let observer: MutationObserver | undefined
    let observed: Element | undefined
    let inserts: number[] = []
    let stopped = false
    // The sidebar re-renders its own DOM; re-anchor the divider after each
    // change, but give up on a shell that keeps dropping it.
    const ensure = (): void => {
      if (stopped) return
      const anchor = anchorForDivider(hiddenRef.current)
      if (anchor === null) return
      const parent = anchor.parentElement
      if (parent === null) return
      if (dom.root.parentElement !== parent || dom.root.previousElementSibling !== anchor) {
        const now = Date.now()
        inserts = inserts.filter((at) => now - at < 2000)
        if (inserts.length >= 20) {
          stopped = true
          observer?.disconnect()
          return
        }
        inserts.push(now)
        anchor.insertAdjacentElement('afterend', dom.root)
      }
      if (observed !== parent && typeof MutationObserver === 'function') {
        observer?.disconnect()
        observer = new MutationObserver(ensure)
        observer.observe(parent, { childList: true })
        observed = parent
      }
    }
    ensure()
    ensureRef.current = ensure
    const timer = window.setInterval(ensure, 2000)
    return (): void => {
      window.clearInterval(timer)
      observer?.disconnect()
      dom.button.removeEventListener('click', onClick)
      ensureRef.current = null
      dom.root.remove()
      domRef.current = null
    }
  }, [])

  useEffect(() => {
    domRef.current?.apply(hidden, label)
    ensureRef.current?.()
  }, [hidden, label])

  return (
    <Fragment>
      <style data-dsh-plugin="useful-tools">{DIVIDER_CSS}</style>
      {hidden ? <style data-dsh-plugin="useful-tools">{HIDE_PANELS_CSS}</style> : null}
    </Fragment>
  )
}
