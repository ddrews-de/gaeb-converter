import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';

const TEST_DATA_DIR = join(__dirname, '..', 'TestData');

test.describe('GAEB Converter — upload → convert → download', () => {
  test('homepage loads with the upload drop zone', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'GAEB Converter' }),
    ).toBeVisible();
    await expect(page.getByText(/Drag and drop your GAEB files/)).toBeVisible();
  });

  test('upload of LV_Los01.X83 produces an XML download', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(join(TEST_DATA_DIR, 'LV_Los01.X83'));

    // Wait for the file card to appear with the target filename.
    await expect(page.getByText('LV_Los01.X83')).toBeVisible();
    await expect(page.getByText('Zieldatei:')).toBeVisible();

    // Trigger the XML download and assert the target filename.
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Als GAEB DA XML 3.3 herunterladen' })
      .first()
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('LV_Los01.X83');

    // Spot-check that the downloaded payload is a well-formed GAEB 3.3 XML.
    const path = await download.path();
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toMatch(/^<\?xml/);
    expect(content).toContain(
      '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">',
    );
  });

  test('audit log download emits a .audit.txt with summary sections', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(join(TEST_DATA_DIR, 'LV_Los01.X83'));
    await expect(page.getByText('Zieldatei:')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Protokoll (.txt)' })
      .first()
      .click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('LV_Los01.audit.txt');
    const content = await fs.readFile(await download.path(), 'utf-8');
    expect(content).toContain('GAEB Converter — Conversion Report');
    expect(content).toContain('Target format:    GAEB DA XML 3.3 (DA 83)');
    expect(content).toContain('Bill of quantities');
  });

  test('position-list export button offers an xlsx/csv download', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(join(TEST_DATA_DIR, 'LV_Los01.X83'));

    await expect(
      page.getByText('Positionsliste (mit Preisanteilen)'),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Positionsliste exportieren' })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/GAEB_Positionsliste_.*\.xlsx$/);
  });
});
