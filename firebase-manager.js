import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let db = null;
let unsubscribe = null;

/**
 * Initialize Firebase with the provided config.
 * @param {Object} config - Firebase configuration object
 * @returns {boolean} - True if successful
 */
export function initializeFirebase(config) {
    try {
        if (!config || !config.apiKey) return false;
        const app = initializeApp(config);
        db = getFirestore(app);
        console.log("Firebase initialized successfully");
        return true;
    } catch (e) {
        console.error("Firebase initialization failed:", e);
        return false;
    }
}

/**
 * Subscribe to real-time updates from the 'todos' collection.
 * @param {Function} callback - Function to call with the list of todos
 */
export function subscribeToTodos(callback) {
    if (!db) return;

    // Unsubscribe from previous listener if exists
    if (unsubscribe) {
        unsubscribe();
    }

    const q = query(collection(db, "todos"), orderBy("createdAt", "desc"));

    unsubscribe = onSnapshot(q, (snapshot) => {
        const todos = [];
        snapshot.forEach((doc) => {
            todos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        callback(todos);
    }, (error) => {
        console.error("Error getting documents: ", error);
    });
}

/**
 * Add a new todo to Firestore.
 * @param {Object} todo - Todo object
 */
export async function addTodo(todo) {
    if (!db) return;
    try {
        // Firestore creates its own ID, but we can store our custom ID if needed or just use Firestore's.
        // For compatibility with the existing app which might rely on numeric IDs for sorting, 
        // we'll keep the object as is but remove the 'id' field if we want to rely on doc.id, 
        // OR distinct them. The app uses 'id' for DOM tracking.
        // Let's store the 'id' (timestamp) as a field 'localId' or just 'createdAt'.
        // To verify: existing app uses Date.now() as ID.

        await addDoc(collection(db, "todos"), {
            ...todo,
            createdAt: Date.now() // Ensure we have a consistent sort field
        });
    } catch (e) {
        console.error("Error adding doc: ", e);
    }
}

/**
 * Update an existing todo in Firestore.
 * @param {string} id - Document ID (Firestore ID)
 * @param {Object} updates - Fields to update
 */
export async function updateTodo(id, updates) {
    if (!db) return;
    try {
        const todoRef = doc(db, "todos", id);
        await updateDoc(todoRef, updates);
    } catch (e) {
        console.error("Error updating doc: ", e);
    }
}

/**
 * Delete a todo from Firestore.
 * @param {string} id - Document ID (Firestore ID)
 */
export async function deleteTodo(id) {
    if (!db) return;
    try {
        await deleteDoc(doc(db, "todos", id));
    } catch (e) {
        console.error("Error deleting doc: ", e);
    }
}
