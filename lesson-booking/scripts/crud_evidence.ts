import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const evidenceDir = '/Users/kazuhirohomma/src/github.com/kazuph/moonbit-lunaui-blog-sample/.artifacts/moonbit-98/crud-evidence';
const AUTH_USER = 'admin';
const AUTH_PASS = 'admin123';
const BASE_URL = 'http://localhost:8787';

async function main() {
  // Ensure directory exists
  fs.mkdirSync(evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set Basic Auth header for all requests
  const credentials = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');
  await page.setExtraHTTPHeaders({
    'Authorization': `Basic ${credentials}`,
  });

  console.log('=== CRUD Evidence Collection ===\n');

  try {
    // 1. Homepage - Initial state
    console.log('1. Homepage (initial state)...');
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '01_homepage_initial.png'), fullPage: true });
    console.log('   Screenshot: 01_homepage_initial.png');

    // 2. Navigate to admin page via UI link
    console.log('\n2. Admin page...');
    await page.click('a:has-text("管理")');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '02_admin_list.png'), fullPage: true });
    console.log('   Screenshot: 02_admin_list.png');

    // 3. Navigate to new post form via UI link
    console.log('\n3. New post form...');
    await page.click('a:has-text("新規作成")');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('form', { timeout: 15000 });
    await page.screenshot({ path: path.join(evidenceDir, '03_new_form.png'), fullPage: true });
    console.log('   Screenshot: 03_new_form.png');

    // 4. Fill in the form
    console.log('\n4. Filling form...');
    await page.fill('input[name="title"]', 'MoonBit CRUD Test Article');
    await page.fill('input[name="slug"]', 'moonbit-crud-test-final');
    await page.fill('textarea[name="content"]', '# Test Article\n\nThis is a test article to verify CRUD operations.\n\n- Item 1\n- Item 2\n- Item 3');
    await page.selectOption('select[name="status"]', 'published');
    await page.screenshot({ path: path.join(evidenceDir, '04_form_filled.png'), fullPage: true });
    console.log('   Screenshot: 04_form_filled.png');

    // 5. Submit form (Create)
    console.log('\n5. Creating post...');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(evidenceDir, '05_after_create.png'), fullPage: true });
    console.log('   Screenshot: 05_after_create.png');

    // 6. Go to homepage to verify post appears
    console.log('\n6. Verify post on homepage...');
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '06_homepage_with_post.png'), fullPage: true });
    console.log('   Screenshot: 06_homepage_with_post.png');

    // 7. View post detail
    console.log('\n7. View post detail...');
    await page.click('a:has-text("MoonBit CRUD Test Article")');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '07_post_detail.png'), fullPage: true });
    console.log('   Screenshot: 07_post_detail.png');

    // 8. Go to admin to edit
    console.log('\n8. Admin page...');
    await page.click('a:has-text("管理")');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '08_admin_with_post.png'), fullPage: true });
    console.log('   Screenshot: 08_admin_with_post.png');

    // 9. Click edit link for our test post
    console.log('\n9. Edit form...');
    // Find the row with our article and click its edit link
    const testPostRow = page.locator('tr:has-text("MoonBit CRUD Test Article")').first();
    const editLink = testPostRow.locator('a:has-text("編集")');
    await editLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('form', { timeout: 15000 });
    await page.screenshot({ path: path.join(evidenceDir, '09_edit_form.png'), fullPage: true });
    console.log('   Screenshot: 09_edit_form.png');

    // 10. Update title
    console.log('\n10. Updating post...');
    await page.fill('input[name="title"]', 'MoonBit CRUD Test Article (Updated)');
    await page.screenshot({ path: path.join(evidenceDir, '10_form_updated.png'), fullPage: true });
    console.log('   Screenshot: 10_form_updated.png');

    // 11. Submit update
    console.log('\n11. Submitting update...');
    await page.click('button:has-text("更新する")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(evidenceDir, '11_after_update.png'), fullPage: true });
    console.log('   Screenshot: 11_after_update.png');

    // 12. Verify update on homepage
    console.log('\n12. Verify update on homepage...');
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '12_homepage_updated.png'), fullPage: true });
    console.log('   Screenshot: 12_homepage_updated.png');

    // 13. Go back to admin and edit again to delete
    console.log('\n13. Navigate to edit for delete...');
    await page.click('a:has-text("管理")');
    await page.waitForLoadState('networkidle');
    const updatedPostRow = page.locator('tr:has-text("MoonBit CRUD Test Article (Updated)")').first();
    const editLinkForDelete = updatedPostRow.locator('a:has-text("編集")');
    await editLinkForDelete.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('button:has-text("記事を削除")', { timeout: 15000 });
    await page.screenshot({ path: path.join(evidenceDir, '13_before_delete.png'), fullPage: true });
    console.log('   Screenshot: 13_before_delete.png');

    // 14. Delete post (button is on edit form)
    console.log('\n14. Deleting post...');
    // Handle dialog
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("記事を削除")');
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '14_after_delete.png'), fullPage: true });
    console.log('   Screenshot: 14_after_delete.png');

    // 15. Verify deletion on homepage
    console.log('\n15. Verify deletion on homepage...');
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(evidenceDir, '15_homepage_final.png'), fullPage: true });
    console.log('   Screenshot: 15_homepage_final.png');

    console.log('\n=== Evidence Collection Complete ===');
    console.log(`Screenshots saved to: ${evidenceDir}/`);
    console.log('Total screenshots: 15');

  } catch (error) {
    console.error('Error during evidence collection:', error);
    await page.screenshot({ path: path.join(evidenceDir, 'error_state.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}

main();
