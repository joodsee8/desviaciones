// TUS LLAVES DE SUPABASE
const supabaseUrl = 'https://qxxtycgmcekvmowachme.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eHR5Y2dtY2Vrdm1vd2FjaG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mzk5NjgsImV4cCI6MjA5NTMxNTk2OH0.m-D9QIK-g7bkyqLh9jOWJMrUG175DBDmiwvImZgo8Z8';
const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

if (localStorage.getItem('sesionCaja')) { window.location.href = "dashboard.html"; }

let tempUserData = null; // Variable para atrapar al usuario temporalmente

document.getElementById('formLogin').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formLogin .btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Conectando...';
    btn.disabled = true;

    const usr = document.getElementById('usuario').value.toUpperCase().trim();
    const pass = document.getElementById('password').value;

    const { data } = await clienteSupabase.from('usuarios_app').select('*').eq('nombre', usr).eq('password', pass).single();

    if (data) {
        // ¿Requiere cambio de contraseña?
        if (data.requiere_cambio_pwd === true) {
            tempUserData = data;
            document.getElementById('formLogin').style.display = 'none';
            document.getElementById('formForzado').style.display = 'block';
            document.querySelector('.section-title').innerText = 'Contraseña Temporal';
            btn.innerHTML = originalText; btn.disabled = false;
        } else {
            localStorage.setItem('sesionCaja', JSON.stringify(data));
            window.location.href = "dashboard.html";
        }
    } else {
        alert("Usuario o contraseña incorrectos.");
        btn.innerHTML = originalText; btn.disabled = false;
    }
});

// Lógica para cuando envían su nueva contraseña
document.getElementById('formForzado').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#formForzado .btn-submit');
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Actualizando...';
    btn.disabled = true;

    const nuevaPwd = document.getElementById('pwd_forzada').value;

    // Actualizamos la base de datos (guardamos la clave y apagamos el candado)
    const { error } = await clienteSupabase
        .from('usuarios_app')
        .update({ password: nuevaPwd, requiere_cambio_pwd: false })
        .eq('id', tempUserData.id);

    if (error) {
        alert("Hubo un error al actualizar, intenta de nuevo.");
        btn.innerHTML = 'Guardar y Entrar <i class="ph ph-check-circle"></i>';
        btn.disabled = false;
    } else {
        // Actualizamos los datos temporales, guardamos sesión y lo dejamos pasar
        tempUserData.password = nuevaPwd;
        tempUserData.requiere_cambio_pwd = false;
        localStorage.setItem('sesionCaja', JSON.stringify(tempUserData));
        window.location.href = "dashboard.html";
    }
});