// CONTIGO POS - FORCE RESTART SCRIPT
// Este script soluciona el error "Sincronizando con Kontigo Cloud" infinito
// y "Failed to fetch" tras la migración de Supabase.

console.log("🛠️ Iniciando Reseteo Profundo del POS...");

// 1. Limpiar localStorage de tokens viejos de Supabase
localStorage.clear();
console.log("✅ LocalStorage limpiado.");

// 2. Limpiar sessionStorage
sessionStorage.clear();
console.log("✅ SessionStorage limpiado.");

// 3. Desregistrar Service Workers (si los hay) para forzar recarga limpia
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
            registration.unregister();
            console.log("✅ Service Worker desregistrado.");
        }
    });
}

console.log("🔄 Recargando la aplicación compulsivamente...");
// 4. Recargar forzadamente ignorando el caché
setTimeout(() => {
    window.location.reload(true);
}, 500);
