import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : undefined
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // Removed synchronous setState in effect since it causes lint errors, 
    // initialized lazy state instead if needed, or rely on matchMedia directly.
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
