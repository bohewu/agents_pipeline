export async function openBrowser(url: string): Promise<void> {
  const { default: open } = await import('open');
  await open(url);
}
