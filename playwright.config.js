const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:8080',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // ローカルサーバーをテスト前に起動する必要がある場合（今回は静的ファイルなので、単純にファイルを開くか、サーバーを立てる）
    // ここではシンプルに live-server 等の代わりに http-server を想定するか、テストコード内で file:// を使う構成にする
    // 今回は package.json にサーバー起動を入れず、テストで直接 index.html を開く構成で試みます
});
