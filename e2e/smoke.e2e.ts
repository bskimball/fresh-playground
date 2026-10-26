import { type BrowserContext, expect, type Page, test } from "@playwright/test"

// One browser session across steps: the first account becomes admin, and the
// service worker installed by earlier visits serves the offline step.
test.describe.configure({ mode: "serial" })

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
})

test.afterAll(async () => {
  await context.close()
})

const hydrated = (name: string) =>
  expect(page.locator(`[data-island="${name}"]`)).not.toHaveAttribute("aria-busy", "true")

const mainNav = () => page.getByRole("navigation", { name: "Main" })

test("the first account signs up and becomes admin", async () => {
  await page.goto("/login")
  await hydrated("login")
  await page.getByRole("group", { name: "Account mode" }).getByText("Create account").click()
  await page.getByLabel("Name").fill("Owner")
  await page.getByLabel("Email").fill("owner@example.com")
  await page.getByLabel("Password").fill("correct-horse-battery")
  await page.getByRole("button", { name: "Create account" }).last().click()
  await expect(page).toHaveURL(/\/$/)
  await expect(mainNav().getByRole("link", { name: "Admin" })).toBeVisible()
  await expect(mainNav().getByRole("link", { name: "Files" })).toBeVisible()
})

test("a Kanban task saves and survives a reload", async () => {
  const title = `Water the ferns ${Date.now()}`
  await page.goto("/kanban")
  await hydrated("kanban")
  await page.getByLabel("New task").fill(title)
  const saved = page.waitForResponse(
    (response) => response.url().endsWith("/api/kanban") && response.request().method() === "PUT",
  )
  await page.getByRole("button", { name: "Add task" }).click()
  expect((await saved).ok()).toBe(true)
  await page.reload()
  await expect(page.getByText(title)).toBeVisible()
})

test("a file uploads, downloads privately, and deletes", async ({ playwright }) => {
  await page.goto("/files")
  await hydrated("files")
  await page.locator('input[type="file"]').setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from e2e\n"),
  })
  const link = page.getByRole("link", { name: "hello.txt" })
  await expect(link).toBeVisible()

  const url = new URL((await link.getAttribute("href"))!, page.url()).href
  const download = await page.request.get(url)
  expect(download.status()).toBe(200)
  expect(download.headers()["content-disposition"]).toContain("attachment")
  expect(await download.text()).toBe("hello from e2e\n")
  const anonymous = await playwright.request.newContext()
  try {
    expect((await anonymous.get(url)).status()).toBe(401)
  } finally {
    await anonymous.dispose()
  }

  page.once("dialog", (dialog) => void dialog.accept())
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByText("No files yet.")).toBeVisible()
})

test("public pages render offline from the service worker", async () => {
  await page.goto("/kanban")
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await context.setOffline(true)
  try {
    await page.goto("/kanban")
    await expect(page.getByLabel("New task")).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
