import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

/* ================= utilidades ================= */
const pesos = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

const hoy = () => new Date().toISOString().slice(0, 10)

const METODOS_PAGO = ['Nequi', 'Efectivo', 'Transferencia', 'Daviplata', 'Tarjeta']

function Toast({ msg }) {
  if (!msg) return null
  return <div className="toast" role="status">{msg}</div>
}

/* ================= login ================= */
function Login({ onListo }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setCargando(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    setCargando(false)
    if (error) setError('Correo o contraseña incorrectos. Revisa e intenta de nuevo.')
    else onListo()
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">NeuroExplora<small>Dra. Karen Pérez Pareja · Neuropsicología Clínica</small></div>
        <form onSubmit={entrar}>
          <label className="field">Correo
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field">Contraseña
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} required autoComplete="current-password" />
          </label>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primario" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}

/* ================= buscador de paciente ================= */
function BuscadorPaciente({ elegido, onElegir }) {
  const [q, setQ] = useState('')
  const [sug, setSug] = useState([])

  useEffect(() => {
    if (!q || q.length < 2) { setSug([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('pacientes')
        .select('id, nombres, apellidos, documento')
        .or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,documento.ilike.%${q}%`)
        .limit(6)
      setSug(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  if (elegido) return (
    <div className="pac-elegido">
      <span>{elegido.nombres} {elegido.apellidos} · {elegido.documento}</span>
      <button type="button" onClick={() => onElegir(null)}>Cambiar</button>
    </div>
  )

  return (
    <div>
      <label className="field">Paciente
        <input placeholder="Buscar por nombre o cédula…" value={q} onChange={e => setQ(e.target.value)} />
      </label>
      {sug.length > 0 && (
        <div className="sugerencias">
          {sug.map(p => (
            <button key={p.id} type="button" onClick={() => { onElegir(p); setQ(''); setSug([]) }}>
              <b>{p.nombres} {p.apellidos}</b> — {p.documento}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ================= tarjeta de autorización / plan ================= */
function TarjetaAutorizacion({ a, modo, onMasUna, onCompletar, onAbono }) {
  const abierta = a.sesiones_autorizadas == null   // terapia continua
  const total = a.sesiones_autorizadas
  const hechas = a.sesiones_ejecutadas
  const lista = !abierta && hechas >= total
  const vencida = a.fecha_vencimiento && a.fecha_vencimiento < hoy() && !lista
  const p = a.pacientes

  // Si incluye primera vez: la 1ª sesión vale $45.000 y las demás el valor normal
  const calcSesiones = (n) => a.incluye_primera_vez
    ? (n > 0 ? 45000 + (n - 1) * a.valor_por_sesion : 0)
    : n * a.valor_por_sesion
  const valorPlan = calcSesiones(abierta ? hechas : total)
    + Number(a.valor_entrevista || 0) + Number(a.valor_entrega || 0)
  const abonado = (a.pagos || []).reduce((s, x) => s + Number(x.valor), 0)
  const saldo = valorPlan - abonado
  const entregaPendientePago = modo === 'consultorio' && !abierta && lista && saldo > 0

  return (
    <article className="auto-card">
      <header>
        <div>
          <div className="auto-nombre">{p?.nombres} {p?.apellidos}</div>
          <div className="auto-meta">
            {modo === 'sinai'
              ? <>{a.eps?.nombre || 'Sin EPS'}</>
              : <>Particular · {a.plan_nombre || a.numero_autorizacion || (abierta ? 'Terapia continua' : 'Plan de atención')}</>}
            {a.incluye_primera_vez && ' · incluye 1ª vez'}
          </div>
          {vencida && <div className="vencida">⚠ Autorización vencida el {a.fecha_vencimiento}</div>}
          {entregaPendientePago && <div className="vencida">⚠ La entrega del informe se agenda al completar el pago</div>}
        </div>
        <div className="fraccion">
          {hechas}{abierta ? <small> sesiones</small> : <small>/{total}</small>}
        </div>
      </header>

      {!abierta && (total <= 20 ? (
        <div className="puntos" aria-label={`${hechas} de ${total} sesiones`}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={'punto' + (i < hechas ? ' lleno' : '')} />
          ))}
          {hechas > total && Array.from({ length: hechas - total }).map((_, i) => (
            <span key={'x' + i} className="punto extra" title="Sesión extra" />
          ))}
        </div>
      ) : (
        <div className="barra"><div style={{ width: Math.min(100, (hechas / total) * 100) + '%' }} /></div>
      ))}

      {modo === 'consultorio' && (
        <div className="abono-linea">
          <span>Abonado <b>{pesos(abonado)}</b> de {pesos(valorPlan)}</span>
          {saldo > 0
            ? <span className="chip-saldo">Debe {pesos(saldo)}</span>
            : <span className="chip-listo">✓ Pagado</span>}
        </div>
      )}

      <div className="auto-pie">
        <div className="auto-valor">
          {modo === 'sinai'
            ? <>{pesos(a.valor_por_sesion)}/sesión · acumulado <b>{pesos(calcSesiones(hechas))}</b></>
            : <>{pesos(a.valor_por_sesion)}/sesión</>}
          {hechas > 0 && a.actualizado_en && (
            <div className="ultima-sesion">Última: {new Date(a.actualizado_en).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hechas > 0 && !lista && (
            <button className="btn-menos" aria-label="Corregir: restar una sesión"
              onClick={() => { if (window.confirm(`¿Restar una sesión a ${p?.nombres}? Quedaría en ${hechas - 1}.`)) onMasUna(a, -1) }}>−</button>
          )}
          {modo === 'consultorio' && saldo > 0 && (
            <button className="btn-abono" onClick={() => onAbono(a, saldo)}>+ Abono</button>
          )}
          {lista
            ? (modo === 'sinai' && <span className="chip-listo">✓ Listo para cobrar</span>)
            : <button className="btn-mas1" onClick={() => onMasUna(a, 1)}>+1 sesión</button>}
        </div>
      </div>
      {lista && (modo === 'sinai' || saldo <= 0) && (
        <button className="btn-fantasma" onClick={() => onCompletar(a)}>
          {modo === 'sinai' ? 'Marcar como facturada' : 'Cerrar plan'}
        </button>
      )}
      {abierta && hechas > 0 && saldo <= 0 && (
        <button className="btn-fantasma" onClick={() => onCompletar(a)}>Cerrar terapia (paciente terminó)</button>
      )}
    </article>
  )
}

/* ================= modal ABONO ================= */
function ModalAbono({ plan, saldo, onCerrar, onGuardado }) {
  const [valor, setValor] = useState('')
  const [metodo, setMetodo] = useState('Nequi')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('pagos').insert({
      autorizacion_id: plan.id,
      paciente_id: plan.paciente_id,
      fecha: hoy(),
      valor: Number(valor),
      metodo
    })
    setGuardando(false)
    if (err) setError('No se pudo registrar: ' + err.message)
    else onGuardado()
  }

  return (
    <div className="modal-fondo" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>Registrar abono</h2>
        <p className="subtitulo">{plan.pacientes?.nombres} {plan.pacientes?.apellidos} · saldo {pesos(saldo)}</p>
        <form onSubmit={guardar}>
          <label className="field">Valor del abono
            <input type="number" step="1000" min="1000" value={valor}
              onChange={e => setValor(e.target.value)} required autoFocus inputMode="numeric" />
          </label>
          <label className="field">Método de pago
            <select value={metodo} onChange={e => setMetodo(e.target.value)}>
              {METODOS_PAGO.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-acciones">
            <button type="button" className="btn-fantasma" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar abono'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ================= pestaña SESIONES (autorizaciones y planes) ================= */
function Autorizaciones({ notificar }) {
  const [lista, setLista] = useState(null)
  const [modo, setModo] = useState('sinai') // 'sinai' | 'consultorio'
  const [modal, setModal] = useState(false)
  const [abono, setAbono] = useState(null) // { plan, saldo }

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('autorizaciones')
      .select('*, pacientes(nombres, apellidos, documento), eps(nombre), clinicas(nombre), pagos(valor)')
      .eq('estado', 'activa')
      .order('creado_en', { ascending: false })
    setLista(data || [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const filtradas = (lista || []).filter(a =>
    modo === 'sinai'
      ? a.clinicas?.nombre === 'Monte Sinaí'
      : a.clinicas?.nombre !== 'Monte Sinaí')

  const masUna = async (a, delta = 1) => {
    const nuevas = Math.max(0, a.sesiones_ejecutadas + delta)
    setLista(l => l.map(x => x.id === a.id ? { ...x, sesiones_ejecutadas: nuevas } : x))
    const { error } = await supabase.from('autorizaciones')
      .update({ sesiones_ejecutadas: nuevas, actualizado_en: new Date().toISOString() })
      .eq('id', a.id)
    if (error) { notificar('No se pudo guardar. Intenta de nuevo.'); cargar() }
    else if (delta < 0) notificar(`Corregido: ${nuevas} sesiones`)
    else if (a.sesiones_autorizadas != null && nuevas >= a.sesiones_autorizadas) {
      // Sesiones completas: si hay proceso vinculado, pasa solo a Pendiente Informe
      if (a.proceso_id) {
        await supabase.from('procesos')
          .update({ estado: 'PENDIENTE_INFORME' }).eq('id', a.proceso_id)
        notificar(`¡${a.pacientes?.nombres} completó sus sesiones! 📝 Informe pendiente`)
      } else {
        notificar(`¡${a.pacientes?.nombres} completó sus sesiones! 🎉`)
      }
    }
    else notificar(a.sesiones_autorizadas != null
      ? `Sesión ${nuevas}/${a.sesiones_autorizadas} registrada`
      : `Sesión ${nuevas} registrada`)
  }

  const completar = async (a) => {
    const { error } = await supabase.from('autorizaciones')
      .update({ estado: 'completada' }).eq('id', a.id)
    if (!error) { notificar(modo === 'sinai' ? 'Marcada como facturada' : 'Plan cerrado ✓'); cargar() }
  }

  return (
    <>
      <h1 className="titulo-seccion">Sesiones</h1>
      <div className="segmento">
        <button className={modo === 'sinai' ? 'activo' : ''} onClick={() => setModo('sinai')}>Monte Sinaí</button>
        <button className={modo === 'consultorio' ? 'activo' : ''} onClick={() => setModo('consultorio')}>Consultorio</button>
      </div>
      <p className="subtitulo">
        {modo === 'sinai'
          ? 'Sesiones autorizadas por la EPS · toca +1 al terminar cada sesión'
          : 'Torre 33, Consultorio 215 · planes particulares con abonos'}
      </p>
      {lista === null ? <div className="cargando">Cargando…</div> :
        filtradas.length === 0 ? (
          <div className="vacio"><b>{modo === 'sinai' ? 'Sin autorizaciones activas' : 'Sin planes activos'}</b>Crea el primero con el botón naranja +</div>
        ) : (
          <div className="pila">
            {filtradas.map(a => (
              <TarjetaAutorizacion key={a.id} a={a} modo={modo}
                onMasUna={masUna} onCompletar={completar}
                onAbono={(plan, saldo) => setAbono({ plan, saldo })} />
            ))}
          </div>
        )}
      <button className="fab" aria-label="Nuevo" onClick={() => setModal(true)}>+</button>
      {modal && <NuevaAutorizacion clinicaDefault={modo}
        onCerrar={() => setModal(false)}
        onCreada={() => { setModal(false); cargar(); notificar(modo === 'sinai' ? 'Autorización creada' : 'Plan creado') }} />}
      {abono && <ModalAbono plan={abono.plan} saldo={abono.saldo}
        onCerrar={() => setAbono(null)}
        onGuardado={() => { setAbono(null); cargar(); notificar('Abono registrado ✓') }} />}
    </>
  )
}

/* ================= modal NUEVA autorización / plan ================= */
const PLANTILLAS = [
  { id: 'eval_inf',  nombre: 'Evaluación Neuropsicológica Infantil',  sesiones: 4,    valor: 105000, entrevista: 125000, entrega: 125000, abierto: false },
  { id: 'eval_adu',  nombre: 'Evaluación Neuropsicológica Adultos',   sesiones: 3,    valor: 105000, entrevista: 130000, entrega: 125000, abierto: false },
  { id: 'eval_ci',   nombre: 'Evaluación de Inteligencia (CI)',       sesiones: 1,    valor: 340000, entrevista: 0,      entrega: 0,      abierto: false },
  { id: 'reh_ses',   nombre: 'Rehabilitación Neuropsicológica · por sesión', sesiones: null, valor: 125000, entrevista: 0, entrega: 0,   abierto: true },
  { id: 'est_ses',   nombre: 'Estimulación Cognitiva · por sesión',   sesiones: null, valor: 125000, entrevista: 0,      entrega: 0,      abierto: true },
  { id: 'cons_line', nombre: 'Consulta en línea',                     sesiones: null, valor: 150000, entrevista: 0,      entrega: 0,      abierto: true },
  { id: 'reh_online',nombre: 'Rehabilitación Online Diaria · mensualidad', sesiones: null, valor: 300000, entrevista: 0, entrega: 0,      abierto: true },
  { id: 'reh_avanza',nombre: 'Paquete Neuro Avanza (5 sesiones)',     sesiones: 5,    valor: 102000, entrevista: 0,      entrega: 0,      abierto: false },
  { id: 'reh_crece', nombre: 'Paquete Neuro Crece (10 sesiones)',     sesiones: 10,   valor: 90000,  entrevista: 0,      entrega: 0,      abierto: false },
  { id: 'custom',    nombre: 'Personalizado…',                        sesiones: 4,    valor: '',     entrevista: 0,      entrega: 0,      abierto: false },
]

function NuevaAutorizacion({ clinicaDefault, onCerrar, onCreada }) {
  const esSinai = clinicaDefault === 'sinai'
  const [paciente, setPaciente] = useState(null)
  const [epsList, setEpsList] = useState([])
  const [plantilla, setPlantilla] = useState('')
  const [tipoPlan, setTipoPlan] = useState('paquete') // 'paquete' | 'abierto'
  const [f, setF] = useState({
    eps_id: '', numero_autorizacion: '', sesiones_autorizadas: esSinai ? 10 : 4,
    valor_por_sesion: esSinai ? 77000 : '', valor_entrevista: 0, valor_entrega: 0,
    plan_nombre: '', incluye_primera_vez: false, fecha_vencimiento: ''
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const abierto = !esSinai && tipoPlan === 'abierto'

  const aplicarPlantilla = (id) => {
    setPlantilla(id)
    const t = PLANTILLAS.find(x => x.id === id)
    if (!t) return
    setTipoPlan(t.abierto ? 'abierto' : 'paquete')
    setF(prev => ({
      ...prev,
      plan_nombre: t.id === 'custom' ? '' : t.nombre,
      sesiones_autorizadas: t.sesiones ?? prev.sesiones_autorizadas,
      valor_por_sesion: t.valor,
      valor_entrevista: t.entrevista,
      valor_entrega: t.entrega
    }))
  }

  const totalPlan = abierto ? null
    : Number(f.sesiones_autorizadas || 0) * Number(f.valor_por_sesion || 0)
      + Number(f.valor_entrevista || 0) + Number(f.valor_entrega || 0)

  useEffect(() => {
    supabase.from('eps').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setEpsList(data || []))
  }, [])

  const guardar = async (e) => {
    e.preventDefault()
    if (!paciente) { setError('Selecciona el paciente'); return }
    setGuardando(true); setError('')
    const nombreClinica = esSinai ? 'Monte Sinaí' : 'Consultorio'
    const { data: clin } = await supabase.from('clinicas').select('id').eq('nombre', nombreClinica).single()
    let epsId = f.eps_id || null
    if (!esSinai && !epsId) {
      const { data: part } = await supabase.from('eps').select('id').eq('nombre', 'Particular').single()
      epsId = part?.id || null
    }
    // Si es una evaluación del consultorio, crear el proceso vinculado
    // (aparece en el Kanban y permite el seguimiento del informe)
    let procesoId = null
    const esEvaluacion = !esSinai && ['eval_inf', 'eval_adu', 'eval_ci'].includes(plantilla)
    if (esEvaluacion) {
      const { data: proc } = await supabase.from('procesos').insert({
        paciente_id: paciente.id, tipo: 'evaluacion',
        estado: 'EN_EVALUACION', fecha_inicio: hoy()
      }).select().single()
      procesoId = proc?.id || null
    }
    const { error: err } = await supabase.from('autorizaciones').insert({
      paciente_id: paciente.id,
      proceso_id: procesoId,
      clinica_id: clin?.id,
      eps_id: epsId,
      numero_autorizacion: f.numero_autorizacion || null,
      plan_nombre: f.plan_nombre || (abierto ? 'Terapia continua' : null),
      sesiones_autorizadas: abierto ? null : Number(f.sesiones_autorizadas),
      valor_por_sesion: Number(f.valor_por_sesion),
      valor_entrevista: Number(f.valor_entrevista || 0),
      valor_entrega: Number(f.valor_entrega || 0),
      incluye_primera_vez: f.incluye_primera_vez,
      fecha_autorizacion: hoy(),
      fecha_vencimiento: f.fecha_vencimiento || null
    })
    setGuardando(false)
    if (err) setError('No se pudo crear: ' + err.message)
    else onCreada()
  }

  return (
    <div className="modal-fondo" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>{esSinai ? 'Nueva autorización · Monte Sinaí' : 'Nuevo plan · Consultorio'}</h2>
        <form onSubmit={guardar}>
          <BuscadorPaciente elegido={paciente} onElegir={setPaciente} />
          {!esSinai && (
            <label className="field">Plan
              <select value={plantilla} onChange={e => aplicarPlantilla(e.target.value)} required>
                <option value="">— Seleccionar plan —</option>
                {PLANTILLAS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
          )}
          {!esSinai && plantilla === 'reh_online' && (
            <div className="total-plan">
              Programa mensual online ($300.000/mes). Cada <b>+1 sesión = 1 mes</b> del programa; registra el abono de la mensualidad al recibirla.
            </div>
          )}
          {!esSinai && plantilla === 'custom' && (
            <div className="segmento" style={{ justifySelf: 'start' }}>
              <button type="button" className={tipoPlan === 'paquete' ? 'activo' : ''} onClick={() => setTipoPlan('paquete')}>Paquete</button>
              <button type="button" className={tipoPlan === 'abierto' ? 'activo' : ''} onClick={() => setTipoPlan('abierto')}>Terapia continua</button>
            </div>
          )}
          {esSinai && (
            <label className="field">EPS que autoriza
              <select value={f.eps_id} onChange={e => setF({ ...f, eps_id: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {epsList.map(e2 => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
              </select>
            </label>
          )}
          {(() => {
            const esCustom = plantilla === 'custom'
            const planDefinido = !esSinai && plantilla && !esCustom
            return (
              <>
                <div className="fila-2">
                  {!esSinai && (
                    <label className="field">Concepto (opcional)
                      <input value={f.numero_autorizacion}
                        placeholder={abierto ? 'Ej: Terapia semanal' : 'Ej: Remitido por neurología'}
                        onChange={e => setF({ ...f, numero_autorizacion: e.target.value })} />
                    </label>
                  )}
                  {esSinai && (
                    <label className="field">Sesiones autorizadas
                      <input type="number" min="1" max="60" value={f.sesiones_autorizadas}
                        onChange={e => setF({ ...f, sesiones_autorizadas: e.target.value })} required />
                    </label>
                  )}
                  <label className="field">Vence
                    <input type="date" value={f.fecha_vencimiento}
                      onChange={e => setF({ ...f, fecha_vencimiento: e.target.value })} />
                  </label>
                </div>
                {esSinai && (
                  <label className="field">Valor por sesión
                    <input type="number" step="1000" value={f.valor_por_sesion}
                      onChange={e => setF({ ...f, valor_por_sesion: e.target.value })} required />
                  </label>
                )}
                {esCustom && (
                  <>
                    <div className="fila-2">
                      {!abierto && (
                        <label className="field">N° de sesiones
                          <input type="number" min="1" max="60" value={f.sesiones_autorizadas}
                            onChange={e => setF({ ...f, sesiones_autorizadas: e.target.value })} required />
                        </label>
                      )}
                      <label className="field">Valor por sesión
                        <input type="number" step="1000" value={f.valor_por_sesion}
                          placeholder="Tarifa particular"
                          onChange={e => setF({ ...f, valor_por_sesion: e.target.value })} required />
                      </label>
                    </div>
                    {!abierto && (
                      <div className="fila-2">
                        <label className="field">Entrevista inicial ($)
                          <input type="number" step="1000" value={f.valor_entrevista}
                            onChange={e => setF({ ...f, valor_entrevista: e.target.value })} />
                        </label>
                        <label className="field">Entrega de informe ($)
                          <input type="number" step="1000" value={f.valor_entrega}
                            onChange={e => setF({ ...f, valor_entrega: e.target.value })} />
                        </label>
                      </div>
                    )}
                  </>
                )}
                {planDefinido && !abierto && totalPlan > 0 && (
                  <div className="total-plan">
                    {Number(f.valor_entrevista) > 0 && <span>Entrevista {pesos(f.valor_entrevista)} · </span>}
                    {f.sesiones_autorizadas} sesiones de evaluación × {pesos(f.valor_por_sesion)}
                    {Number(f.valor_entrega) > 0 && <span> · Entrega de informe {pesos(f.valor_entrega)}</span>}
                    <b> = {pesos(totalPlan)}</b>
                  </div>
                )}
                {planDefinido && abierto && plantilla !== 'reh_online' && (
                  <div className="total-plan">
                    <b>{pesos(f.valor_por_sesion)}</b> por sesión · sin límite de sesiones
                  </div>
                )}
                {esCustom && !abierto && totalPlan > 0 && (
                  <div className="total-plan"><b>Total del plan: {pesos(totalPlan)}</b></div>
                )}
              </>
            )
          })()}
          {esSinai && (
            <label className="check">
              <input type="checkbox" checked={f.incluye_primera_vez}
                onChange={e => setF({ ...f, incluye_primera_vez: e.target.checked })} />
              La primera sesión es consulta de primera vez ($45.000)
            </label>
          )}
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-acciones">
            <button type="button" className="btn-fantasma" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : (esSinai ? 'Crear autorización' : 'Crear plan')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ================= modal VENTA (juguetes cognitivos) ================= */
function ModalVenta({ onCerrar, onGuardada }) {
  const [f, setF] = useState({ producto: '', valor: '', metodo: 'Efectivo', cliente_nombre: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('ventas').insert({
      fecha: hoy(),
      producto: f.producto.trim(),
      valor: Number(f.valor),
      metodo: f.metodo,
      cliente_nombre: f.cliente_nombre.trim() || null
    })
    setGuardando(false)
    if (err) setError('No se pudo registrar: ' + err.message)
    else onGuardada()
  }

  return (
    <div className="modal-fondo" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>Registrar venta</h2>
        <p className="subtitulo">Juguetes y material cognitivo</p>
        <form onSubmit={guardar}>
          <label className="field">Producto
            <input value={f.producto} placeholder="Ej: Tangram, memoria de fichas…"
              onChange={e => setF({ ...f, producto: e.target.value })} required autoFocus />
          </label>
          <div className="fila-2">
            <label className="field">Valor
              <input type="number" step="500" min="500" value={f.valor}
                onChange={e => setF({ ...f, valor: e.target.value })} required inputMode="numeric" />
            </label>
            <label className="field">Método
              <select value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>
                {METODOS_PAGO.map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label className="field">Cliente (opcional)
            <input value={f.cliente_nombre} placeholder="Nombre de quien compra"
              onChange={e => setF({ ...f, cliente_nombre: e.target.value })} />
          </label>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-acciones">
            <button type="button" className="btn-fantasma" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar venta'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ================= pestaña PARA COBRAR ================= */
function ParaCobrar({ notificar }) {
  const [filas, setFilas] = useState(null)
  const [saldos, setSaldos] = useState([])
  const [ventas, setVentas] = useState([])
  const [modalVenta, setModalVenta] = useState(false)

  const cargar = useCallback(() => {
    const inicioMes = hoy().slice(0, 8) + '01'
    Promise.all([
      supabase.from('v_listo_para_cobrar').select('*'),
      supabase.from('v_saldos_consultorio').select('*'),
      supabase.from('ventas').select('*').gte('fecha', inicioMes).order('fecha', { ascending: false })
    ]).then(([a, b, c]) => {
      setFilas(a.data || [])
      setSaldos(b.data || [])
      setVentas(c.data || [])
    })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (filas === null) return <div className="cargando">Cargando…</div>

  const sinai = filas.filter(f => f.clinica === 'Monte Sinaí')
  const listos = sinai.filter(f => f.estado_cobro?.includes('LISTO'))
  const enProgreso = sinai.filter(f => !f.estado_cobro?.includes('LISTO'))
  const total = listos.reduce((s, f) => s + Number(f.valor_total_con_primera_vez || 0), 0)
  const totalSaldos = saldos.reduce((s, f) => s + Number(f.saldo || 0), 0)

  return (
    <>
      <h1 className="titulo-seccion">Para cobrar</h1>
      <p className="subtitulo">Monte Sinaí · {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</p>

      <div className="total-banner">
        <div className="detalle">{listos.length} paciente{listos.length !== 1 && 's'} con sesiones completas</div>
        <div className="cifra">{pesos(total)}</div>
        <div className="detalle">listo para la cuenta de cobro de Monte Sinaí</div>
      </div>

      <div className="pila" style={{ marginTop: 16 }}>
        {listos.map((f, i) => (
          <div className="cobrar-item" key={i}>
            <div>
              <b>{f.paciente}</b>
              <div className="auto-meta">{f.eps} · {f.sesiones_ejecutadas} sesiones{f.numero_autorizacion ? ` · Aut. ${f.numero_autorizacion}` : ''}</div>
            </div>
            <div className="monto">{pesos(f.valor_total_con_primera_vez)}</div>
          </div>
        ))}
        {listos.length === 0 && <div className="vacio"><b>Nada listo aún</b>Cuando un paciente complete sus sesiones aparecerá aquí.</div>}
      </div>

      {enProgreso.length > 0 && (
        <>
          <h1 className="titulo-seccion" style={{ fontSize: 18, marginTop: 26 }}>En progreso · Monte Sinaí</h1>
          <div className="pila">
            {enProgreso.map((f, i) => (
              <div className="cobrar-item" key={i}>
                <div><b>{f.paciente}</b><div className="auto-meta">{f.eps}</div></div>
                <span className="chip-progreso">{f.sesiones_ejecutadas}/{f.sesiones_autorizadas}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h1 className="titulo-seccion" style={{ fontSize: 18, marginTop: 26 }}>Saldos pendientes · Consultorio</h1>
      {saldos.length === 0
        ? <div className="vacio">Sin saldos pendientes de pacientes particulares. 🎉</div>
        : (
          <>
            <p className="subtitulo">Total por cobrar a particulares: <b style={{ color: 'var(--ambar)' }}>{pesos(totalSaldos)}</b></p>
            <div className="pila">
              {saldos.map((f, i) => (
                <div className="cobrar-item" key={i}>
                  <div>
                    <b>{f.paciente}</b>
                    <div className="auto-meta">{f.concepto || 'Plan de atención'} · abonado {pesos(f.abonado)} de {pesos(f.valor_plan)}</div>
                  </div>
                  <div className="monto">{pesos(f.saldo)}</div>
                </div>
              ))}
            </div>
          </>
        )}

      <div className="seccion-header">
        <h1 className="titulo-seccion" style={{ fontSize: 18, marginTop: 26 }}>Ventas de juguetes · este mes</h1>
        <button className="btn-abono" onClick={() => setModalVenta(true)}>+ Venta</button>
      </div>
      {ventas.length === 0
        ? <div className="vacio">Sin ventas registradas este mes.</div>
        : (
          <>
            <p className="subtitulo">Total del mes: <b style={{ color: 'var(--pino)' }}>{pesos(ventas.reduce((s, v) => s + Number(v.valor), 0))}</b> · {ventas.length} venta{ventas.length !== 1 && 's'}</p>
            <div className="pila">
              {ventas.slice(0, 10).map(v => (
                <div className="cobrar-item" key={v.id}>
                  <div>
                    <b>{v.producto}</b>
                    <div className="auto-meta">{new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · {v.metodo}{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}</div>
                  </div>
                  <div className="monto" style={{ color: 'var(--pino)' }}>{pesos(v.valor)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      {modalVenta && <ModalVenta onCerrar={() => setModalVenta(false)}
        onGuardada={() => { setModalVenta(false); cargar(); notificar('Venta registrada ✓') }} />}
    </>
  )
}

/* ================= ficha del paciente (historial) ================= */
function FichaPaciente({ paciente, onCerrar, notificar }) {
  const [datos, setDatos] = useState(null)
  const [pruebasCat, setPruebasCat] = useState([])

  const cargar = useCallback(() => {
    Promise.all([
      supabase.from('procesos')
        .select('id, tipo, estado, estado_kanban, fecha_inicio, observaciones, sesiones(count), aplicaciones_prueba(id, pruebas(id, sigla))')
        .eq('paciente_id', paciente.id)
        .order('fecha_inicio', { ascending: false }),
      supabase.from('autorizaciones')
        .select('*, pagos(valor, fecha, metodo), clinicas(nombre)')
        .eq('paciente_id', paciente.id)
        .order('creado_en', { ascending: false }),
      supabase.from('pacientes')
        .select('*, eps(nombre)')
        .eq('id', paciente.id).single(),
      supabase.from('pruebas').select('id, sigla, nombre').eq('activo', true).order('sigla')
    ]).then(([pr, au, pa, pc]) => {
      setDatos({ procesos: pr.data || [], autorizaciones: au.data || [], perfil: pa.data })
      setPruebasCat(pc.data || [])
    })
  }, [paciente.id])

  useEffect(() => { cargar() }, [cargar])

  const agregarPrueba = async (procesoId, pruebaId) => {
    if (!pruebaId) return
    const { error } = await supabase.from('aplicaciones_prueba').insert({
      proceso_id: procesoId, prueba_id: Number(pruebaId),
      aplicada: true, fecha_aplicacion: hoy()
    })
    if (error) notificar?.(error.code === '23505' ? 'Esa prueba ya está registrada' : 'No se pudo registrar')
    else { notificar?.('Prueba registrada ✓'); cargar() }
  }

  const quitarPrueba = async (aplicacionId, sigla) => {
    if (!window.confirm(`¿Quitar ${sigla} de este proceso?`)) return
    const { error } = await supabase.from('aplicaciones_prueba').delete().eq('id', aplicacionId)
    if (!error) { notificar?.('Prueba retirada'); cargar() }
  }

  const nuevaValoracion = async () => {
    const { error } = await supabase.from('procesos').insert({
      paciente_id: paciente.id, tipo: 'evaluacion', estado: 'NUEVO', fecha_inicio: hoy()
    })
    if (error) notificar?.('No se pudo crear el proceso')
    else { notificar?.('Nueva valoración creada ✓ (ya está en el tablero)'); cargar() }
  }

  const procesoActivo = (e) => !['PROCESO_CERRADO', 'CANCELADO', 'REMITIDO'].includes(e)

  const totalSesiones = (datos?.procesos || [])
    .reduce((s, p) => s + (p.sesiones?.[0]?.count || 0), 0)
  const primeraVisita = (datos?.procesos || []).length
    ? datos.procesos[datos.procesos.length - 1].fecha_inicio : null

  return (
    <div className="modal-fondo" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>{paciente.nombres} {paciente.apellidos}</h2>
        {!datos ? <div className="cargando">Cargando historial…</div> : (
          <>
            <p className="subtitulo" style={{ marginBottom: 12 }}>
              {datos.perfil?.tipo_documento} {datos.perfil?.documento}
              {datos.perfil?.eps?.nombre && <> · {datos.perfil.eps.nombre}</>}
              {datos.perfil?.telefono && <> · {datos.perfil.telefono}</>}
            </p>

            <div className="resumen-ficha">
              <div><b>{datos.procesos.length}</b><span>procesos</span></div>
              <div><b>{totalSesiones}</b><span>sesiones</span></div>
              <div><b>{primeraVisita ? primeraVisita.slice(0, 4) : '—'}</b><span>desde</span></div>
            </div>

            {datos.procesos.length === 0 && datos.autorizaciones.length === 0 && (
              <div className="vacio"><b>Paciente nuevo</b>Sin historial todavía. Usa "＋ Nueva valoración" para arrancar su primer proceso.</div>
            )}

            {datos.autorizaciones.length > 0 && (
              <>
                <h3 className="ficha-titulo">Autorizaciones y planes</h3>
                <div className="pila">
                  {datos.autorizaciones.map(a => {
                    const abonado = (a.pagos || []).reduce((s, x) => s + Number(x.valor), 0)
                    return (
                      <div className="ficha-item" key={a.id}>
                        <div>
                          <b>{a.clinicas?.nombre || '—'}</b> · {a.sesiones_ejecutadas}/{a.sesiones_autorizadas} sesiones
                          <div className="auto-meta">
                            {a.estado === 'activa' ? '🟢 Activa' : a.estado}
                            {abonado > 0 && <> · abonado {pesos(abonado)}</>}
                          </div>
                          {(a.pagos || []).length > 0 && (
                            <div className="pagos-lista">
                              {a.pagos.map((pg, i) => (
                                <span key={i} className="pago-chip">{new Date(pg.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · {pesos(pg.valor)} ({pg.metodo})</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {datos.procesos.length > 0 && (
              <>
                <h3 className="ficha-titulo">Historial de procesos</h3>
                <div className="pila">
                  {datos.procesos.map(p => (
                    <div className="ficha-item" key={p.id}>
                      <div>
                        <b>{p.tipo}</b> · {p.fecha_inicio}
                        <div className="auto-meta">
                          {p.estado_kanban || p.estado}
                          {p.sesiones?.[0]?.count > 0 && <> · {p.sesiones[0].count} sesión{p.sesiones[0].count !== 1 && 'es'}</>}
                        </div>
                        {(p.aplicaciones_prueba || []).length > 0 && (
                          <div className="pruebas-lista">
                            {p.aplicaciones_prueba.map(ap => (
                              <span key={ap.id} className="prueba-chip">
                                {ap.pruebas?.sigla}
                                {procesoActivo(p.estado) && (
                                  <button aria-label={`Quitar ${ap.pruebas?.sigla}`}
                                    onClick={() => quitarPrueba(ap.id, ap.pruebas?.sigla)}>×</button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        {procesoActivo(p.estado) && (
                          <select className="agregar-prueba" value=""
                            onChange={e => agregarPrueba(p.id, e.target.value)}>
                            <option value="">＋ Registrar prueba aplicada…</option>
                            {pruebasCat
                              .filter(pc => !(p.aplicaciones_prueba || []).some(ap => ap.pruebas?.id === pc.id))
                              .map(pc => <option key={pc.id} value={pc.id}>{pc.sigla} — {pc.nombre}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="modal-acciones" style={{ marginTop: 16 }}>
              <button className="btn-fantasma" onClick={nuevaValoracion}>＋ Nueva valoración</button>
              <button className="btn-primario" onClick={onCerrar}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ================= pestaña PACIENTES ================= */
function Pacientes({ notificar }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState([])
  const [modal, setModal] = useState(false)
  const [ficha, setFicha] = useState(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = supabase.from('pacientes')
        .select('id, nombres, apellidos, documento, telefono, eps(nombre)')
        .order('creado_en', { ascending: false }).limit(25)
      if (q.length >= 2)
        query = query.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,documento.ilike.%${q}%`)
      const { data } = await query
      setLista(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <>
      <h1 className="titulo-seccion">Pacientes</h1>
      <p className="subtitulo">{q ? 'Resultados de búsqueda' : 'Los más recientes primero'}</p>
      <div className="buscador">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
        <input placeholder="Buscar por nombre o cédula…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="pila">
        {lista.map(p => (
          <button className="pac-item pac-click" key={p.id} onClick={() => setFicha(p)}>
            <div>
              <b>{p.nombres} {p.apellidos}</b>
              <div className="doc">{p.documento}{p.telefono ? ` · ${p.telefono}` : ''}</div>
            </div>
            {p.eps?.nombre && <span className="chip-eps">{p.eps.nombre}</span>}
          </button>
        ))}
      </div>
      <button className="fab" aria-label="Nuevo paciente" onClick={() => setModal(true)}>+</button>
      {modal && <NuevoPaciente onCerrar={() => setModal(false)} onCreado={() => { setModal(false); setQ(''); notificar('Paciente registrado ✓') }} />}
      {ficha && <FichaPaciente paciente={ficha} notificar={notificar} onCerrar={() => setFicha(null)} />}
    </>
  )
}

function NuevoPaciente({ onCerrar, onCreado }) {
  const [epsList, setEpsList] = useState([])
  const [f, setF] = useState({
    tipo_documento: 'TI', documento: '', nombres: '', apellidos: '',
    eps_id: '', telefono: '', acudiente_nombre: '', acudiente_telefono: '',
    crear_proceso: true
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('eps').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setEpsList(data || []))
  }, [])

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true); setError('')
    const { data: pac, error: err } = await supabase.from('pacientes').insert({
      tipo_documento: f.tipo_documento,
      documento: f.documento.trim(),
      nombres: f.nombres.trim().toUpperCase(),
      apellidos: f.apellidos.trim().toUpperCase(),
      eps_id: f.eps_id || null,
      telefono: f.telefono || null,
      acudiente_nombre: f.acudiente_nombre || null,
      acudiente_telefono: f.acudiente_telefono || null
    }).select().single()

    if (err) {
      setGuardando(false)
      setError(err.code === '23505'
        ? 'Ya existe un paciente con ese documento.'
        : 'No se pudo guardar: ' + err.message)
      return
    }
    if (f.crear_proceso) {
      await supabase.from('procesos').insert({
        paciente_id: pac.id, tipo: 'evaluacion', estado: 'NUEVO', fecha_inicio: hoy()
      })
    }
    setGuardando(false)
    onCreado()
  }

  return (
    <div className="modal-fondo" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>Nuevo paciente</h2>
        <form onSubmit={guardar}>
          <div className="fila-2">
            <label className="field">Tipo doc.
              <select value={f.tipo_documento} onChange={e => setF({ ...f, tipo_documento: e.target.value })}>
                <option value="TI">TI</option><option value="CC">CC</option>
                <option value="RC">RC</option><option value="CE">CE</option>
              </select>
            </label>
            <label className="field">Documento
              <input value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} required inputMode="numeric" />
            </label>
          </div>
          <label className="field">Nombres
            <input value={f.nombres} onChange={e => setF({ ...f, nombres: e.target.value })} required />
          </label>
          <label className="field">Apellidos
            <input value={f.apellidos} onChange={e => setF({ ...f, apellidos: e.target.value })} required />
          </label>
          <label className="field">EPS
            <select value={f.eps_id} onChange={e => setF({ ...f, eps_id: e.target.value })}>
              <option value="">— Seleccionar —</option>
              {epsList.map(e2 => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
            </select>
          </label>
          <label className="field">Teléfono de contacto
            <input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} inputMode="tel" />
          </label>
          <div className="fila-2">
            <label className="field">Acudiente
              <input value={f.acudiente_nombre} onChange={e => setF({ ...f, acudiente_nombre: e.target.value })} />
            </label>
            <label className="field">Tel. acudiente
              <input value={f.acudiente_telefono} onChange={e => setF({ ...f, acudiente_telefono: e.target.value })} inputMode="tel" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.crear_proceso} onChange={e => setF({ ...f, crear_proceso: e.target.checked })} />
            Crear proceso de evaluación (aparece en el tablero)
          </label>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-acciones">
            <button type="button" className="btn-fantasma" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar paciente'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ================= pestaña PROCESOS ================= */
const ESTADOS_ACTIVOS = ['NUEVO','PENDIENTE_DOCUMENTOS','PROGRAMADO','EN_EVALUACION','APLICACION_TERMINADA','PENDIENTE_INFORME','INFORME_EN_ELABORACION','EN_REVISION','INFORME_ENTREGADO','PENDIENTE_FACTURACION','FACTURADO']

function Procesos({ notificar }) {
  const [lista, setLista] = useState(null)
  const [estados, setEstados] = useState([])

  const cargar = useCallback(async () => {
    const [{ data: procs }, { data: est }] = await Promise.all([
      supabase.from('procesos')
        .select('id, tipo, estado, fecha_inicio, pacientes(nombres, apellidos)')
        .in('estado', ESTADOS_ACTIVOS)
        .order('fecha_inicio', { ascending: false }).limit(60),
      supabase.from('estados_proceso').select('codigo, nombre, orden').order('orden')
    ])
    setLista(procs || []); setEstados(est || [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cambiarEstado = async (proc, nuevo) => {
    setLista(l => l.map(x => x.id === proc.id ? { ...x, estado: nuevo } : x))
    const { error } = await supabase.from('procesos').update({ estado: nuevo }).eq('id', proc.id)
    if (error) { notificar('No se pudo cambiar el estado'); cargar() }
    else notificar('Estado actualizado ✓')
  }

  const ESTADOS_INFORME = ['PENDIENTE_INFORME', 'INFORME_EN_ELABORACION', 'EN_REVISION']
  const enInforme = (lista || []).filter(p => ESTADOS_INFORME.includes(p.estado))
  const resto = (lista || []).filter(p => !ESTADOS_INFORME.includes(p.estado))

  const FilaProceso = ({ p, destacada }) => (
    <div className={'pac-item' + (destacada ? ' fila-informe' : '')} style={{ flexWrap: 'wrap' }}>
      <div style={{ minWidth: 160 }}>
        <b>{p.pacientes?.nombres} {p.pacientes?.apellidos}</b>
        <div className="doc">{p.tipo} · desde {p.fecha_inicio}</div>
      </div>
      <select value={p.estado} onChange={e => cambiarEstado(p, e.target.value)} style={{ maxWidth: 230 }}>
        {estados.map(e2 => <option key={e2.codigo} value={e2.codigo}>{e2.nombre}</option>)}
      </select>
    </div>
  )

  return (
    <>
      <h1 className="titulo-seccion">Procesos</h1>
      <p className="subtitulo">Cambia el estado y se refleja en el tablero Kanban</p>
      {lista === null ? <div className="cargando">Cargando…</div> : (
        <>
          <div className="seccion-header">
            <h2 className="ficha-titulo" style={{ fontSize: 16, margin: '4px 0 8px' }}>📝 Informes pendientes {enInforme.length > 0 && `(${enInforme.length})`}</h2>
          </div>
          {enInforme.length === 0
            ? <div className="vacio" style={{ padding: '16px' }}>Ningún informe pendiente. 🎉</div>
            : <div className="pila">{enInforme.map(p => <FilaProceso key={p.id} p={p} destacada />)}</div>}

          <h2 className="ficha-titulo" style={{ fontSize: 16, margin: '22px 0 8px' }}>Otros procesos activos</h2>
          {resto.length === 0
            ? <div className="vacio" style={{ padding: '16px' }}>Sin otros procesos activos.</div>
            : <div className="pila">{resto.map(p => <FilaProceso key={p.id} p={p} />)}</div>}
        </>
      )}
    </>
  )
}

/* ================= pestaña TIENDA (juguetes cognitivos) ================= */
function Ventas({ notificar }) {
  const [lista, setLista] = useState(null)
  const [modal, setModal] = useState(false)

  const inicioMes = () => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('ventas')
      .select('*, pacientes(nombres, apellidos)')
      .gte('fecha', inicioMes())
      .order('fecha', { ascending: false })
    setLista(data || [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const eliminar = async (v) => {
    if (!window.confirm(`¿Eliminar la venta "${v.descripcion}" por ${pesos(v.valor)}?`)) return
    const { error } = await supabase.from('ventas').delete().eq('id', v.id)
    if (!error) { notificar('Venta eliminada'); cargar() }
  }

  const total = (lista || []).reduce((s, v) => s + Number(v.valor), 0)

  return (
    <>
      <h1 className="titulo-seccion">Tienda</h1>
      <p className="subtitulo">Juguetes cognitivos · {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</p>

      <div className="total-banner" style={{ background: 'linear-gradient(135deg, var(--ambar) 0%, #A5651F 100%)' }}>
        <div className="detalle">{(lista || []).length} venta{(lista || []).length !== 1 && 's'} este mes</div>
        <div className="cifra">{pesos(total)}</div>
        <div className="detalle">en juguetes cognitivos</div>
      </div>

      {lista === null ? <div className="cargando">Cargando…</div> : (
        <div className="pila" style={{ marginTop: 16 }}>
          {lista.map(v => (
            <div className="cobrar-item" key={v.id}>
              <div>
                <b>{v.descripcion}</b>
                <div className="auto-meta">
                  {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · {v.metodo}
                  {v.pacientes && <> · {v.pacientes.nombres} {v.pacientes.apellidos}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="monto">{pesos(v.valor)}</div>
                <button className="btn-menos" aria-label="Eliminar venta" onClick={() => eliminar(v)}>×</button>
              </div>
            </div>
          ))}
          {lista.length === 0 && <div className="vacio"><b>Sin ventas este mes</b>Registra la primera con el botón naranja +</div>}
        </div>
      )}
      <button className="fab" aria-label="Nueva venta" onClick={() => setModal(true)}>+</button>
      {modal && <NuevaVenta onCerrar={() => setModal(false)} onCreada={() => { setModal(false); cargar(); notificar('Venta registrada ✓') }} />}
    </>
  )
}

function NuevaVenta({ onCerrar, onCreada }) {
  const [paciente, setPaciente] = useState(null)
  const [conPaciente, setConPaciente] = useState(false)
  const [f, setF] = useState({ descripcion: '', valor: '', metodo: 'Efectivo' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('ventas').insert({
      descripcion: f.descripcion.trim(),
      valor: Number(f.valor),
      metodo: f.metodo,
      paciente_id: conPaciente && paciente ? paciente.id : null,
      fecha: hoy()
    })
    setGuardando(false)
    if (err) setError('No se pudo registrar: ' + err.message)
    else onCreada()
  }

  return (
    <div className="modal-fondo" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>Nueva venta</h2>
        <form onSubmit={guardar}>
          <label className="field">¿Qué se vendió?
            <input value={f.descripcion} placeholder="Ej: Tangram madera, memorama animales…"
              onChange={e => setF({ ...f, descripcion: e.target.value })} required autoFocus />
          </label>
          <div className="fila-2">
            <label className="field">Valor
              <input type="number" step="500" min="500" value={f.valor}
                onChange={e => setF({ ...f, valor: e.target.value })} required inputMode="numeric" />
            </label>
            <label className="field">Método
              <select value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>
                {METODOS_PAGO.map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={conPaciente} onChange={e => setConPaciente(e.target.checked)} />
            El comprador es un paciente
          </label>
          {conPaciente && <BuscadorPaciente elegido={paciente} onElegir={setPaciente} />}
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-acciones">
            <button type="button" className="btn-fantasma" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar venta'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ================= shell ================= */
const TABS = [
  { id: 'auto', label: 'Sesiones', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> },
  { id: 'cobrar', label: 'Cobrar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  { id: 'pac', label: 'Pacientes', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { id: 'proc', label: 'Procesos', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg> },
  { id: 'venta', label: 'Tienda', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
]

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [tab, setTab] = useState('auto')
  const [toast, setToast] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const notificar = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  if (sesion === undefined) return <div className="cargando" style={{ paddingTop: 80 }}>Cargando…</div>
  if (!sesion) return <Login onListo={() => {}} />

  return (
    <>
      <header className="topbar">
        <div className="brand">NeuroExplora</div>
        <button className="salir" onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      <nav className="tabs" aria-label="Secciones">
        {TABS.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' activa' : '')} onClick={() => setTab(t.id)}>
            {t.icon}{t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'auto' && <Autorizaciones notificar={notificar} />}
        {tab === 'cobrar' && <ParaCobrar notificar={notificar} />}
        {tab === 'pac' && <Pacientes notificar={notificar} />}
        {tab === 'proc' && <Procesos notificar={notificar} />}
        {tab === 'venta' && <Ventas notificar={notificar} />}
      </main>
      <Toast msg={toast} />
    </>
  )
}
