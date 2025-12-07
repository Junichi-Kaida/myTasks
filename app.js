/**
 * TODOアプリのメインロジック
 * 
 * 機能概要:
 * 1. タスク管理: 追加、削除、完了、編集、ドラッグ＆ドロップ並び替え
 * 2. データ永続化: localStorage または Firebase Cloud Firestore
 * 3. リマインダー: 指定日時に通知（トースト、音、OS通知）
 * 4. UI: グラスモーフィズムデザイン、アニメーション
 * 5. 優先度: High/Medium/Lowのタグ管理とソート
 */

import * as FirebaseManager from './firebase-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // DOM要素の取得
    // -------------------------------------------------------------------------
    const todoInput = document.getElementById('todo-input');
    const todoPriority = document.getElementById('todo-priority');
    const todoDate = document.getElementById('todo-date');
    const addBtn = document.getElementById('add-btn');
    const todoList = document.getElementById('todo-list');
    const emptyState = document.getElementById('empty-state');
    const activeCount = document.getElementById('active-count');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');
    const sortPriorityBtn = document.getElementById('sort-priority-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');

    const dateDisplay = document.getElementById('date-display');

    // 設定モーダル


    // フィルタ・検索用要素
    const searchInput = document.getElementById('search-input');
    const filterStatusBtns = document.querySelectorAll('#filter-status .filter-btn');
    const filterPriorityBtns = document.querySelectorAll('#filter-priority .filter-btn');

    // -------------------------------------------------------------------------
    // 状態管理 (State)
    // -------------------------------------------------------------------------
    let todos = []; // 初期値は空、initでロード
    let isEditing = false;
    let useFirebase = false;

    // フィルタリング状態
    let currentSearch = '';
    let currentStatusFilter = 'all'; // all, active, completed
    let currentPriorityFilter = 'all'; // all, high, medium, low

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

    async function init() {
        initTheme(); // テーマ初期化
        renderDate();
        setupEventListeners();
        requestNotificationPermission();
        startReminderCheck();

        // Check Firebase Config
        const configStr = localStorage.getItem('firebaseConfig');
        if (configStr) {
            try {
                const config = JSON.parse(configStr);
                const success = FirebaseManager.initializeFirebase(config);
                if (success) {
                    useFirebase = true;
                    console.log("Using Firebase Storage");
                    FirebaseManager.subscribeToTodos((newTodos) => {
                        todos = newTodos; // Firebaseから来たデータは既に配列
                        renderTodos();
                    });
                } else {
                    console.warn("Firebase config found but initialization failed.");
                    loadLocalTodos();
                }
            } catch (e) {
                console.error("Invalid Firebase Config:", e);
                loadLocalTodos();
            }
        } else {
            console.log("No Firebase config. Using LocalStorage.");
            loadLocalTodos();
        }

        // 初期フォーカス
        if (todoInput) todoInput.focus();
    }

    function loadLocalTodos() {
        todos = JSON.parse(localStorage.getItem('todos')) || [];
        renderTodos();
    }



    // -------------------------------------------------------------------------
    // テーマ設定
    // -------------------------------------------------------------------------
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        if (newTheme === 'dark') {
            const overlay = document.getElementById('miyabi-overlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                requestAnimationFrame(() => {
                    overlay.classList.add('show');
                });

                setTimeout(() => {
                    document.documentElement.setAttribute('data-theme', newTheme);
                    localStorage.setItem('theme', newTheme);
                    updateThemeIcon(newTheme);
                }, 1000);

                setTimeout(() => {
                    overlay.classList.remove('show');
                    setTimeout(() => {
                        overlay.classList.add('hidden');
                    }, 500);
                }, 2500);
                return;
            }
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

    // -------------------------------------------------------------------------
    // 通知ロジック
    // -------------------------------------------------------------------------
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

    function startReminderCheck() {
        setInterval(() => {
            const now = new Date();
            let stateChanged = false;

            todos.forEach(todo => {
                if (todo.reminder && !todo.completed && !todo.notified) {
                    if (new Date(todo.reminder) <= now) {
                        console.log("Notification triggered for:", todo.text);
                        showNotification(todo.text);
                        // Update notified state
                        if (useFirebase) {
                            FirebaseManager.updateTodo(todo.id, { notified: true });
                        } else {
                            todo.notified = true;
                            stateChanged = true;
                        }
                    }
                }
            });

            if (stateChanged && !useFirebase) {
                saveTodos();
            } else if (!isEditing) {
                renderTodos();
            }
        }, 5000);
    }

    function showNotification(text) {
        showToast(text);
        playNotificationSound();
        if ("Notification" in window && Notification.permission === "granted") {
            try {
                const notification = new Notification("タスクの時間です！", {
                    body: text,
                    icon: "favicon.png"
                });
                notification.onclick = function () {
                    window.focus();
                    notification.close();
                };
            } catch (e) {
                console.error("OS Notification failed:", e);
            }
        }
    }

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
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    function playNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const now = ctx.currentTime;

            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            playTone(880, now, 0.3);
            playTone(1318.51, now + 0.1, 0.6);

        } catch (e) {
            console.error("Audio playback failed:", e);
        }
    }

    // -------------------------------------------------------------------------
    // イベント設定・TODO操作ロジック
    // -------------------------------------------------------------------------
    function setupEventListeners() {
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
            sortPriorityBtn.addEventListener('click', sortTodosByPriority);
        }
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', toggleTheme);
        }





        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearch = e.target.value.toLowerCase();
                renderTodos();
            });
        }
        filterStatusBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterStatusBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentStatusFilter = btn.dataset.filter;
                renderTodos();
            });
        });
        filterPriorityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterPriorityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentPriorityFilter = btn.dataset.filter;
                renderTodos();
            });
        });
    }

    function checkPermissionAndAdd() {
        const isLocalFile = window.location.protocol === 'file:';
        if (!isLocalFile && "Notification" in window && todoDate && todoDate.value) {
            if (Notification.permission === "denied") {
                alert("通知がブロックされています。");
            } else if (Notification.permission === "default") {
                Notification.requestPermission();
            }
        }
        addTodo();
    }

    function renderDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = new Date().toLocaleDateString('ja-JP', options);
    }

    function saveTodos() {
        if (!useFirebase) {
            localStorage.setItem('todos', JSON.stringify(todos));
            renderTodos();
        }
    }

    async function addTodo() {
        const text = todoInput.value.trim();
        const priority = todoPriority ? todoPriority.value : 'none';
        const date = todoDate ? todoDate.value : null;

        if (!text) return;

        const newTodo = {
            id: Date.now(), // LocalStorage ID
            text,
            priority,
            completed: false,
            reminder: date || null,
            notified: false
        };

        try {
            if (useFirebase) {
                await FirebaseManager.addTodo(newTodo);
            } else {
                todos.push(newTodo);
                saveTodos();
            }

            // フォームのリセット
            todoInput.value = '';
            if (todoPriority) todoPriority.value = 'none';
            if (todoDate) todoDate.value = '';
            todoInput.focus();
        } catch (e) {
            console.error("Error adding todo:", e);
            alert("タスクの追加に失敗しました。");
        }
    }

    async function toggleTodo(id) {
        if (useFirebase) {
            const todo = todos.find(t => t.id === id);
            if (todo) {
                await FirebaseManager.updateTodo(id, { completed: !todo.completed });
            }
        } else {
            todos = todos.map(todo =>
                todo.id === id ? { ...todo, completed: !todo.completed } : todo
            );
            saveTodos();
        }
    }

    async function deleteTodo(id) {
        if (useFirebase) {
            await FirebaseManager.deleteTodo(id);
        } else {
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
    }

    async function clearCompleted() {
        if (useFirebase) {
            // Firestore doesn't support bulk delete securely without batching, doing one by one or batch
            const completed = todos.filter(t => t.completed);
            for (const t of completed) {
                await FirebaseManager.deleteTodo(t.id);
            }
        } else {
            todos = todos.filter(todo => !todo.completed);
            saveTodos();
        }
    }

    async function updateTodoReminder(id, newDate) {
        if (useFirebase) {
            await FirebaseManager.updateTodo(id, {
                reminder: newDate || null,
                notified: false
            });
        } else {
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
    }

    async function updateTodoPriorityJson(id, newPriority) {
        if (useFirebase) {
            await FirebaseManager.updateTodo(id, { priority: newPriority });
        } else {
            todos = todos.map(todo =>
                todo.id === id ? { ...todo, priority: newPriority } : todo
            );
            saveTodos();
        }
    }

    async function updateTodoText(id, newText) {
        if (useFirebase) {
            await FirebaseManager.updateTodo(id, { text: newText });
        } else {
            todos = todos.map(todo =>
                todo.id === id ? { ...todo, text: newText } : todo
            );
            saveTodos();
        }
    }

    // Sort is display only for now unless we store an 'order' field.
    // In this existing implementation, sort reorders the array and saves it.
    // For Firestore, reordering usually requires a 'rank' field.
    // For now, let's keep sort local to the 'todos' array, but saving it to Firestore is hard without a 'rank' field.
    // We will apply sort in memory when rendering or update `createdAt` if we really have to, but better to just sort locally for display.
    // NOTE: The previous local logic saved the reordered array. 
    // If we want to persist sort order in Firebase, we need an index.
    // For this generic implementation, I will just re-render locally sorted list.
    function sortTodosByPriority() {
        const priorityScore = { 'high': 3, 'medium': 2, 'low': 1, 'none': 0 };

        todos.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (!a.completed) {
                const scoreA = priorityScore[a.priority || 'none'] || 0;
                const scoreB = priorityScore[b.priority || 'none'] || 0;
                if (scoreA !== scoreB) return scoreB - scoreA;
                // For ID, checking type (string vs number)
                return (a.id < b.id) ? -1 : 1;
            }
            return 0;
        });

        // If local, save. If firebase, we don't save order yet (requires schema change for order)
        if (!useFirebase) saveTodos();
        else renderTodos();
    }

    // -------------------------------------------------------------------------
    // UI Helpers (Edit/Drag/Drop)
    // -------------------------------------------------------------------------
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
                renderTodos();
            }
            isEditing = false;
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') input.blur();
            else if (ev.key === 'Escape') {
                renderTodos();
                isEditing = false;
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
        element.replaceWith(select);
        select.focus();

        const finishEdit = () => {
            const newVal = select.value;
            if (newVal !== currentPriority) {
                updateTodoPriorityJson(id, newVal);
            } else {
                renderTodos();
            }
            isEditing = false;
        };
        select.addEventListener('blur', finishEdit);
        select.addEventListener('change', finishEdit);
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
            if (ev.key === 'Enter') input.blur();
            else if (ev.key === 'Escape') {
                renderTodos();
                isEditing = false;
            }
        });
    }

    function renderTodos() {
        todoList.innerHTML = '';
        let filteredTodos = todos.filter(todo => {
            const matchesSearch = todo.text.toLowerCase().includes(currentSearch);
            let matchesStatus = true;
            if (currentStatusFilter === 'active') matchesStatus = !todo.completed;
            else if (currentStatusFilter === 'completed') matchesStatus = todo.completed;

            let matchesPriority = true;
            if (currentPriorityFilter !== 'all') {
                const priority = todo.priority || 'none';
                matchesPriority = priority === currentPriorityFilter;
            }
            return matchesSearch && matchesStatus && matchesPriority;
        });

        if (filteredTodos.length === 0) {
            emptyState.classList.remove('hidden');
            activeCount.textContent = 0;
            if (todos.length > 0) emptyState.querySelector('p').textContent = '条件に一致するタスクはありません 🔍';
            else emptyState.querySelector('p').textContent = 'タスクはありません 🎉';
            return;
        }

        emptyState.classList.add('hidden');
        const activeTodoItems = [];
        const completedTodos = [];
        filteredTodos.forEach(todo => {
            (todo.completed ? completedTodos : activeTodoItems).push(todo);
        });

        // Always sort completed by ID (desc)
        completedTodos.sort((a, b) => (a.id < b.id) ? 1 : -1);

        const sortedTodos = [...activeTodoItems, ...completedTodos];

        sortedTodos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.dataset.id = todo.id;

            let reminderHtml = '';
            if (todo.reminder) {
                const expiredClass = isExpired(todo.reminder) && !todo.completed ? 'expired' : '';
                reminderHtml = `
                    <div class="reminder-badge ${expiredClass}" title="クリックして日時を変更">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${formatReminder(todo.reminder)}
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

            li.innerHTML = `
                <div class="checkbox-wrapper">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''}>
                    <div class="checkbox-custom"></div>
                </div>
                <div class="todo-text">
                    <span>${escapeHtml(todo.text)}</span>
                    <span class="priority-badge priority-${todo.priority || 'none'}" title="優先度を変更">${getPriorityLabel(todo.priority)}</span>
                    ${reminderHtml}
                </div>
                <button class="delete-btn" aria-label="削除">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;

            const checkbox = li.querySelector('.checkbox-wrapper');
            checkbox.addEventListener('click', () => toggleTodo(todo.id));

            const badge = li.querySelector('.reminder-badge');
            if (badge) badge.addEventListener('click', (e) => toggleReminderEdit(e, todo.id, todo.reminder));

            const textSpan = li.querySelector('.todo-text span');
            if (textSpan) {
                textSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!todo.completed) enableTaskEdit(todo.id, textSpan);
                });
            }

            const priorityBadge = li.querySelector('.priority-badge');
            if (priorityBadge) {
                priorityBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!todo.completed) enablePriorityEdit(todo.id, priorityBadge);
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
            default: return '＋';
        }
    }

    function setupDragEvents(li, id) {
        // Drag events same as before, but reordering function needs to handle array only
        li.addEventListener('dragstart', (e) => {
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
        });
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            document.querySelectorAll('.todo-item').forEach(item => {
                item.classList.remove('drag-over');
            });
        });
        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const draggingItem = document.querySelector('.dragging');
            if (draggingItem !== li) li.classList.add('drag-over');
        });
        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });
        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem) return;
            const draggedId = Number(draggingItem.dataset.id) || draggingItem.dataset.id; // Handle string ID for firebase
            const targetId = Number(li.dataset.id) || li.dataset.id;
            if (draggedId === targetId) return;
            reorderTodos(draggedId, targetId);
        });
    }

    function reorderTodos(draggedId, targetId) {
        // Find indices in global 'todos' array (might include hidden ones, but Drag is mostly on visible ones)
        // Note: filtered list reorder is tricky. We'll do it in the main list.
        const draggedIndex = todos.findIndex(t => t.id === draggedId);
        const targetIndex = todos.findIndex(t => t.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;

        const [movedItem] = todos.splice(draggedIndex, 1);
        todos.splice(targetIndex, 0, movedItem);

        if (!useFirebase) saveTodos();
        else renderTodos(); // Just re-render new order locally.
    }

    function generateCalendarUrl(title, dateStr) {
        if (!dateStr) return '#';
        const date = new Date(dateStr);
        const YYYY = date.getFullYear();
        const MM = String(date.getMonth() + 1).padStart(2, '0');
        const DD = String(date.getDate()).padStart(2, '0');
        const HH = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const startDateTime = `${YYYY}${MM}${DD}T${HH}${mm}00`;
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
});
