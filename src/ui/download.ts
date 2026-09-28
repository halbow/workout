/** Saves `text` as a file through the browser's download. */
export function downloadText(file: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = file
  a.click()
  URL.revokeObjectURL(url)
}
