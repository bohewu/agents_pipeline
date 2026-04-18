/**
 * Shorten a filesystem path for display.
 * Replaces home directory with ~ and truncates long paths.
 */
export function shortenPath(fullPath: string, maxLen = 40): string {
  let display = fullPath;
  const home: string = typeof window !== 'undefined' ? '' : '';
  if (home && display.startsWith(home)) {
    display = '~' + display.slice(home.length);
  }
  if (display.length > maxLen) {
    const parts = display.split('/');
    if (parts.length > 3) {
      display = parts[0] + '/…/' + parts.slice(-2).join('/');
    }
  }
  return display;
}
