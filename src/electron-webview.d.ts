/// <reference types="react" />
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string
        partition?: string
        ref?: React.RefObject<HTMLElement & { reload?: () => void }>
      },
      HTMLElement
    >
  }
}
