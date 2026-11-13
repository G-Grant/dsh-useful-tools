/**
 * Sidebar feature-panel toggle: one action button in the sidebar foot that
 * collapses the global panel list (`nav[class*="panelList"]`) through one
 * injected `<style>` tag, so the workspace area gains the freed height.
 *
 * The button is a plain slot occupant: the sidebar shell owns the row, its
 * sizing and its rail/wide states, and hands the action `wide` so the button
 * matches the shell's own 28px / 36px icon buttons. Hiding the panel list
 * needs no DOM insertion of our own, which keeps this stable across shell
 * refactors.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Fragment, useState } from 'react'

/** Storage key of the collapse preference; the legacy key is still honoured. */
const STORAGE_KEY = 'dsh-useful-tools:panels-hidden'
/** Preference key written by the pre-merge `dsh-sidebar-collapse` plugin. */
const LEGACY_STORAGE_KEY = 'dsh-sidebar-collapse:panels-hidden'

const PANEL_LIST_SELECTOR = 'nav[class*="panelList"]'
const TOGGLE_ATTR = '[data-dsh-useful-tools-panels-toggle]'
const HIDE_PANELS_CSS = `${PANEL_LIST_SELECTOR}{display:none !important}`
const HIDDEN_ATTR = '[data-dsh-useful-tools-panels-hidden]'

/** Button metrics copied from the shell's own foot icon button. */
const TOGGLE_CSS = [
  `${TOGGLE_ATTR}{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,#6b6b6b);cursor:pointer;transition:background-color .12s ease,color .12s ease;}`,
  `${TOGGLE_ATTR}:hover{background-color:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#1f1f1f);}`,
  `${TOGGLE_ATTR}:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c6bf5));outline-offset:-2px;}`,
  `${TOGGLE_ATTR}[data-wide="false"]{width:36px;height:36px;border-radius:var(--dsw-radius-md,8px);}`,
  `${TOGGLE_ATTR}${HIDDEN_ATTR}{color:var(--dsw-alias-label-caption,#8a8a8a);}`,
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

/** Sidebar foot action that collapses the global panel list. */
export function SidebarCollapse({
  wide,
  t,
}: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'useful-tools'>): JSX.Element {
  const [hidden, setHidden] = useState<boolean>(readHidden)
  const label = hidden ? t('panels.show') : t('panels.hide')

  return (
    <Fragment>
      <style data-dsh-plugin="useful-tools">{TOGGLE_CSS}</style>
      {hidden ? <style data-dsh-plugin="useful-tools">{HIDE_PANELS_CSS}</style> : null}
      <button
        type="button"
        data-dsh-useful-tools-panels-toggle=""
        data-dsh-useful-tools-panels-hidden={hidden ? '' : undefined}
        data-wide={wide ? 'true' : 'false'}
        aria-label={label}
        aria-expanded={!hidden}
        title={label}
        onClick={() => {
          setHidden((previous) => {
            const next = !previous
            writeHidden(next)
            return next
          })
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path
            d={hidden ? 'M4 6.5 8 10.5l4-4' : 'M4 9.5 8 5.5l4 4'}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Fragment>
  )
}
