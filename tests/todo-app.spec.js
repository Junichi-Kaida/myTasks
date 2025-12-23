const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = `file://${path.resolve(__dirname, '../index.html')}`;

test.describe('TODO App Full Functional Test', () => {

    test.beforeEach(async ({ page }) => {
        // 毎回LocalStorageをクリアしてクリーンな状態でテスト
        await page.goto(fileUrl);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('Task Addition and Persistence', async ({ page }) => {
        const input = page.locator('#todo-input');
        await input.fill('Test Task 1');
        await page.click('#add-btn');

        const todoItem = page.locator('.todo-item');
        await expect(todoItem).toContainText('Test Task 1');

        // リロード後も残っているか
        await page.reload();
        await expect(page.locator('.todo-item')).toContainText('Test Task 1');
    });

    test('Priority and Date Setting', async ({ page }) => {
        await page.fill('#todo-input', 'Important Task');
        await page.selectOption('#todo-priority', 'high');

        // 今日の日付をセット
        const today = new Date().toISOString().slice(0, 16);
        await page.fill('#todo-date', today);

        await page.click('#add-btn');

        const todoItem = page.locator('.todo-item');
        await expect(todoItem).toContainText('Important Task');
        await expect(todoItem.locator('.priority-badge')).toContainText('High');
        await expect(todoItem.locator('.reminder-badge')).not.toBeEmpty();
    });

    test('Filtering by Status', async ({ page }) => {
        const input = page.locator('#todo-input');

        // 2つ追加
        await input.fill('Task 1');
        await page.click('#add-btn');
        await input.fill('Task 2');
        await page.click('#add-btn');

        // 1つ完了にする
        await page.click('.todo-item:has-text("Task 1") .checkbox-wrapper');
        await expect(page.locator('.todo-item.completed')).toHaveCount(1);

        // Filter "Active"
        await page.click('button[data-filter="active"]');
        await expect(page.locator('.todo-item')).toHaveCount(1);
        await expect(page.locator('.todo-item')).toContainText('Task 2');

        // Filter "Done"
        await page.click('button[data-filter="completed"]');
        await expect(page.locator('.todo-item')).toHaveCount(1);
        await expect(page.locator('.todo-item')).toContainText('Task 1');
    });

    test('Sorting by Priority', async ({ page }) => {
        const input = page.locator('#todo-input');

        // Low
        await input.fill('Low Task');
        await page.selectOption('#todo-priority', 'low');
        await page.click('#add-btn');

        // High
        await input.fill('High Task');
        await page.selectOption('#todo-priority', 'high');
        await page.click('#add-btn');

        // ソートボタンクリック
        await page.click('#sort-priority-btn');

        // 高い方が上の順（デフォルト降順）
        const firstTask = page.locator('.todo-item').first();
        await expect(firstTask).toContainText('High Task');

        // もう一度クリックで昇順
        await page.click('#sort-priority-btn');
        await expect(page.locator('.todo-item').first()).toContainText('Low Task');
    });

    test('Search functionality', async ({ page }) => {
        await page.fill('#todo-input', 'Finding Nemo');
        await page.click('#add-btn');
        await page.fill('#todo-input', 'Just some task');
        await page.click('#add-btn');

        await page.fill('#search-input', 'Nemo');
        await expect(page.locator('.todo-item')).toHaveCount(1);
        await expect(page.locator('.todo-item')).toContainText('Finding Nemo');
    });

    test('Theme Toggling', async ({ page }) => {
        const body = page.locator('html');
        await expect(body).toHaveAttribute('data-theme', 'light');

        await page.click('#theme-toggle');
        // アニメーションがあるため、少し待つか属性が変わるのを待つ
        // toggleThemeにsetTimeout等があるため、属性変化を待ちます
        await expect(body).toHaveAttribute('data-theme', 'dark', { timeout: 5000 });

        await page.reload();
        await expect(body).toHaveAttribute('data-theme', 'dark');
    });

    test('Focus Mode', async ({ page }) => {
        await page.fill('#todo-input', 'Focus Exercise');
        await page.click('#add-btn');

        // 集中ボタンクリック
        await page.click('.focus-btn');
        await expect(page.locator('body')).toHaveClass(/focus-active/);
        await expect(page.locator('#focus-overlay')).toHaveClass(/active/);

        // ESCキーで解除
        await page.keyboard.press('Escape');
        await expect(page.locator('body')).not.toHaveClass(/focus-active/);

        // 再度集中モードへ
        await page.click('.focus-btn');
        await expect(page.locator('body')).toHaveClass(/focus-active/);

        // Spaceキーで解除
        await page.keyboard.press(' ');
        await expect(page.locator('body')).not.toHaveClass(/focus-active/);
    });

    test('CSV Export and Import', async ({ page }) => {
        // データ入力
        await page.fill('#todo-input', 'Task to Export');
        await page.click('#add-btn');

        // Export (ダウンロードのトリガー確認)
        const downloadPromise = page.waitForEvent('download');
        await page.click('#export-csv-btn');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/higanjima_tasks_.*\.csv/);

        // Clear and Import
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await expect(page.locator('.todo-item')).toHaveCount(0);

        // 実際の実装ではCSVをパースする必要があるが、ここではインポートボタンの動作を確認
        // ファイル入力にモック。ダウンロードしたファイルをそのまま食わせる
        const path = await download.path();
        await page.setInputFiles('#csv-file-input', path);
        // 自動で発火するはず
        await expect(page.locator('.todo-item')).toContainText('Task to Export');
    });

    test('Clear Completed', async ({ page }) => {
        await page.fill('#todo-input', 'Done task');
        await page.click('#add-btn');

        // 完了にする
        await page.click('.checkbox-wrapper');

        // ダイアログが出現するため、ハンドリング
        page.once('dialog', dialog => dialog.accept());
        await page.click('#clear-completed-btn');

        await expect(page.locator('.todo-item')).toHaveCount(0);
    });

});
