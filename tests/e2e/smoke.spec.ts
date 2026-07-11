import { expect, test } from '@playwright/test'

test('serves the web application and API from one origin', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Hear it. Shadow it. Hear yourself.',
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Web application and API are connected.'),
  ).toBeVisible()

  const healthResponse = await page.request.get('/api/health')

  expect(healthResponse.ok()).toBe(true)
  await expect(healthResponse.json()).resolves.toEqual({ status: 'ok' })
})

