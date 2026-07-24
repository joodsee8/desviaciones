// TUS LLAVES
const supabaseUrl = 'https://qxxtycgmcekvmowachme.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eHR5Y2dtY2Vrdm1vd2FjaG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mzk5NjgsImV4cCI6MjA5NTMxNTk2OH0.m-D9QIK-g7bkyqLh9jOWJMrUG175DBDmiwvImZgo8Z8';
const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

let sesionGlobal = null; 
let dbMovimientos = []; let dbUsuarios = []; let listaNombres = [];
const coloresGraficas = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#4f46e5', '#db2777', '#059669', '#ca8a04'];
let chartModalDonut = null; let chartDonaTienda = null; let chartSemanasMes = null;
let empleadoSeleccionado = ""; let diccSemanas = {}; let tipoRegistroGerente = "faltante";

async function arrancarApp() {
    const sesionStr = localStorage.getItem('sesionCaja');
    if (!sesionStr) { window.location.href = "index.html"; return; }
    sesionGlobal = JSON.parse(sesionStr);
    document.getElementById('userNameDisplay').innerText = sesionGlobal.nombre;

    await cargarUsuariosGlobales();

    if (sesionGlobal.rol === 'dev') {
        document.getElementById('toggle-rol').style.display = "flex";
        document.getElementById('btn-modo-dev').style.display = "flex";
        document.getElementById('btn-modo-gerente').style.display = "flex";
        activarVista('dev');
    } else if (sesionGlobal.rol === 'gerente') {
        document.getElementById('toggle-rol').style.display = "flex";
        document.getElementById('btn-modo-gerente').style.display = "flex";
        activarVista('gerente');
    } else { 
        activarVista('caja'); 
    }
}

async function cargarUsuariosGlobales() {
    const { data } = await clienteSupabase.from('usuarios_app').select('*').order('nombre');
    if (data) {
        dbUsuarios = data; listaNombres = data.map(u => u.nombre);
        let htmlSelect = `<option value="">Selecciona quién...</option>`;
        listaNombres.forEach(n => { htmlSelect += `<option value="${n}">${n}</option>`; });
        document.getElementById('ger_reg_recibe').innerHTML = htmlSelect;
    }
}

function activarVista(vista) {
    document.getElementById('vista-empleado').style.display = "none"; document.getElementById('vista-gerente').style.display = "none"; document.getElementById('vista-dev').style.display = "none";
    document.querySelectorAll('.switch-maestro .tab').forEach(t => t.classList.remove('active'));

    if (vista === 'dev') { document.getElementById('vista-dev').style.display = "block"; document.getElementById('btn-modo-dev').classList.add('active'); renderPanelDev(); } 
    else if (vista === 'gerente') { document.getElementById('vista-gerente').style.display = "block"; document.getElementById('btn-modo-gerente').classList.add('active'); pullGerencia(); } 
    else { document.getElementById('vista-empleado').style.display = "block"; document.getElementById('btn-modo-caja').classList.add('active'); pullEmpleado(); }
}

function abrirModalPwd() { document.getElementById('modalCambiarPwd').classList.add('active'); }
function cerrarModalPwd() { document.getElementById('modalCambiarPwd').classList.remove('active'); document.getElementById('formCambiarPwd').reset(); }

document.getElementById('formCambiarPwd').addEventListener('submit', async function(e) {
    e.preventDefault();
    let actual = document.getElementById('pwd_actual').value; let nueva = document.getElementById('pwd_nueva').value;
    if(actual !== sesionGlobal.password) { alert("Tu clave actual es incorrecta."); return; }
    const { error } = await clienteSupabase.from('usuarios_app').update({ password: nueva }).eq('id', sesionGlobal.id);
    if(error) { alert("Error al conectar."); } else { sesionGlobal.password = nueva; localStorage.setItem('sesionCaja', JSON.stringify(sesionGlobal)); alert("Actualizada con éxito."); cerrarModalPwd(); if(sesionGlobal.rol === 'dev') { await cargarUsuariosGlobales(); renderPanelDev(); } }
});

// ================= LÓGICA DE CAJERO (SÓLO VISTA) =================
async function pullEmpleado() {
    // Traemos todo de viejo a nuevo para calcular la deuda cronológicamente
    const { data } = await clienteSupabase.from('movimientos').select('*').order('fecha', { ascending: true });
    if (!data) return; 

    let currentNet = 0;
    let currentDebtCycle = [];

    data.forEach(mov => {
        if(mov.estado === 'NO REAL' || mov.estado === 'PENDIENTE_APROBACION') return;
        
        let meAfecta = false; let impacto = 0; let textAction = ""; let colorClase = "";

        if (mov.tipo === 'faltante' && mov.nombre_empleado === sesionGlobal.nombre) { 
            impacto = -parseFloat(mov.monto); meAfecta = true; textAction = `FALTANTE ZETA: ${mov.no_zeta}`; colorClase = 'negativo'; 
        }
        else if (mov.tipo === 'sobrante' && mov.nombre_empleado === sesionGlobal.nombre) { 
            impacto = parseFloat(mov.monto); meAfecta = true; textAction = `SOBRANTE ZETA: ${mov.no_zeta}`; colorClase = 'positivo'; 
        }
        else if (mov.tipo === 'abono' && mov.nombre_empleado === sesionGlobal.nombre) { 
            impacto = parseFloat(mov.monto); meAfecta = true; textAction = `ABONO EFVO`; colorClase = 'positivo'; 
        }
        else if (mov.tipo === 'extra') {
            if (mov.nombre_empleado === sesionGlobal.nombre) { 
                impacto = parseFloat(mov.monto); meAfecta = true; textAction = `DISTE A ${mov.nombre_receptor} (Z: ${mov.no_zeta})`; colorClase = 'positivo'; 
            }
            if (mov.nombre_receptor === sesionGlobal.nombre) { 
                impacto = -parseFloat(mov.monto); meAfecta = true; textAction = `RECIBISTE DE ${mov.nombre_empleado} (Z: ${mov.no_zeta})`; colorClase = 'negativo'; 
            }
        }

        if (meAfecta) {
            currentNet += impacto;
            mov.renderData = { textAction, colorClase, impacto };
            currentDebtCycle.push(mov);

            // Si el balance llega a 0 o se vuelve positivo, la deuda está liquidada, borramos historial visual.
            if (currentNet > -0.01) {
                currentDebtCycle = [];
            }
        }
    });

    const balEl = document.getElementById('balanceActivoEmpleado');
    const alertaEl = document.getElementById('alertaCajeroSano');

    if (currentNet < -0.01) {
        balEl.innerText = `-$${Math.abs(currentNet).toFixed(2)}`;
        balEl.className = 'balance-amount negativo';
        alertaEl.style.display = 'none';
    } else {
        balEl.innerText = `$0.00`;
        balEl.className = 'balance-amount positivo';
        alertaEl.style.display = 'block';
    }

    let htmlHistorial = "";
    // Revertimos para mostrar lo más reciente hasta arriba
    currentDebtCycle.reverse().forEach(mov => {
        htmlHistorial += `<li>
            <div class="li-row"><span style="font-weight:600;"><i class="ph ph-receipt"></i> ${mov.renderData.textAction}</span><span class="${mov.renderData.colorClase}" style="font-weight:700;">${mov.renderData.impacto < 0 ? '-':'+'}$${Math.abs(mov.renderData.impacto).toFixed(2)}</span></div>
            <div class="li-row meta-text"><span>${new Date(mov.fecha).toLocaleString()}</span></div>
        </li>`;
    });

    document.getElementById('historialActivoEmpleado').innerHTML = htmlHistorial || '<li class="meta-text text-center py-2">Nada que mostrar en el ciclo actual.</li>';
}

// ================= GERENCIA =================
function cambiarPestanaGerente(sec) {
    ['mapa','autorizar','historial'].forEach(s => {
        document.getElementById(`sec-ger-${s}`).style.display = s === sec ? 'block' : 'none';
        document.getElementById(`tab-ger-${s}`).classList.toggle('active', s === sec);
    });
    if (sec === 'historial') { renderHistorialGlobalAvanzado(); }
}

async function pullGerencia() {
    const { data } = await clienteSupabase.from('movimientos').select('*').order('fecha', { ascending: false });
    if (data) { dbMovimientos = data; renderMapaIncidencias(); renderAutorizacionesPendientes(); if (document.getElementById('tab-ger-historial').classList.contains('active')) renderHistorialGlobalAvanzado(); }
}

function renderMapaIncidencias() {
    const filtro = document.getElementById('ger_filtro_mapa').value; 
    let mapa = {};
    listaNombres.forEach(e => { mapa[e] = { nombre: e, faltantes: 0, sobrantes: 0, abonos: 0, incidenciasF: 0, incidenciasS: 0 }; });

    dbMovimientos.forEach(mov => {
        if(mov.estado === 'NO REAL' || mov.estado === 'PENDIENTE_APROBACION') return;
        let t = mov.nombre_empleado; let m = parseFloat(mov.monto); let esIncidencia = (m <= 19.00); 

        if (mov.tipo === 'faltante') { mapa[t].faltantes += m; if(esIncidencia) mapa[t].incidenciasF++; }
        else if (mov.tipo === 'sobrante') { mapa[t].sobrantes += m; if(esIncidencia) mapa[t].incidenciasS++; }
        else if (mov.tipo === 'abono') { mapa[t].abonos += m; }
        else if (mov.tipo === 'extra') { mapa[t].abonos += m; if(mapa[mov.nombre_receptor]) mapa[mov.nombre_receptor].faltantes += m; }
    });

    let arr = Object.values(mapa).map(e => {
        e.neto = e.faltantes - (e.sobrantes + e.abonos);
        e.totalInc = e.incidenciasF + e.incidenciasS;
        return e;
    });

    if (filtro === 'faltantes') { arr = arr.filter(e => e.neto > 0.01); arr.sort((a,b) => b.neto - a.neto); } 
    else if (filtro === 'sobrantes') { arr = arr.filter(e => e.neto < -0.01); arr.sort((a,b) => a.neto - b.neto); } 
    else if (filtro === 'incidencias') { arr = arr.filter(e => e.totalInc > 0); arr.sort((a,b) => b.totalInc - a.totalInc); } 
    else { arr.sort((a,b) => b.neto - a.neto); }

    let html = "";
    arr.forEach(e => {
        let clase = ""; let contenido = "";

        if (filtro === 'incidencias') {
            if (e.totalInc === 0) clase = "sano"; else if (e.totalInc <= 2) clase = "preventivo"; else if (e.totalInc <= 4) clase = "alerta"; else clase = "critico"; 
            contenido = `<div class="mapa-monto">${e.totalInc}</div><div class="mapa-incidencias-det"><span class="text-danger">Faltante: ${e.incidenciasF}</span><span class="text-success">Sobrante: ${e.incidenciasS}</span></div>`;
        } else {
            if (e.neto > 0.01) { clase = "critico"; contenido = `<div class="mapa-monto text-danger">-$${e.neto.toFixed(2)}</div>`; } 
            else if (e.neto < -0.01) { clase = "sano"; contenido = `<div class="mapa-monto text-success">+$${Math.abs(e.neto).toFixed(2)}</div>`; } 
            else { clase = "sano"; contenido = `<div class="mapa-monto text-success"><i class="ph ph-check-circle"></i> $0.00</div>`; }
        }
        html += `<div class="mapa-item ${clase}" onclick="abrirModalEmpleado('${e.nombre}')"><div class="mapa-nombre">${e.nombre}</div>${contenido}</div>`;
    });
    
    if(arr.length === 0) { html = `<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 20px;">No hay registros para este filtro.</div>`; }
    document.getElementById('contenedorMapaGrid').innerHTML = html;
}

function renderAutorizacionesPendientes() {
    let html = "";
    dbMovimientos.forEach(mov => {
        if (mov.tipo === 'abono' && mov.estado === 'PENDIENTE_APROBACION') {
            html += `<li><div class="li-row"><span style="font-weight:700;" class="text-primary"><i class="ph ph-hand-coins"></i> ABONO ${mov.nombre_empleado}</span><span style="font-weight:700;" class="text-warning">+$${parseFloat(mov.monto).toFixed(2)}</span></div><div class="meta-text">${new Date(mov.fecha).toLocaleString()}</div><div style="display:flex; gap:10px; margin-top:10px;"><button onclick="procesarAbono(${mov.id}, 'APROBADO')" class="btn-header" style="flex:1; justify-content:center; color:#16a34a;"><i class="ph ph-check-circle"></i> Aprobar</button><button onclick="procesarAbono(${mov.id}, 'NO REAL')" class="btn-header danger" style="flex:1; justify-content:center;"><i class="ph ph-x-circle"></i> Rechazar</button></div></li>`;
        }
    });
    document.getElementById('listaAbonosPendientes').innerHTML = html || '<li class="meta-text text-center py-3">No hay abonos pendientes.</li>';
}
async function procesarAbono(id, estado) { await clienteSupabase.from('movimientos').update({ estado: estado }).eq('id', id); pullGerencia(); }

function getNumeroSemanaMes(fDate) {
    let d = new Date(fDate); let firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    let offset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; return Math.ceil((d.getDate() + offset) / 7);
}

function renderHistorialGlobalAvanzado() {
    let mapaDeudaTienda = {}; listaNombres.forEach(e => mapaDeudaTienda[e] = 0);

    dbMovimientos.forEach(mov => {
        if(mov.estado === 'NO REAL' || mov.estado === 'PENDIENTE_APROBACION') return;
        if (mov.tipo === 'faltante') mapaDeudaTienda[mov.nombre_empleado] += parseFloat(mov.monto);
        if (mov.tipo === 'sobrante') mapaDeudaTienda[mov.nombre_empleado] -= parseFloat(mov.monto);
        if (mov.tipo === 'abono') mapaDeudaTienda[mov.nombre_empleado] -= parseFloat(mov.monto);
        if (mov.tipo === 'extra') {
            mapaDeudaTienda[mov.nombre_empleado] -= parseFloat(mov.monto); 
            if(mapaDeudaTienda[mov.nombre_receptor] !== undefined) mapaDeudaTienda[mov.nombre_receptor] += parseFloat(mov.monto);
        }
    });

    let totalTienda = 0; Object.keys(mapaDeudaTienda).forEach(k => { totalTienda += mapaDeudaTienda[k]; });
    let signo = totalTienda > 0 ? "-" : "+";
    document.getElementById('balanceTiendaGlobal').innerText = `${signo}$${Math.abs(totalTienda).toFixed(2)}`;
    document.getElementById('balanceTiendaGlobal').className = totalTienda > 0 ? 'balance-amount negativo' : (totalTienda < 0 ? 'balance-amount positivo' : 'balance-amount neutro');

    window.datosDonaTienda = {...mapaDeudaTienda};
    Object.keys(mapaDeudaTienda).forEach(k => { if (mapaDeudaTienda[k] < 0) mapaDeudaTienda[k] = 0; });

    const hoy = new Date(); const mesActual = hoy.getMonth(); const yearActual = hoy.getFullYear();
    let lastDay = new Date(yearActual, mesActual + 1, 0); let totalSemanas = getNumeroSemanaMes(lastDay);
    let etiquetasSemanas = []; for(let i=1; i<=totalSemanas; i++) etiquetasSemanas.push(`Semana ${i}`);

    let datasetsBarras = [];
    listaNombres.forEach((emp, i) => { datasetsBarras.push({ label: emp, data: Array(totalSemanas).fill(0), backgroundColor: coloresGraficas[i % coloresGraficas.length] }); });

    dbMovimientos.forEach(mov => {
        let f = new Date(mov.fecha);
        if (f.getMonth() === mesActual && f.getFullYear() === yearActual && mov.tipo === 'faltante' && mov.estado !== 'NO REAL') {
            let semIndex = getNumeroSemanaMes(f) - 1; 
            let ds = datasetsBarras.find(d => d.label === mov.nombre_empleado); 
            if (ds) ds.data[semIndex] += parseFloat(mov.monto);
        }
    });

    const ctxBarras = document.getElementById('graficoSemanasMes').getContext('2d');
    if(chartSemanasMes) chartSemanasMes.destroy();
    chartSemanasMes = new Chart(ctxBarras, {
        type: 'bar', data: { labels: etiquetasSemanas, datasets: datasetsBarras },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { stacked: true, grid: { display: false }, ticks: {color:'#a1a1aa'} }, y: { stacked: true, grid: { color: '#27272a' }, ticks:{color:'#a1a1aa'} } } }
    });

    renderHeatmap(mesActual, yearActual); renderHistorialSemanas();
}

function abrirModalTienda() {
    document.getElementById('modalTiendaGlobal').classList.add('active');
    let dataArr = []; let bgArr = []; let lblArr = []; let i = 0;
    
    Object.keys(window.datosDonaTienda).forEach(emp => { 
        let monto = window.datosDonaTienda[emp]; 
        if (monto > 0) { lblArr.push(emp); dataArr.push(monto); bgArr.push(coloresGraficas[i % coloresGraficas.length]); i++; } 
    });
    
    const ctxDona = document.getElementById('chartDonaTienda').getContext('2d');
    if (chartDonaTienda) chartDonaTienda.destroy();
    if (dataArr.length === 0) { lblArr = ['Sano']; dataArr = [0]; bgArr = ['#16a34a']; }
    
    chartDonaTienda = new Chart(ctxDona, { 
        type: 'bar', 
        data: { labels: lblArr, datasets: [{ data: dataArr, backgroundColor: bgArr, borderRadius: 4 }] }, 
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#a1a1aa' }, grid:{display:false} }, y: { ticks: { color: '#a1a1aa' }, grid: { color: '#27272a' } } } } 
    });
}
function cerrarModalTienda() { document.getElementById('modalTiendaGlobal').classList.remove('active'); }

function renderHeatmap(month, year) {
    document.getElementById('mesActualLabel').innerText = new Date(year, month).toLocaleString('es-ES', { month: 'long' }).toUpperCase();
    const firstDay = new Date(year, month, 1).getDay(); const startOffset = firstDay === 0 ? 6 : firstDay - 1; 
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let mapaDias = {}; let mapaDiasMonto = {}; let mapaEmpMesFaltante = {};

    dbMovimientos.forEach(mov => { 
        let d = new Date(mov.fecha); 
        if (d.getMonth() === month && d.getFullYear() === year) {
            let day = d.getDate();
            if (mov.tipo !== 'abono') { mapaDias[day] = (mapaDias[day] || 0) + 1; }
            
            let monto = parseFloat(mov.monto);
            if (mov.tipo === 'faltante' && mov.estado !== 'NO REAL') {
                mapaDiasMonto[day] = (mapaDiasMonto[day] || 0) + monto;
                mapaEmpMesFaltante[mov.nombre_empleado] = (mapaEmpMesFaltante[mov.nombre_empleado] || 0) + monto;
            }
            if (mov.tipo === 'sobrante' && mov.estado !== 'NO REAL') { mapaDiasMonto[day] = (mapaDiasMonto[day] || 0) - monto; }
        } 
    });

    let maxFaltante = 0; let peorEmpleado = "Ninguno";
    Object.keys(mapaEmpMesFaltante).forEach(emp => { if(mapaEmpMesFaltante[emp] > maxFaltante) { maxFaltante = mapaEmpMesFaltante[emp]; peorEmpleado = emp; } });
    document.getElementById('peorEmpleadoMesContenedor').innerHTML = `<div class="alert-box"><i class="ph-fill ph-warning-octagon"></i> Mayor infractor mensual: <strong style="color:#dc2626;">${peorEmpleado !== "Ninguno" ? peorEmpleado + ' ($' + maxFaltante.toFixed(2) + ')' : 'Ninguno'}</strong></div>`;

    let htmlCal = "";
    for (let i = 0; i < startOffset; i++) htmlCal += `<div class="cal-day empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        let inc = mapaDias[day] || 0; let montoDia = mapaDiasMonto[day] || 0;
        let clase = inc > 4 ? 'heat-3' : (inc > 2 ? 'heat-2' : (inc > 0 ? 'heat-1' : ''));
        let signoMonto = montoDia > 0 ? "-" : (montoDia < 0 ? "+" : "");
        let colorMonto = montoDia > 0 ? "var(--danger)" : (montoDia < 0 ? "var(--success)" : "var(--text-muted)");

        htmlCal += `
            <div class="cal-day ${clase}" onclick="abrirModalDiaHeatmap(${day}, ${month}, ${year})" style="cursor:pointer;">
                <span style="font-size:13px; font-weight:700;">${day}</span>
                <span style="font-size:9px; color:var(--text-muted);">${inc} <i class="ph-fill ph-ticket"></i></span>
                <span style="font-size:10px; color:${colorMonto}; font-weight:700;">${signoMonto}$${Math.abs(montoDia).toFixed(0)}</span>
            </div>`;
    }
    document.getElementById('calendarioHeatmap').innerHTML = htmlCal;
}

function abrirModalDiaHeatmap(day, month, year) {
    document.getElementById('tituloModalDiaHeatmap').innerText = `Desviaciones: ${day}/${month+1}/${year}`;
    document.getElementById('modalDiaHeatmap').classList.add('active');

    let targetDateStr = new Date(year, month, day).toDateString();
    let zetasDelDia = {};

    dbMovimientos.forEach(mov => {
        if (new Date(mov.fecha).toDateString() !== targetDateStr) return;
        if (mov.estado === 'NO REAL' || mov.estado === 'PENDIENTE_APROBACION') return;

        let zKey = mov.no_zeta || "Sin Zeta";
        if (!zetasDelDia[zKey]) zetasDelDia[zKey] = { faltantes: 0, sobrantes: 0, empleados: new Set() };

        if (mov.tipo === 'faltante') { zetasDelDia[zKey].faltantes += parseFloat(mov.monto); zetasDelDia[zKey].empleados.add(mov.nombre_empleado); }
        if (mov.tipo === 'sobrante') { zetasDelDia[zKey].sobrantes += parseFloat(mov.monto); zetasDelDia[zKey].empleados.add(mov.nombre_empleado); }
    });

    let html = "";
    Object.keys(zetasDelDia).forEach(z => {
        let netStoreImpact = zetasDelDia[z].sobrantes - zetasDelDia[z].faltantes;
        if (netStoreImpact < 0) { 
            let emps = Array.from(zetasDelDia[z].empleados).join(', ');
            html += `<li>
                <div class="li-row"><span style="font-weight:700; color:var(--danger);"><i class="ph ph-warning-octagon"></i> Zeta: ${z}</span><span class="negativo" style="font-weight:800;">-$${Math.abs(netStoreImpact).toFixed(2)}</span></div>
                <div class="meta-text" style="margin-top: 4px;">Cajero(s) involucrado(s): <strong>${emps || 'N/A'}</strong></div>
            </li>`;
        }
    });
    document.getElementById('listaZetasNegativasDia').innerHTML = html || '<li class="meta-text text-center py-3"><i class="ph ph-check-circle text-success"></i> Todo perfecto. No hubo desviaciones negativas este día.</li>';
}

function cerrarModalDiaHeatmap() { document.getElementById('modalDiaHeatmap').classList.remove('active'); }

function getSemanaLabel(dStr) {
    let d = new Date(dStr); let day = d.getDay() || 7; d.setHours(0,0,0,0);
    let start = new Date(d); start.setDate(d.getDate() - day + 1); let end = new Date(d); end.setDate(d.getDate() - day + 7);
    let fmt = (date) => date.getDate() + ' ' + date.toLocaleString('es-ES', { month: 'short' }); return `<i class="ph ph-calendar-blank"></i> Semana ${fmt(start)} - ${fmt(end)}`;
}

function renderHistorialSemanas() {
    diccSemanas = {}; let balancesZeta = {};
    
    dbMovimientos.forEach(mov => {
        if (mov.estado === 'NO REAL' || mov.estado === 'PENDIENTE_APROBACION') return;
        let z = mov.no_zeta || "Sin Zeta"; let e = mov.nombre_empleado;
        if (!balancesZeta[z]) balancesZeta[z] = {};
        if (balancesZeta[z][e] === undefined) balancesZeta[z][e] = 0;

        if (mov.tipo === 'faltante') balancesZeta[z][e] -= parseFloat(mov.monto);
        if (mov.tipo === 'sobrante') balancesZeta[z][e] += parseFloat(mov.monto);
        if (mov.tipo === 'abono') balancesZeta[z][e] += parseFloat(mov.monto);
        if (mov.tipo === 'extra') {
            balancesZeta[z][e] += parseFloat(mov.monto); 
            let r = mov.nombre_receptor;
            if (r) { if (balancesZeta[z][r] === undefined) balancesZeta[z][r] = 0; balancesZeta[z][r] -= parseFloat(mov.monto); }
        }
    });

    dbMovimientos.forEach(mov => {
        let key = getSemanaLabel(mov.fecha);
        if (!diccSemanas[key]) diccSemanas[key] = { faltantes: [], sobrantes: [], abonos: [] };
        
        let z = mov.no_zeta || "Sin Zeta"; let e = mov.nombre_empleado; let r = mov.nombre_receptor;
        let empDebe = balancesZeta[z] && balancesZeta[z][e] < -0.01;
        let recDebe = r && balancesZeta[z] && balancesZeta[z][r] < -0.01;

        if (mov.tipo === 'faltante' || mov.tipo === 'sobrante' || mov.tipo === 'abono') { if (!empDebe) return; } 
        else if (mov.tipo === 'extra') { if (!empDebe && !recDebe) return; }

        let textBadge = mov.estado; if(mov.tipo !== 'abono' && textBadge === 'PENDIENTE') textBadge = 'REAL';
        let txtAccion = mov.tipo.toUpperCase();
        if(mov.tipo === 'extra') txtAccion = `${mov.nombre_empleado} <i class="ph ph-arrow-right"></i> ${mov.nombre_receptor}`;
        else txtAccion = `${mov.nombre_empleado}`;

        let li = `<li><div class="li-row"><span style="font-weight:600;">${txtAccion}</span><span style="font-weight:700;">$${parseFloat(mov.monto).toFixed(2)}</span></div><div class="li-row meta-text"><span>${new Date(mov.fecha).toLocaleString()} | Zeta: ${mov.no_zeta}</span><span class="badge badge-${textBadge.replace(/ /g, "-")}">${textBadge}</span></div></li>`;
        
        if (mov.tipo === 'faltante') diccSemanas[key].faltantes.push(li);
        else if (mov.tipo === 'sobrante' || mov.tipo === 'extra') diccSemanas[key].sobrantes.push(li);
        else diccSemanas[key].abonos.push(li);
    });

    let html = "";
    Object.keys(diccSemanas).forEach((semana, idx) => {
        let idF = `sw-${idx}-f`, idS = `sw-${idx}-s`, idA = `sw-${idx}-a`;
        html += `
        <details class="semana-card" ${idx === 0 ? 'open' : ''}>
            <summary class="accordion-header">${semana} <i class="ph ph-caret-down"></i></summary>
            <div class="semana-content">
                <div class="mini-tabs">
                    <div class="mini-tab active" id="tab-${idF}" onclick="cambiarMiniTab('${idx}', 'f')">Faltantes</div>
                    <div class="mini-tab" id="tab-${idS}" onclick="cambiarMiniTab('${idx}', 's')">Sobrantes</div>
                    <div class="mini-tab" id="tab-${idA}" onclick="cambiarMiniTab('${idx}', 'a')">Abonos</div>
                </div>
                <ul id="list-${idF}">${diccSemanas[semana].faltantes.join('') || '<li class="meta-text text-center py-2">Vacío</li>'}</ul>
                <ul id="list-${idS}" style="display:none;">${diccSemanas[semana].sobrantes.join('') || '<li class="meta-text text-center py-2">Vacío</li>'}</ul>
                <ul id="list-${idA}" style="display:none;">${diccSemanas[semana].abonos.join('') || '<li class="meta-text text-center py-2">Vacío</li>'}</ul>
            </div>
        </details>`;
    });
    document.getElementById('historialSemanasGerente').innerHTML = html || '<div class="meta-text text-center">No hay movimientos.</div>';
}

function cambiarMiniTab(idx, t) { ['f','s','a'].forEach(x => { document.getElementById(`tab-sw-${idx}-${x}`).classList.toggle('active', x === t); document.getElementById(`list-sw-${idx}-${x}`).style.display = (x === t) ? 'block' : 'none'; }); }

// ================= FORMULARIO AUDITORÍA (GERENTE REGISTRA) =================
function cambiarPestanaGerenteReg(tipo) {
    tipoRegistroGerente = tipo;
    document.getElementById('ger_reg_monto').value = ''; document.getElementById('ger_reg_zeta').value = ''; document.getElementById('ger_reg_extra').value = ''; document.getElementById('ger_reg_recibe').value = '';
    
    const rZ = document.getElementById('row_ger_zeta'); const rT = document.getElementById('row_ger_transfer'); const lblMonto = document.getElementById('lbl_ger_monto');

    if (tipo === 'faltante') { lblMonto.innerText = "Faltante ($)"; rZ.style.display='flex'; rT.style.display='flex'; document.getElementById('ger_reg_zeta').required=true; }
    else if (tipo === 'sobrante') { lblMonto.innerText = "Sobrante ($)"; rZ.style.display='flex'; rT.style.display='flex'; document.getElementById('ger_reg_zeta').required=true; }
    else if (tipo === 'abono') { lblMonto.innerText = "Abono ($)"; rZ.style.display='none'; rT.style.display='none'; document.getElementById('ger_reg_zeta').required=false; }
    
    document.getElementById('tab-ger-reg-faltante').classList.toggle('active', tipo === 'faltante');
    document.getElementById('tab-ger-reg-sobrante').classList.toggle('active', tipo === 'sobrante');
    document.getElementById('tab-ger-reg-abono').classList.toggle('active', tipo === 'abono');
}

document.getElementById('formRegistroGerente').addEventListener('submit', async function(e) {
    e.preventDefault();
    const montoPrincipal = parseFloat(document.getElementById('ger_reg_monto').value) || 0;
    const montoExtra = parseFloat(document.getElementById('ger_reg_extra').value) || 0;
    const receptorExtra = document.getElementById('ger_reg_recibe').value;
    let zeta = tipoRegistroGerente === 'abono' ? "N/A" : document.getElementById('ger_reg_zeta').value.trim();
    
    if (montoPrincipal === 0 && montoExtra === 0) { alert("Ingresa al menos una cantidad."); return; }

    let enviosDB = [];
    if (montoPrincipal > 0) {
        let estadoInicial = (tipoRegistroGerente === 'abono') ? 'APROBADO' : 'REAL'; 
        enviosDB.push({ tipo: tipoRegistroGerente, nombre_empleado: empleadoSeleccionado, monto: montoPrincipal, nombre_receptor: null, no_zeta: zeta, estado: estadoInicial });
    }
    if (montoExtra > 0) {
        if(receptorExtra === "") { alert("Selecciona a quién le deja el efectivo."); return; }
        enviosDB.push({ tipo: 'extra', nombre_empleado: empleadoSeleccionado, monto: montoExtra, nombre_receptor: receptorExtra, no_zeta: zeta, estado: 'REAL' });
    }

    const { error } = await clienteSupabase.from('movimientos').insert(enviosDB);
    if (error) alert(error.message); else { 
        document.getElementById('formRegistroGerente').reset(); cambiarPestanaGerenteReg('faltante'); pullGerencia(); setTimeout(renderDetallesEmpleadoModal, 400); alert("Registro guardado con éxito.");
    }
});

function abrirModalEmpleado(nombre) { 
    empleadoSeleccionado = nombre; 
    document.getElementById('tituloModalEmpleado').innerText = "Corte: " + nombre; 
    document.getElementById('nombreFormGerente').innerText = nombre; // Mostrar en form
    document.getElementById('modalEmpleadoGerente').classList.add('active'); 
    renderDetallesEmpleadoModal(); 
}
function cerrarModalEmpleado() { document.getElementById('modalEmpleadoGerente').classList.remove('active'); }

function renderDetallesEmpleadoModal() {
    const filtro = document.getElementById('filtroTiempoModal').value; const ahora = new Date(); let deudas = 0, abonos = 0; let incidenciasRango = 0;

    let movsFiltrados = dbMovimientos.filter(mov => {
        if (mov.nombre_empleado !== empleadoSeleccionado && mov.nombre_receptor !== empleadoSeleccionado) return false;
        const fMov = new Date(mov.fecha); const diffDias = Math.ceil(Math.abs(ahora - fMov) / (1000 * 60 * 60 * 24));
        return (filtro === 'todo') || (filtro === 'dia' && fMov.toDateString() === ahora.toDateString()) || (filtro === 'semana' && diffDias <= 7) || (filtro === 'mes' && fMov.getMonth() === ahora.getMonth() && fMov.getFullYear() === ahora.getFullYear());
    });

    let gruposPorDia = {};
    movsFiltrados.forEach(mov => {
        let fMov = new Date(mov.fecha); let fechaStr = fMov.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (!gruposPorDia[fechaStr]) gruposPorDia[fechaStr] = {};
        
        let zetaKey = mov.no_zeta || "Sin Zeta";
        if (!gruposPorDia[fechaStr][zetaKey]) gruposPorDia[fechaStr][zetaKey] = [];
        gruposPorDia[fechaStr][zetaKey].push(mov);

        if (mov.tipo === 'faltante' && mov.nombre_empleado === empleadoSeleccionado && mov.estado !== 'NO REAL') { deudas += parseFloat(mov.monto); }
        else if (mov.tipo === 'sobrante' && mov.nombre_empleado === empleadoSeleccionado && mov.estado !== 'NO REAL') { abonos += parseFloat(mov.monto); }
        else if (mov.tipo === 'abono' && mov.nombre_empleado === empleadoSeleccionado && mov.estado === 'APROBADO') { abonos += parseFloat(mov.monto); }
        else if (mov.tipo === 'extra' && mov.estado !== 'NO REAL') {
            if(mov.nombre_empleado === empleadoSeleccionado) { abonos += parseFloat(mov.monto); }
            if(mov.nombre_receptor === empleadoSeleccionado) { deudas += parseFloat(mov.monto); }
        }
        if ((mov.tipo === 'faltante' || mov.tipo === 'sobrante') && Math.abs(parseFloat(mov.monto)) <= 19.00) { incidenciasRango++; }
    });

    let htmlList = "";
    Object.keys(gruposPorDia).sort((a, b) => {
        let pA = a.split('/'), pB = b.split('/'); return new Date(pB[2], pB[1]-1, pB[0]) - new Date(pA[2], pA[1]-1, pA[0]);
    }).forEach(dia => {
        htmlList += `<li style="background: rgba(255,255,255,0.03); font-weight: 700; color: var(--text-main); border-left: 3px solid var(--primary); margin-top: 12px; padding: 10px 14px;"><i class="ph ph-calendar"></i> ${dia}</li>`;
        
        Object.keys(gruposPorDia[dia]).forEach(zeta => {
            htmlList += `<li style="padding-left: 25px; background: transparent; font-weight: 600; color: var(--text-muted); border-bottom: none; padding-top: 8px; padding-bottom: 4px;"><i class="ph ph-hash"></i> Zeta: ${zeta}</li>`;
            
            let totalZ = 0;
            gruposPorDia[dia][zeta].forEach(mov => {
                let textAction = ""; let impactoColor = ""; let impactoMonto = 0;
                
                if (mov.tipo === 'faltante' && mov.nombre_empleado === empleadoSeleccionado) { textAction = `FALTANTE`; impactoColor = "negativo"; impactoMonto = -parseFloat(mov.monto); }
                else if (mov.tipo === 'sobrante' && mov.nombre_empleado === empleadoSeleccionado) { textAction = `SOBRANTE`; impactoColor = "positivo"; impactoMonto = parseFloat(mov.monto); }
                else if (mov.tipo === 'abono' && mov.nombre_empleado === empleadoSeleccionado) { textAction = `ABONO EFVO`; impactoColor = "positivo"; impactoMonto = parseFloat(mov.monto); }
                else if (mov.tipo === 'extra') {
                    if(mov.nombre_empleado === empleadoSeleccionado) { textAction = `DIO A ${mov.nombre_receptor}`; impactoColor = "positivo"; impactoMonto = parseFloat(mov.monto); }
                    if(mov.nombre_receptor === empleadoSeleccionado) { textAction = `RECIBIO DE ${mov.nombre_empleado}`; impactoColor = "negativo"; impactoMonto = -parseFloat(mov.monto); }
                }

                if (mov.estado !== 'NO REAL' && (mov.tipo !== 'abono' || mov.estado === 'APROBADO')) { totalZ += impactoMonto; }

                let textBadge = mov.estado; if(mov.tipo !== 'abono' && textBadge === 'PENDIENTE') textBadge = 'REAL';

                htmlList += `<li style="padding-left: 40px; border-bottom: 1px solid rgba(255,255,255,0.02); background: rgba(0,0,0,0.15); padding-top: 10px; padding-bottom: 10px;">
                    <div class="li-row"><span style="font-size: 13px;"><i class="ph ph-dot"></i> ${textAction}</span><span class="${impactoColor}" style="font-weight:700;">${impactoMonto < 0 ? '-':'+'}$${Math.abs(impactoMonto).toFixed(2)}</span></div>
                    <div class="li-row meta-text" style="font-size: 10px; margin-top: 2px;"><span>${new Date(mov.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span><span class="badge badge-${textBadge.replace(/ /g, "-")}">${textBadge}</span></div>
                </li>`;
            });

            let colorTotalZ = totalZ > 0 ? "positivo" : (totalZ < 0 ? "negativo" : "neutro"); let signoTotalZ = totalZ > 0 ? "+" : (totalZ < 0 ? "-" : "");
            htmlList += `<li style="padding-left: 40px; background: rgba(255,255,255,0.01); border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: 700; padding-top: 8px; padding-bottom: 8px;">
                <div class="li-row"><span style="color: var(--text-muted); font-size: 11px;">TOTAL ZETA</span><span class="${colorTotalZ}">${signoTotalZ}$${Math.abs(totalZ).toFixed(2)}</span></div>
            </li>`;
        });
    });

    let neto = deudas - abonos; if (neto < 0) neto = 0;
    document.getElementById('mDeuda').innerText = `$${deudas.toFixed(2)}`; document.getElementById('mAbono').innerText = `$${abonos.toFixed(2)}`;
    document.getElementById('mIncidenciasRango').innerText = incidenciasRango; 
    document.getElementById('listaMovimientosModal').innerHTML = htmlList || '<li class="meta-text text-center">Sin registros.</li>';
}

async function cambiarEstadoModal(id, v) { await clienteSupabase.from('movimientos').update({ estado: v }).eq('id', id); pullGerencia(); setTimeout(renderDetallesEmpleadoModal, 300); }

// ================= PANEL DEV =================
function renderPanelDev() {
    let html = "";
    dbUsuarios.forEach(u => { html += `<tr><td><strong>${u.nombre}</strong></td><td class="text-warning">${u.password}</td><td>${u.rol.toUpperCase()}</td><td><input type="checkbox" ${u.ver_sobrante ? 'checked':''} onchange="togglePermisoDev(${u.id}, this.checked)"></td><td><button class="dev-btn-del" onclick="borrarUsuarioDev(${u.id}, '${u.nombre}')"><i class="ph ph-trash"></i></button></td></tr>`; });
    document.getElementById('tablaUsuariosDev').innerHTML = html;
}

document.getElementById('formNuevoUsuario').addEventListener('submit', async function(e) {
    e.preventDefault();
    const nom = document.getElementById('dev_nuevo_user').value.toUpperCase().trim(); 
    const pwd = document.getElementById('dev_nuevo_pass').value; 
    const rol = document.getElementById('dev_nuevo_rol').value; 
    const ver = document.getElementById('dev_nuevo_ver').value === 'true';
    
    // Le inyectamos el 'requiere_cambio_pwd: true' para obligarlo a cambiarla
    const { error } = await clienteSupabase.from('usuarios_app').insert([{ 
        nombre: nom, 
        password: pwd, 
        rol: rol, 
        ver_sobrante: ver,
        requiere_cambio_pwd: true 
    }]);
    
    if(error) alert(error.message); else { 
        document.getElementById('formNuevoUsuario').reset(); 
        await cargarUsuariosGlobales(); 
        renderPanelDev(); 
        alert("Usuario creado. Deberá cambiar su clave al entrar.");
    }
});
// Función para poner la fecha de hoy en el input
function setFechaPorDefecto() {
  const inputFecha = document.getElementById('fecha_corte');
  const hoy = new Date();
  
  // Formatear a YYYY-MM-DD que es lo que pide el input type="date"
  const año = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  
  inputFecha.value = `${año}-${mes}-${dia}`;
}

// Ejecutarla cuando cargue el form
setFechaPorDefecto();

async function togglePermisoDev(id, val) { await clienteSupabase.from('usuarios_app').update({ ver_sobrante: val }).eq('id', id); await cargarUsuariosGlobales(); renderPanelDev(); }
async function borrarUsuarioDev(id, nombre) { if(confirm("¿Borrar a " + nombre + "?")) { await clienteSupabase.from('usuarios_app').delete().eq('id', id); await cargarUsuariosGlobales(); renderPanelDev(); } }

function renderDonutChart(cId, cRef, pagado, pendiente, setRef) {
    const ctx = document.getElementById(cId).getContext('2d'); if (cRef) cRef.destroy();
    if (pagado === 0 && pendiente === 0) pendiente = 1;
    setRef(new Chart(ctx, { type: 'doughnut', data: { labels: ['Pagado', 'Pendiente'], datasets: [{ data: [pagado, pendiente], backgroundColor: ['#16a34a', '#27272a'], borderWidth: 0 }] }, options: { responsive: true, plugins: { legend: { display: false } }, cutout: '75%' } }));
}
function cerrarSesion() { localStorage.removeItem('sesionCaja'); window.location.href = "index.html"; }

arrancarApp();