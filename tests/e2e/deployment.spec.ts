import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const contentSecurityPolicy =
  "default-src 'self'; base-uri 'self'; connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; form-action 'self'; frame-ancestors 'none'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; script-src 'self' https://www.youtube.com; style-src 'self'"

async function readTree(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory()
        ? readTree(entryPath)
        : [await readFile(entryPath, 'utf8')]
    }),
  )

  return contents.flat()
}

test('serves the SPA shell for deep links and renders the application 404', async ({
  page,
}) => {
  const response = await page.goto('/not-part-of-this-recording')

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'That page is not part of this recording.',
    }),
  ).toBeVisible()
})

test('applies security and crawler headers to the app shell', async ({
  request,
}) => {
  const response = await request.get('/')

  expect(response.status()).toBe(200)
  expect(response.headers()).toMatchObject({
    'content-security-policy': contentSecurityPolicy,
    'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-robots-tag': 'noindex, nofollow',
  })

  const robotsResponse = await request.get('/robots.txt')
  expect(robotsResponse.status()).toBe(200)
  expect(await robotsResponse.text()).toBe('User-agent: *\nDisallow: /\n')
})

test('serves fingerprinted assets with immutable browser caching', async ({
  request,
}) => {
  const appShell = await request.get('/')
  const html = await appShell.text()
  const assetPath = html.match(/(?:href|src)="(\/assets\/[^"]+)"/u)?.[1]

  expect(assetPath).toBeDefined()
  const assetResponse = await request.get(assetPath ?? '')
  expect(assetResponse.status()).toBe(200)
  expect(assetResponse.headers()['cache-control']).toBe(
    'public, max-age=31536000, immutable',
  )
})

test('keeps application APIs, credentials, and selected fixtures out of the bundle', async () => {
  const bundle = (await readTree(path.resolve('apps/web/dist'))).join('\n')

  expect(bundle).not.toMatch(/(?:https?:\/\/[^"'`\s]+)?\/api(?:\/|\?|["'`])/iu)
  expect(bundle).not.toMatch(/AIza[0-9A-Za-z_-]{35}/u)
  expect(bundle).not.toContain('stage1_test')
})
