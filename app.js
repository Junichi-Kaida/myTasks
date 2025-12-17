/**
 * TODOアプリのメインロジック
 * 
 * 機能概要:
 * 1. タスク管理: 追加、削除、完了、編集、ドラッグ＆ドロップ並び替え
 * 2. データ永続化: localStorageを使用
 * 3. リマインダー: 指定日時に通知（トースト、音、OS通知）
 * 4. UI: グラスモーフィズムデザイン、アニメーション
 * 5. 優先度: High/Medium/Lowのタグ管理とソート
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // DOM要素の取得
    // -------------------------------------------------------------------------
    const todoInput = document.getElementById('todo-input');
    const todoPriority = document.getElementById('todo-priority');
    const todoRepeat = document.getElementById('todo-repeat');
    const todoDate = document.getElementById('todo-date');
    const addBtn = document.getElementById('add-btn');
    const todoList = document.getElementById('todo-list');
    const emptyState = document.getElementById('empty-state');
    const activeCount = document.getElementById('active-count');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');
    const sortPriorityBtn = document.getElementById('sort-priority-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const dateDisplay = document.getElementById('date-display');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const importCsvBtn = document.getElementById('import-csv-btn');
    const csvFileInput = document.getElementById('csv-file-input');
    // フィルタ・検索用要素
    const searchInput = document.getElementById('search-input');
    const filterStatusBtns = document.querySelectorAll('#filter-status .filter-btn');
    const filterPriorityBtns = document.querySelectorAll('#filter-priority .filter-btn');

    // -------------------------------------------------------------------------
    // 状態管理 (State)
    // -------------------------------------------------------------------------
    let todos = JSON.parse(localStorage.getItem('todos')) || [];
    let isEditing = false;

    // フィルタリング状態
    let currentSearch = '';
    let currentStatusFilter = 'all'; // all, active, completed
    let currentPriorityFilter = 'all'; // all, high, medium, low

    // ソート状態
    let currentSort = { type: 'none', order: 'asc' }; // type: 'none' | 'priority' | 'date', order: 'asc' | 'desc'

    // 集中モード状態
    let focusedTodoId = null; // null または task ID
    let focusStartTime = null; // 集中開始時刻
    let focusTimerInterval = null; // タイマー用Interval ID

    // トーストコンテナの生成（なければ作成）
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // -------------------------------------------------------------------------
    // 初期化処理
    // -------------------------------------------------------------------------
    init();

    /**
     * アプリケーションの初期化処理
     * - テーマの復元
     * - 日付の表示
     * - 保存されたタスクの読み込みと描画
     * - イベントリスナーの設定
     * - 通知権限の確認
     * - リマインダー監視の開始
     */
    function init() {
        initTheme(); // テーマ初期化
        renderDate();
        renderTodos();
        setupEventListeners();
        requestNotificationPermission();
        startReminderCheck();

        // 初期フォーカスを入力欄に設定してUXを向上
        if (todoInput) todoInput.focus();
    }

    /**
     * テーマの初期化と設定
     */
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        // テーマ変更時のエフェクト処理
        const overlayId = newTheme === 'dark' ? 'miyabi-overlay' : 'akira-overlay';
        const overlay = document.getElementById(overlayId);

        if (overlay) {
            // 1. オーバーレイ表示
            overlay.classList.remove('hidden');
            // 少しだけ待機してフェードインさせる
            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });

            // 2. 画像が表示された状態でテーマ変更 (タイミング待ち: 1000ms)
            setTimeout(() => {
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                updateThemeIcon(newTheme);
            }, 1000);

            // 3. フェードアウト (タイミング: 2500ms後)
            setTimeout(() => {
                overlay.classList.remove('show');
                // CSS transition (0.5s) が終わったら隠す
                setTimeout(() => {
                    overlay.classList.add('hidden');
                }, 500);
            }, 2500);

            return;
        }

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        updateThemeIcon(newTheme);
    }

    function updateThemeIcon(theme) {
        if (themeToggleBtn) {
            themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }


    /**
     * 通知権限をリクエスト
     */
    function requestNotificationPermission() {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            try {
                Notification.requestPermission();
            } catch (e) {
                console.warn("Notification permission request failed", e);
            }
        }
    }

    /**
     * リマインダーの定期チェック (5秒間隔)
     */
    function startReminderCheck() {
        setInterval(() => {
            const now = new Date();
            let stateChanged = false;

            todos.forEach(todo => {
                if (todo.reminder && !todo.completed && !todo.notified) {
                    if (new Date(todo.reminder) <= now) {
                        console.log("Notification triggered for:", todo.text);
                        showNotification(todo.text);
                        todo.notified = true;
                        stateChanged = true;
                    }
                }
            });

            if (stateChanged) {
                saveTodos();
            }
        }, 5000);
    }

    /**
     * 通知を表示する総合関数（トースト + 音 + OS通知）
     */
    /**
     * 通知を表示する総合関数
     * ユーザー体験を高めるため、3つの手段を併用します。
     * 1. アプリ内トースト: 視覚的な即時フィードバック
     * 2. 通知音: 聴覚へのアプローチ（作業中でも気づけるように）
     * 3. OS通知: ブラウザがバックグラウンドにある場合用
     * 
     * @param {string} text - 通知するメッセージ内容
     */
    function showNotification(text) {
        // 1. アプリ内トースト通知
        showToast(text);

        // 2. 通知音再生
        playNotificationSound();

        // 3. OS通知（可能な場合）
        if ("Notification" in window && Notification.permission === "granted") {
            try {
                const notification = new Notification("タスクの時間です！", {
                    body: text,
                    icon: "favicon.png" // カスタムアイコンを使用
                });
                // 通知クリックでウィンドウをアクティブにする
                notification.onclick = function () {
                    window.focus();
                    notification.close();
                };
            } catch (e) {
                console.error("OS Notification failed:", e);
            }
        }
    }

    /**
     * アプリ内トースト通知の表示
     */
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <div class="toast-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div class="toast-content">
                <div class="toast-title">Reminder</div>
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="toast-close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });

        toastContainer.appendChild(toast);

        // アニメーション用に少し待機
        setTimeout(() => toast.classList.add('show'), 10);

        // 5秒後に自動消去
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    /**
     * 音声を再生する (AudioContext)
     * 明るい「ピコン♪」というチャイム音
     */
    function playNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const now = ctx.currentTime;

            // 音を鳴らす内部関数
            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();

                osc.type = 'sine'; // 柔らかいサイン波
                osc.frequency.setValueAtTime(freq, startTime);

                // 音量エンベロープ
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.05); // アタック
                gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // リリース

                osc.connect(gainNode);
                gainNode.connect(ctx.destination);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            // 1音目: 880Hz (A5)
            playTone(880, now, 0.3);
            // 2音目: 1318.5Hz (E6) - 少し遅らせて高音を鳴らす
            playTone(1318.51, now + 0.1, 0.6);

        } catch (e) {
            console.error("Audio playback failed:", e);
        }
    }

    // -------------------------------------------------------------------------
    // イベント設定・TODO操作ロジック
    // -------------------------------------------------------------------------

    function setupEventListeners() {
        // 集中モードオーバーレイのクリックイベント
        // 背景クリックでの解除は無効化（ユーザー要望）
        /* 
        const focusOverlay = document.getElementById('focus-overlay');
        if (focusOverlay) {
            focusOverlay.addEventListener('click', (e) => {
                if (e.target === focusOverlay || e.target.classList.contains('focus-exit-hint')) {
                    exitFocusMode();
                }
            });
        }
        */

        // ESCキーで集中モード解除
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && focusedTodoId !== null) {
                exitFocusMode();
            }
        });

        addBtn.addEventListener('click', () => checkPermissionAndAdd());

        todoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') checkPermissionAndAdd();
        });

        if (todoDate) {
            todoDate.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') checkPermissionAndAdd();
            });
        }

        clearCompletedBtn.addEventListener('click', clearCompleted);
        if (sortPriorityBtn) {
            sortPriorityBtn.addEventListener('click', () => handleSort('priority'));
        }

        const sortDateBtn = document.getElementById('sort-date-btn');
        if (sortDateBtn) {
            sortDateBtn.addEventListener('click', () => handleSort('date'));
        }

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', toggleTheme);
        }

        // CSV Export/Import
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', exportTodos);
        }
        if (importCsvBtn && csvFileInput) {
            importCsvBtn.addEventListener('click', () => csvFileInput.click());
            csvFileInput.addEventListener('change', importTodos);
        }

        // フィルタリング & 検索イベント
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearch = e.target.value.toLowerCase();
                renderTodos();
            });
        }

        filterStatusBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // UI更新
                filterStatusBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // 状態更新
                currentStatusFilter = btn.dataset.filter;
                renderTodos();
            });
        });

        filterPriorityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // UI更新
                filterPriorityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // 状態更新
                currentPriorityFilter = btn.dataset.filter;
                renderTodos();
            });
        });



        // クイック日付選択ボタン
        document.querySelectorAll('.quick-date-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.date;
                const now = new Date();
                let targetDate = new Date();

                // デフォルト時間（例: 09:00）あるいは現在の時間
                // ここでは利便性のため「翌日」などは朝9時にセットする
                // 「今日」の場合は、現在時刻の1時間後、あるいは単純にセット

                if (type === 'today') {
                    // 今日: 現在時刻の1時間後 (日付が変わる場合は23:59まで)
                    targetDate.setHours(now.getHours() + 1);
                    targetDate.setMinutes(0);
                    // もし明日になってしまったら明日の9時にする？単純に繰り越しでOKか
                } else if (type === 'tomorrow') {
                    // 明日: 明日の朝9時
                    targetDate.setDate(now.getDate() + 1);
                    targetDate.setHours(9, 0, 0, 0);
                } else if (type === 'next-week') {
                    // 来週: 次の月曜日 朝9時
                    // ただし、もし明日が月曜日の場合（日曜日に操作）、明日は「来週」感がないため、さらに翌週にする
                    const day = now.getDay();
                    let diff = day === 0 ? 1 : 8 - day; // 次の月曜までの日数

                    // もし明日が月曜なら、さらに7日足す
                    if (diff <= 1) {
                        diff += 7;
                    }

                    targetDate.setDate(now.getDate() + diff);
                    targetDate.setHours(9, 0, 0, 0);
                } else if (type === 'none') {
                    if (todoDate) {
                        todoDate.value = '';
                    }
                    return; // 処理終了
                }

                // datetime-local形式 (YYYY-MM-DDTHH:mm) に変換
                // 日本時間でのオフセットを考慮
                const offset = targetDate.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(targetDate - offset)).toISOString().slice(0, 16);

                if (todoDate) {
                    todoDate.value = localISOTime;
                    // アニメーションなどでフィードバックがあると良い
                    todoDate.style.backgroundColor = 'var(--primary-hover)';
                    setTimeout(() => {
                        todoDate.style.backgroundColor = '';
                    }, 300);
                }
            });
        });

        // クイック優先度ボタン
        document.querySelectorAll('.quick-priority-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const priority = e.target.dataset.priority;
                if (todoPriority) {
                    todoPriority.value = priority;

                    // フィードバックアニメーション
                    todoPriority.style.backgroundColor = 'var(--primary-hover)';
                    todoPriority.style.color = 'white';
                    setTimeout(() => {
                        todoPriority.style.backgroundColor = '';
                        todoPriority.style.color = '';
                    }, 300);
                }
            });
        });

        // クイック繰り返しボタン
        document.querySelectorAll('.quick-repeat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const repeat = e.target.dataset.repeat;
                if (todoRepeat) {
                    todoRepeat.value = repeat;

                    // フィードバックアニメーション
                    todoRepeat.style.backgroundColor = 'var(--primary-hover)';
                    todoRepeat.style.color = 'white';
                    setTimeout(() => {
                        todoRepeat.style.backgroundColor = '';
                        todoRepeat.style.color = '';
                    }, 300);
                }
            });
        });


        // リセットボタン
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                todoInput.value = '';
                if (todoPriority) {
                    todoPriority.value = 'none';
                    todoPriority.dispatchEvent(new Event('change'));
                }
                if (todoDate) todoDate.value = '';
                if (todoRepeat) todoRepeat.value = 'none';

                todoInput.focus();

                // フィードバック
                resetBtn.style.transform = 'rotate(360deg)';
                setTimeout(() => resetBtn.style.transform = '', 300);
            });
        }
    }



    /**
     * 通知権限を確認し、必要であればリクエストしてからタスクを追加する
     * ユーザーが初めてリマインダーを使う際のUXフローを処理します。
     */
    function checkPermissionAndAdd() {
        // file:プロトコル（ローカルファイル）の場合はOS通知が使えないためチェックをスキップ
        const isLocalFile = window.location.protocol === 'file:';

        // 通知APIがあり、日時が設定されていて、かつローカルファイルでない場合のみチェック
        if (!isLocalFile && "Notification" in window && todoDate && todoDate.value) {
            // ケース1: ユーザーが以前に通知をブロックした場合
            if (Notification.permission === "denied") {
                alert("Windows通知を表示するには、ブラウザの設定でこのページの通知を「許可」する必要があります。\\n\\nアドレスバーの左側にある鍵アイコンや設定アイコンから変更できる場合があります。");
            }
            // ケース2: まだ通知の許可/拒否を選んでいない場合
            else if (Notification.permission === "default") {
                Notification.requestPermission().then(permission => {
                    if (permission === "granted") {
                        // 許可されたら即座にテスト通知を出して安心させる
                        new Notification("通知設定が完了しました", {
                            body: "時間になるとこのようにWindows通知が表示されます。",
                            icon: "favicon.png"
                        });
                    }
                });
            }
        }
        addTodo();
    }

    function renderDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = new Date().toLocaleDateString('ja-JP', options);
    }

    function saveTodos() {
        localStorage.setItem('todos', JSON.stringify(todos));
        renderTodos();
    }

    /**
     * 新しいタスクを追加する
     * 入力値を取得し、ToDoオブジェクトを作成して配列に追加します。
     */
    function addTodo() {
        const text = todoInput.value.trim();
        const priority = todoPriority ? todoPriority.value : 'none';
        const repeat = todoRepeat ? todoRepeat.value : 'none';
        const date = todoDate ? todoDate.value : null;

        if (!text) return;

        const newTodo = {
            id: Date.now(), // 一意のIDとしてタイムスタンプを使用
            text,
            priority,
            repeat,
            completed: false,
            reminder: date || null,
            notified: false
        };

        try {
            todos.push(newTodo);

            // 現在のソート順を適用
            if (currentSort.type === 'priority') {
                sortTodosByPriority();
            } else if (currentSort.type === 'date') {
                sortTodosByDate();
            } else {
                saveTodos(); // 保存して再描画
            }

            // フォームのリセット
            todoInput.value = '';
            if (todoPriority) todoPriority.value = 'none';
            if (todoRepeat) todoRepeat.value = 'none';
            if (todoDate) todoDate.value = '';
            if (todoDate) todoDate.value = '';
            todoInput.focus();
        } catch (e) {
            console.error("Error adding todo:", e);
            alert("タスクの追加に失敗しました。");
        }
    }

    function toggleTodo(id) {
        // 完了状態を切り替える前に、対象のタスクを取得
        const targetTodo = todos.find(t => t.id === id);

        // もし未完了から完了へ切り替わる場合、かつ繰り返し設定がある場合
        // 次のタスクを作成する
        if (targetTodo && !targetTodo.completed && targetTodo.repeat && targetTodo.repeat !== 'none') {
            createNextRecurringTask(targetTodo);
            // 元のタスクは「繰り返しなし」にして完了状態にする（これ以上の増殖を防ぐため）
            // ただし、要望によっては「親タスク」として扱いたい場合もあるが、
            // シンプルに「完了済み履歴」として残し、新しいタスクを「次の予定」とするのが一般的。
            // ここでは元のタスクのrepeat属性を残しておくと、誤って未完了に戻したときに挙動が複雑になるため
            // 一旦そのままでも良いが、ロジックをシンプルにするため、新しいタスクを生成する。
        }

        todos = todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
        );
        saveTodos();

        // 集中モード中にそのタスクを完了（クローズ）した場合、集中モードを終了
        if (focusedTodoId === id) {
            const todo = todos.find(t => t.id === id);
            if (todo && todo.completed) {
                // 少し余韻を残してから解除するか、即時解除か。要望は「切ってほしい」なので即時でOKだが
                // アニメーションのために少し待つのも良い。今回はUX的に即時反応させる。
                setTimeout(() => exitFocusMode(), 300); // チェックボックスのアニメーションを待つ
            }
        }
    }

    /**
     * 繰り返しタスクの次回分を作成する
     */
    function createNextRecurringTask(originalTodo) {
        // 次の日付を計算
        let nextDate = null;
        if (originalTodo.reminder) {
            const current = new Date(originalTodo.reminder);
            // 壊れた日付データでないか確認
            if (!isNaN(current.getTime())) {
                if (originalTodo.repeat === 'daily') {
                    current.setDate(current.getDate() + 1);
                } else if (originalTodo.repeat === 'weekly') {
                    current.setDate(current.getDate() + 7);
                } else if (originalTodo.repeat === 'monthly') {
                    current.setMonth(current.getMonth() + 1);
                } else if (originalTodo.repeat === 'yearly') {
                    current.setFullYear(current.getFullYear() + 1);
                }

                // ISO文字列のフォーマットを維持 (YYYY-MM-DDTHH:mm)
                // タイムゾーンオフセットを考慮
                const offset = current.getTimezoneOffset() * 60000;
                nextDate = (new Date(current - offset)).toISOString().slice(0, 16);
            }
        } else {
            // 日付指定がないのに「繰り返し」設定がある場合
            // 現在時刻を基準にするか、単にタスクを複製するか。
            // ここでは「作成時の翌日/翌週」などを設定してあげるのが親切。
            const current = new Date();
            if (originalTodo.repeat === 'daily') {
                current.setDate(current.getDate() + 1);
            } else if (originalTodo.repeat === 'weekly') {
                current.setDate(current.getDate() + 7);
            } else if (originalTodo.repeat === 'monthly') {
                current.setMonth(current.getMonth() + 1);
            } else if (originalTodo.repeat === 'yearly') {
                current.setFullYear(current.getFullYear() + 1);
            }
            const offset = current.getTimezoneOffset() * 60000;
            nextDate = (new Date(current - offset)).toISOString().slice(0, 16);
        }

        const newTodo = {
            ...originalTodo,
            id: Date.now(), // 新しいID
            reminder: nextDate,
            completed: false, // 未完了
            notified: false // 通知状態リセット
        };

        // 配列に追加
        todos.push(newTodo);

        // 完了通知（トーストなどで）出したほうが親切かもしれないが、saveTodos()で再描画されるのでリストに出現する
    }

    function deleteTodo(id) {
        if (!confirm('タスクを削除します。よろしいですか？')) return;

        const itemElement = document.querySelector(`li[data-id="${id}"]`);

        if (itemElement) {
            itemElement.style.animation = 'fadeOut 0.3s ease forwards';
            itemElement.addEventListener('animationend', () => {
                todos = todos.filter(todo => todo.id !== id);
                saveTodos();
            });
        } else {
            todos = todos.filter(todo => todo.id !== id);
            saveTodos();
        }
    }

    function clearCompleted() {
        const completedCount = todos.filter(todo => todo.completed).length;
        if (completedCount === 0) return;

        if (confirm(`完了済みのタスク ${completedCount} 件を削除しますか？`)) {
            todos = todos.filter(todo => !todo.completed);
            saveTodos();
        }
    }

    function updateTodoReminder(id, newDate) {
        todos = todos.map(todo => {
            if (todo.id === id) {
                const isChanged = todo.reminder !== newDate;
                return {
                    ...todo,
                    reminder: newDate || null,
                    notified: isChanged ? false : todo.notified
                };
            }
            return todo;
        });
        saveTodos();
    }

    function updateTodoPriority(id) {
        // ... (unused if replaced by select, but keeping for safety or removing if confirmed unused)
    }

    /**
     * タスクを優先度順にソートする
     * High(3) > Medium(2) > Low(1) > None(0) の順で並び替えます。
     * 同じ優先度内では、リストへの追加順（ID順）を維持します。
     * 完了済みタスクは常にリストの末尾に配置されるため、ここでは主に未完了タスクの順序に影響します。
     */
    /**
     * ソート処理のハンドラー
     */
    function handleSort(type) {
        // 同じタイプなら順序を反転、違うタイプなら降順からスタート
        if (currentSort.type === type) {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.type = type;
            currentSort.order = 'desc'; // デフォルトは降順（高い/新しい順）
        }

        if (type === 'priority') {
            sortTodosByPriority();
        } else if (type === 'date') {
            sortTodosByDate();
        }

        updateSortButtons();
    }

    function sortTodosByPriority() {
        const priorityScore = { 'high': 3, 'medium': 2, 'low': 1, 'none': 0 };
        const order = currentSort.order === 'asc' ? 1 : -1;

        todos.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (!a.completed) {
                const scoreA = priorityScore[a.priority || 'none'] || 0;
                const scoreB = priorityScore[b.priority || 'none'] || 0;
                if (scoreA !== scoreB) {
                    return (scoreA - scoreB) * order; // 昇順なら低い順、降順なら高い順
                }
                return a.id - b.id;
            }
            return 0;
        });

        saveTodos();
    }

    function sortTodosByDate() {
        const order = currentSort.order === 'asc' ? 1 : -1;

        todos.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (!a.completed) {
                // 日付がないものは最後にする（または最初にする）
                // ここでは日付ありを優先し、日付なし同士はID順
                const dateA = a.reminder ? new Date(a.reminder).getTime() : (order === 1 ? Infinity : -Infinity);
                const dateB = b.reminder ? new Date(b.reminder).getTime() : (order === 1 ? Infinity : -Infinity);

                if (dateA !== dateB) {
                    return (dateA - dateB) * order;
                }
                return a.id - b.id;
            }
            return 0;
        });

        saveTodos();
    }

    function updateSortButtons() {
        if (sortPriorityBtn) {
            let label = '優先度順';
            if (currentSort.type === 'priority') {
                label += currentSort.order === 'asc' ? ' ↑' : ' ↓';
                sortPriorityBtn.style.color = 'var(--primary)';
                sortPriorityBtn.style.fontWeight = '700';
            } else {
                sortPriorityBtn.style.color = '';
                sortPriorityBtn.style.fontWeight = '';
            }
            sortPriorityBtn.textContent = label;
        }

        const sortDateBtn = document.getElementById('sort-date-btn');
        if (sortDateBtn) {
            let label = '日付順';
            if (currentSort.type === 'date') {
                label += currentSort.order === 'asc' ? ' ↑' : ' ↓';
                sortDateBtn.style.color = 'var(--primary)';
                sortDateBtn.style.fontWeight = '700';
            } else {
                sortDateBtn.style.color = '';
                sortDateBtn.style.fontWeight = '';
            }
            sortDateBtn.textContent = label;
        }
    }

    function updateTodoText(id, newText) {
        todos = todos.map(todo =>
            todo.id === id ? { ...todo, text: newText } : todo
        );
        saveTodos();
    }

    function enableTaskEdit(id, element) {
        if (isEditing) return;
        isEditing = true;

        const currentText = element.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-text-input';
        input.value = currentText;

        element.replaceWith(input);
        input.focus();

        const finishEdit = () => {
            const newVal = input.value.trim();
            if (newVal && newVal !== currentText) {
                updateTodoText(id, newVal);
            } else {
                // キャンセルまたは変更なしの場合は元に戻す(再描画)
                renderTodos();
            }
            isEditing = false;
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                input.blur();
            } else if (ev.key === 'Escape') {
                input.value = currentText; // 元に戻す
                input.blur();
            }
        });

        input.addEventListener('click', (ev) => ev.stopPropagation());
    }

    function enablePriorityEdit(id, element) {
        if (isEditing) return;
        isEditing = true;

        const currentPriority = element.className.match(/priority-(\w+)/)[1] || 'none';

        const select = document.createElement('select');
        select.className = 'edit-priority-select';

        const options = [
            { value: 'none', label: 'なし' },
            { value: 'low', label: 'Low ☕' },
            { value: 'medium', label: 'Medium ⚠️' },
            { value: 'high', label: 'High 🔥' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === currentPriority) option.selected = true;
            select.appendChild(option);
        });

        // 要素を置換
        element.replaceWith(select);
        select.focus();

        const finishEdit = () => {
            const newVal = select.value;
            if (newVal !== currentPriority) {
                // updateTodoPriorityはトグル用だったので、指定値で更新する関数を作成するか、ロジックを修正
                updateTodoPriorityJson(id, newVal);
            } else {
                renderTodos();
            }
            isEditing = false;
        };

        select.addEventListener('blur', finishEdit);
        select.addEventListener('change', finishEdit); // 選択したら即反映

        select.addEventListener('click', (ev) => ev.stopPropagation());
    }

    function toggleReminderEdit(event, id, currentReminder) {
        if (isEditing) return;
        isEditing = true;

        const container = event.currentTarget;

        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.className = 'edit-date-input';
        input.value = currentReminder || '';

        input.addEventListener('click', (e) => e.stopPropagation());

        container.replaceWith(input);
        input.focus();

        const finishEdit = () => {
            const newVal = input.value;
            if (newVal !== currentReminder) {
                updateTodoReminder(id, newVal);
            } else {
                renderTodos();
            }
            isEditing = false;
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                input.blur();
            } else if (ev.key === 'Escape') {
                renderTodos();
                isEditing = false;
            }
        });
    }

    function updateTodoPriorityJson(id, newPriority) {
        todos = todos.map(todo =>
            todo.id === id ? { ...todo, priority: newPriority } : todo
        );
        saveTodos();
    }

    function formatReminder(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function isExpired(dateString) {
        if (!dateString) return false;
        return new Date(dateString) < new Date();
    }

    /**
     * タスクリストの描画（レンダリング）
     * - 配列データをHTML要素に変換
     * - 未完了/完了の分離
     * - ドラッグ＆ドロップ用イベントの付与
     * - [NEW] フィルタリングと検索の適用
     */
    function renderTodos() {
        todoList.innerHTML = '';

        // フィルタリングロジックの適用
        let filteredTodos = todos.filter(todo => {
            // 1. テキスト検索 (部分一致)
            const matchesSearch = todo.text.toLowerCase().includes(currentSearch);

            // 2. ステータスフィルタ
            let matchesStatus = true;
            if (currentStatusFilter === 'active') {
                matchesStatus = !todo.completed;
            } else if (currentStatusFilter === 'completed') {
                matchesStatus = todo.completed;
            }

            // 3. 優先度フィルタ
            let matchesPriority = true;
            if (currentPriorityFilter !== 'all') {
                // 優先度が設定されていない(none)場合も考慮
                const priority = todo.priority || 'none';
                matchesPriority = priority === currentPriorityFilter;
            }

            return matchesSearch && matchesStatus && matchesPriority;
        });

        if (filteredTodos.length === 0) {
            // フィルタ結果が0件の場合もEmptyを表示（メッセージを変えても良いがシンプルに）
            emptyState.classList.remove('hidden');
            activeCount.textContent = 0;
            // フィルタ適用中の場合は「該当なし」のメッセージにするなどの工夫も可能
            if (todos.length > 0) {
                emptyState.querySelector('p').textContent = '条件に一致するタスクはありません 🔍';
            } else {
                emptyState.querySelector('p').textContent = 'タスクはありません 🎉';
            }
            return;
        }

        emptyState.classList.add('hidden');

        // D&D実装のため、未完了タスクはユーザー定義順（配列順）を維持し、完了タスクのみ末尾に移動するロジックに変更
        // さらに、期限切れタスクを未完了タスクの中で最優先（トップ）に表示し、日付順でソートする

        const expiredTodos = [];
        const activeTodoItems = []; // 期限切れ以外の未完了
        const completedTodos = [];

        filteredTodos.forEach(todo => {
            if (todo.completed) {
                completedTodos.push(todo);
            } else if (todo.reminder && isExpired(todo.reminder)) {
                expiredTodos.push(todo);
            } else {
                activeTodoItems.push(todo);
            }
        });

        // 期限切れタスクは古い順（緊急度が高い順）にソート
        expiredTodos.sort((a, b) => {
            return new Date(a.reminder).getTime() - new Date(b.reminder).getTime();
        });

        // 完了済みはID順などでソート
        completedTodos.sort((a, b) => b.id - a.id);

        // 結合: 期限切れ -> 通常(未完了) -> 完了済み
        const sortedTodos = [...expiredTodos, ...activeTodoItems, ...completedTodos];

        sortedTodos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''} ${todo.id === focusedTodoId ? 'focused' : ''}`;
            li.dataset.id = todo.id;

            // 集中モード中は対象以外を描画しない（もしくはCSSで隠すが、DOMに残す方がアニメーションしやすい）
            // CSSで .todo-item { display: none } にして .focused だけ表示するアプローチを採用済み

            const priorityHtml = `<span class="priority-badge priority-${todo.priority || 'none'}" title="優先度を変更">${getPriorityLabel(todo.priority)}</span>`;

            let reminderHtml = '';
            if (todo.reminder) {
                const expiredClass = isExpired(todo.reminder) && !todo.completed ? 'expired' : '';
                reminderHtml = `
                    <div class="reminder-badge ${expiredClass}" title="クリックして日時を変更">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${formatReminder(todo.reminder)}
                        ${todo.repeat && todo.repeat !== 'none' ? `<span class="repeat-icon" title="繰り返し: ${getRepeatLabel(todo.repeat)}">🔄</span>` : ''}
                    </div>
                    <a href="${generateCalendarUrl(todo.text, todo.reminder)}" target="_blank" class="calendar-btn" title="Googleカレンダーに追加" onclick="event.stopPropagation()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="10" y1="16" x2="14" y2="16"></line></svg>
                    </a>
                `;
            } else {
                reminderHtml = `
                    <div class="reminder-badge" style="opacity: 0.5;" title="クリックして日時を設定">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                         --/-- --:--
                    </div>
                `;
            }

            const isFocused = todo.id === focusedTodoId;

            // 集中時間の表示用HTML
            let focusTimeHtml = '';
            const totalSeconds = todo.focusTime || 0;
            if (totalSeconds > 0 || isFocused) {
                const timeStr = formatTime(totalSeconds);
                // 集中モード中はIDを付与してJSで更新できるようにする
                const idAttr = isFocused ? 'id="focus-timer-display"' : '';
                focusTimeHtml = `<span class="focus-time" title="集中時間"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span ${idAttr}>${timeStr}</span></span>`;
            }

            li.innerHTML = `
                <div class="checkbox-wrapper">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''}>
                    <div class="checkbox-custom"></div>
                </div>
                <div class="todo-content">
                    <div class="todo-title">
                        <span>${escapeHtml(todo.text)}</span>
                    </div>
                    <div class="todo-meta">
                        ${focusTimeHtml}
                        ${reminderHtml}
                        ${priorityHtml}
                        <!-- 集中ボタン -->
                        <button class="focus-btn" aria-label="集中モード" onclick="event.stopPropagation(); toggleFocusMode(${todo.id})">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <!-- 削除ボタン -->
                        <button class="delete-btn" aria-label="削除">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            const checkbox = li.querySelector('.checkbox-wrapper');
            checkbox.addEventListener('click', () => toggleTodo(todo.id));

            const badge = li.querySelector('.reminder-badge');
            if (badge) {
                badge.addEventListener('click', (e) => toggleReminderEdit(e, todo.id, todo.reminder));
            }

            const textSpan = li.querySelector('.todo-title span');
            if (textSpan) {
                textSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // 完了済みでなければ編集モードへ
                    if (!todo.completed) {
                        enableTaskEdit(todo.id, textSpan);
                    }
                });
            }

            const priorityBadge = li.querySelector('.priority-badge');
            if (priorityBadge) {
                priorityBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!todo.completed) {
                        enablePriorityEdit(todo.id, priorityBadge);
                    }
                });
            }

            const deleteBtn = li.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTodo(todo.id);
            });

            if (!todo.completed) {
                li.setAttribute('draggable', 'true');
                setupDragEvents(li, todo.id);
            }

            // ダブルクリックで集中モード切り替え
            li.addEventListener('dblclick', (e) => {
                // ボタンや入力欄、バッジなどの操作要素をクリックした場合は無視
                if (e.target.closest('button') ||
                    e.target.closest('input') ||
                    e.target.closest('a') ||
                    e.target.closest('.priority-badge') ||
                    e.target.closest('.reminder-badge') ||
                    e.target.closest('.todo-title span')) { // テキスト編集との競合回避（念のため）
                    return;
                }
                toggleFocusMode(todo.id);
            });

            todoList.appendChild(li);
        });

        activeCount.textContent = activeTodoItems.length;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getPriorityLabel(priority) {
        switch (priority) {
            case 'high': return 'High 🔥';
            case 'medium': return 'Medium ⚠️';
            case 'low': return 'Low ☕';
            default: return '＋'; // 優先度なしの場合はプラスマークなどを表示
        }
    }

    /**
     * ドラッグ＆ドロップイベントの設定
     * HTML5 Drag and Drop APIを使用
     * @param {HTMLElement} li - ドラッグ対象のリストアイテム
     * @param {number} id - タスクID
     */
    function setupDragEvents(li, id) {
        li.addEventListener('dragstart', (e) => {
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id); // Firefox用
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            document.querySelectorAll('.todo-item').forEach(item => {
                item.classList.remove('drag-over');
            });
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault(); // ドロップを許可
            e.dataTransfer.dropEffect = 'move';
            const draggingItem = document.querySelector('.dragging');
            if (draggingItem !== li) {
                li.classList.add('drag-over');
            }
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');

            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem) return;

            const draggedId = Number(draggingItem.dataset.id);
            const targetId = Number(li.dataset.id);

            if (draggedId === targetId) return;

            reorderTodos(draggedId, targetId);
        });
    }

    function reorderTodos(draggedId, targetId) {
        const draggedIndex = todos.findIndex(t => t.id === draggedId);
        const targetIndex = todos.findIndex(t => t.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // 配列操作で移動
        const [movedItem] = todos.splice(draggedIndex, 1);
        todos.splice(targetIndex, 0, movedItem);

        saveTodos();
    }

    /**
     * Googleカレンダー追加用のURLを生成する
     * @param {string} title - タスクのタイトル
     * @param {string} dateStr - datetime-local形式の日付文字列 (YYYY-MM-DDTHH:mm)
     * @returns {string} Googleカレンダーの登録画面URL
     */
    function generateCalendarUrl(title, dateStr) {
        if (!dateStr) return '#';

        // 日付フォーマットの変換: 2023-12-07T15:00 -> 20231207T150000
        const date = new Date(dateStr);
        const YYYY = date.getFullYear();
        const MM = String(date.getMonth() + 1).padStart(2, '0');
        const DD = String(date.getDate()).padStart(2, '0');
        const HH = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');

        const startDateTime = `${YYYY}${MM}${DD}T${HH}${mm}00`;
        // 終了時間は開始時間の1時間後に設定
        const endDate = new Date(date.getTime() + 60 * 60 * 1000);
        const endYYYY = endDate.getFullYear();
        const endMM = String(endDate.getMonth() + 1).padStart(2, '0');
        const endDD = String(endDate.getDate()).padStart(2, '0');
        const endHH = String(endDate.getHours()).padStart(2, '0');
        const endmm = String(endDate.getMinutes()).padStart(2, '0');
        const endDateTime = `${endYYYY}${endMM}${endDD}T${endHH}${endmm}00`;

        const text = encodeURIComponent(title);
        const dates = `${startDateTime}/${endDateTime}`;

        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}`;
    }
    // -------------------------------------------------------------------------
    // 集中モード (Focus Mode) ロジック
    // -------------------------------------------------------------------------

    /**
     * 集中モードの切り替え
     * @param {number} id - タスクID
     */
    window.toggleFocusMode = function (id) {
        if (focusedTodoId === id) {
            exitFocusMode();
            return;
        }
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        focusedTodoId = id;
        focusStartTime = Date.now(); // 計測開始

        document.body.classList.add('focus-active');
        const overlay = document.getElementById('focus-overlay');
        if (overlay) overlay.classList.add('active');

        renderTodos();

        // リアルタイム更新用タイマー
        if (focusTimerInterval) clearInterval(focusTimerInterval);
        focusTimerInterval = setInterval(() => {
            const timerDisplay = document.getElementById('focus-timer-display');
            if (timerDisplay && focusStartTime) {
                const elapsedSec = Math.floor((Date.now() - focusStartTime) / 1000);
                const currentTotal = (todo.focusTime || 0) + elapsedSec;
                timerDisplay.textContent = formatTime(currentTotal);
            }
        }, 1000);
    };

    function exitFocusMode() {
        // タイマー停止と保存
        if (focusedTodoId !== null && focusStartTime) {
            const elapsedSec = Math.floor((Date.now() - focusStartTime) / 1000);
            const todo = todos.find(t => t.id === focusedTodoId);
            if (todo) {
                todo.focusTime = (todo.focusTime || 0) + elapsedSec;
                saveTodos();
            }
        }

        if (focusTimerInterval) {
            clearInterval(focusTimerInterval);
            focusTimerInterval = null;
        }
        focusStartTime = null;

        focusedTodoId = null;
        document.body.classList.remove('focus-active');
        const overlay = document.getElementById('focus-overlay');
        if (overlay) overlay.classList.remove('active');
        renderTodos();
    }

    // 秒数を mm:ss 形式などに変換するヘルパー
    function formatTime(seconds) {
        if (!seconds) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
    // -------------------------------------------------------------------------
    // CSV Export / Import Logic
    // -------------------------------------------------------------------------

    function exportTodos() {
        if (!todos || todos.length === 0) {
            alert("エクスポートするタスクがありません。");
            return;
        }

        // CSVヘッダー
        const headers = ["id", "text", "priority", "completed", "reminder", "notified", "focusTime"];

        // データ行の作成
        const rows = todos.map(todo => {
            return headers.map(header => {
                let val = todo[header] !== undefined ? todo[header] : "";

                // エスケープ処理: ダブルクォートがある場合は2つに置換し、全体をダブルクォートで囲む
                const str = String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(',');
        });

        // BOM付きUTF-8にする（Excel文字化け対策）
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const csvContent = headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        link.setAttribute("download", `mytasks_${dateStr}.csv`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function importTodos(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            try {
                const parsedTodos = parseCSV(content);
                if (parsedTodos.length > 0) {
                    // 既存のタスクに追加（IDは衝突回避のため再生成）
                    parsedTodos.forEach(todo => {
                        // 最小限のバリデーション
                        if (todo.text) {
                            todos.push({
                                id: Date.now() + Math.random(), // ユニークID確保
                                text: todo.text,
                                priority: todo.priority || 'none',
                                completed: todo.completed === 'true',
                                reminder: (todo.reminder && todo.reminder !== 'null' && todo.reminder !== 'undefined') ? todo.reminder : null,
                                notified: false, // 通知済みステータスはリセット
                                focusTime: parseInt(todo.focusTime || 0)
                            });
                        }
                    });

                    saveTodos();
                    alert(`${parsedTodos.length}件のタスクをインポートしました。`);
                } else {
                    alert("インポートできるタスクが見つかりませんでした。");
                }
            } catch (err) {
                console.error(err);
                alert("CSVの読み込みに失敗しました。フォーマットを確認してください。");
            }
            // inputをリセットして同じファイルを再度選べるようにする
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    function parseCSV(content) {
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        const result = [];

        // 簡易的なCSVパーサー（ダブルクォート内のカンマ対応などは簡易実装）
        // ※本当はステートマシンで書くべきだが、今回はexportの形式（ダブルクォート囲み）に合わせる

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const obj = {};
            let currentVal = '';
            let isQuoted = false;
            let colIndex = 0;

            for (let j = 0; j < line.length; j++) {
                const char = line[j];

                if (char === '"') {
                    if (isQuoted && line[j + 1] === '"') {
                        // エスケープされたダブルクォート
                        currentVal += '"';
                        j++;
                    } else {
                        isQuoted = !isQuoted;
                    }
                } else if (char === ',' && !isQuoted) {
                    // カンマ区切り
                    if (colIndex < headers.length) {
                        obj[headers[colIndex]] = currentVal;
                    }
                    colIndex++;
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            // 最後のカラム
            if (colIndex < headers.length) {
                obj[headers[colIndex]] = currentVal;
            }

            result.push(obj);
        }

        return result;
    }
    function getRepeatLabel(value) {
        const labels = {
            'daily': '毎日',
            'weekly': '毎週',
            'monthly': '毎月',
            'yearly': '毎年'
        };
        return labels[value] || value;
    }
});

