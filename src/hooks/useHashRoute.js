// ════════════════════════════════════════════════════════════════════
// useHashRoute — tiny hash-based router (no react-router dependency).
//
// Reads the part after `#` (without the leading #), lowercased.
// Examples:
//   http://host/        → ''       (main chat)
//   http://host/#/releases → 'releases'
//   http://host/aiui/#/releases → 'releases'
//
// Returns { route, navigate }. `navigate('releases')` sets location.hash
// to `#/releases`; navigate('') returns to the main view.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'

function readRoute() {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h
}

export function useHashRoute() {
  const [route, setRoute] = useState(readRoute())

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to = '') => {
    const target = to ? `#/${to}` : '#'
    if (window.location.hash !== target) window.location.hash = target
    else setRoute(readRoute())  // force update even if hash unchanged
  }, [])

  return { route, navigate }
}
