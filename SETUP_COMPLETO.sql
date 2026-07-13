-- ================================================================
-- NEUROEXPLORA APP — CONFIGURACIÓN COMPLETA (un solo script)
-- Ejecutar UNA vez en Supabase SQL Editor. Es seguro re-ejecutarlo.
-- Incluye: autorizaciones, pagos, terapia continua, tarifas
-- Monte Sinaí, seguridad (RLS), trigger Kanban y vistas.
-- ================================================================

-- ---------- 1. Tarifas Monte Sinaí ----------
ALTER TABLE tarifas ALTER COLUMN eps_id DROP NOT NULL;

INSERT INTO tarifas (servicio_id, clinica_id, valor, valor_profesional, vigente_desde)
SELECT s.id, c.id, v.valor, v.valor, '2026-01-01'
FROM (VALUES
  ('Entrevista Inicial', 45000),
  ('Prueba Neuropsicológica', 77000)
) AS v(servicio, valor)
JOIN servicios s ON s.nombre = v.servicio
JOIN clinicas c ON c.nombre = 'Monte Sinaí'
WHERE NOT EXISTS (
  SELECT 1 FROM tarifas t
  WHERE t.servicio_id = s.id AND t.clinica_id = c.id AND t.eps_id IS NULL
);

-- ---------- 2. Autorizaciones (Monte Sinaí y planes particulares) ----------
CREATE TABLE IF NOT EXISTS autorizaciones (
  id                  uuid primary key default gen_random_uuid(),
  paciente_id         uuid not null references pacientes(id),
  proceso_id          uuid references procesos(id),
  clinica_id          int references clinicas(id),
  eps_id              int references eps(id),
  numero_autorizacion text,
  sesiones_autorizadas int,                        -- NULL = terapia continua
  sesiones_ejecutadas  int not null default 0,
  valor_por_sesion     numeric(12,2) not null default 77000,
  incluye_primera_vez  boolean not null default false,
  fecha_autorizacion   date,
  fecha_vencimiento    date,
  estado              text not null default 'activa'
                      check (estado in ('activa','completada','vencida','cancelada')),
  observaciones       text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
ALTER TABLE autorizaciones ALTER COLUMN sesiones_autorizadas DROP NOT NULL;

-- ---------- 3. Pagos / abonos ----------
CREATE TABLE IF NOT EXISTS pagos (
  id              uuid primary key default gen_random_uuid(),
  autorizacion_id uuid not null references autorizaciones(id),
  paciente_id     uuid references pacientes(id),
  fecha           date not null default current_date,
  valor           numeric(12,2) not null check (valor > 0),
  metodo          text not null default 'Efectivo'
                  check (metodo in ('Nequi','Efectivo','Transferencia','Daviplata','Tarjeta')),
  nota            text,
  creado_en       timestamptz not null default now()
);

-- ---------- 4. Seguridad (Row Level Security) ----------
-- La API solo responde a usuarios logueados. NocoDB y n8n no se
-- afectan (entran como postgres, dueño de las tablas).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pacientes','procesos','sesiones','autorizaciones','pagos','informes',
    'cuentas_cobro','items_cuenta','tareas','documentos','remisiones',
    'aplicaciones_prueba','pagos_profesionales','eps','clinicas',
    'profesionales','servicios','tarifas','pruebas','cie10',
    'estados_proceso','especialistas_externos','auditoria'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS app_autenticados ON %I', t);
    EXECUTE format(
      'CREATE POLICY app_autenticados ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ---------- 5. Trigger: estado ↔ Kanban siempre sincronizados ----------
CREATE OR REPLACE FUNCTION fn_sync_estado_kanban() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT nombre INTO NEW.estado_kanban
  FROM estados_proceso WHERE codigo = NEW.estado;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_sync_kanban ON procesos;
CREATE TRIGGER tr_sync_kanban
  BEFORE INSERT OR UPDATE OF estado ON procesos
  FOR EACH ROW EXECUTE FUNCTION fn_sync_estado_kanban();

-- ---------- 6. Vista: qué cobrar a Monte Sinaí ----------
DROP VIEW IF EXISTS v_listo_para_cobrar;
CREATE VIEW v_listo_para_cobrar AS
SELECT
  a.id,
  c.nombre                           AS clinica,
  p.nombres || ' ' || p.apellidos    AS paciente,
  p.documento,
  e.nombre                           AS eps,
  a.numero_autorizacion,
  a.sesiones_autorizadas,
  a.sesiones_ejecutadas,
  a.sesiones_autorizadas - a.sesiones_ejecutadas AS sesiones_pendientes,
  a.valor_por_sesion,
  a.sesiones_ejecutadas * a.valor_por_sesion AS valor_a_cobrar,
  CASE WHEN a.incluye_primera_vez
       THEN a.sesiones_ejecutadas * a.valor_por_sesion + 45000
       ELSE a.sesiones_ejecutadas * a.valor_por_sesion
  END                                AS valor_total_con_primera_vez,
  CASE WHEN a.sesiones_ejecutadas >= a.sesiones_autorizadas
       THEN 'LISTO PARA COBRAR'
       ELSE 'EN PROGRESO (' || a.sesiones_ejecutadas || '/' || a.sesiones_autorizadas || ')'
  END                                AS estado_cobro,
  a.estado,
  a.fecha_vencimiento
FROM autorizaciones a
JOIN pacientes p ON p.id = a.paciente_id
LEFT JOIN eps e ON e.id = a.eps_id
LEFT JOIN clinicas c ON c.id = a.clinica_id
WHERE a.estado = 'activa'
  AND a.sesiones_autorizadas IS NOT NULL
ORDER BY a.sesiones_ejecutadas >= a.sesiones_autorizadas DESC, p.apellidos;

-- ---------- 7. Vista: saldos pendientes del consultorio ----------
DROP VIEW IF EXISTS v_saldos_consultorio;
CREATE VIEW v_saldos_consultorio AS
SELECT
  a.id,
  p.nombres || ' ' || p.apellidos AS paciente,
  p.documento,
  a.numero_autorizacion           AS concepto,
  a.sesiones_autorizadas,
  a.sesiones_ejecutadas,
  COALESCE(a.sesiones_autorizadas, a.sesiones_ejecutadas) * a.valor_por_sesion
    + CASE WHEN a.incluye_primera_vez THEN 45000 ELSE 0 END AS valor_plan,
  COALESCE((SELECT SUM(valor) FROM pagos pg WHERE pg.autorizacion_id = a.id), 0) AS abonado,
  COALESCE(a.sesiones_autorizadas, a.sesiones_ejecutadas) * a.valor_por_sesion
    + CASE WHEN a.incluye_primera_vez THEN 45000 ELSE 0 END
    - COALESCE((SELECT SUM(valor) FROM pagos pg WHERE pg.autorizacion_id = a.id), 0) AS saldo
FROM autorizaciones a
JOIN pacientes p ON p.id = a.paciente_id
JOIN clinicas c ON c.id = a.clinica_id
WHERE c.nombre <> 'Monte Sinaí'
  AND a.estado = 'activa'
  AND COALESCE(a.sesiones_autorizadas, a.sesiones_ejecutadas) * a.valor_por_sesion
    + CASE WHEN a.incluye_primera_vez THEN 45000 ELSE 0 END
    - COALESCE((SELECT SUM(valor) FROM pagos pg WHERE pg.autorizacion_id = a.id), 0) > 0
ORDER BY saldo DESC;

GRANT SELECT ON v_listo_para_cobrar TO authenticated;
GRANT SELECT ON v_saldos_consultorio TO authenticated;

-- ---------- Verificación final ----------
SELECT 'Tablas con seguridad RLS' AS resultado, count(*)::text AS valor
  FROM pg_tables WHERE schemaname='public' AND rowsecurity = true
UNION ALL
SELECT 'Tarifas Monte Sinaí',
  (SELECT count(*)::text FROM tarifas t JOIN clinicas c ON c.id=t.clinica_id WHERE c.nombre='Monte Sinaí')
UNION ALL
SELECT 'Trigger Kanban',
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_sync_kanban') THEN 'activo ✓' ELSE 'FALTA' END
UNION ALL
SELECT 'Planes abiertos (terapia continua)',
  (SELECT CASE WHEN is_nullable='YES' THEN 'habilitados ✓' ELSE 'NO' END
   FROM information_schema.columns
   WHERE table_name='autorizaciones' AND column_name='sesiones_autorizadas');

-- ---------- 8. Ventas de juguetes cognitivos (tienda) ----------
CREATE TABLE IF NOT EXISTS ventas (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default current_date,
  descripcion text not null,
  valor       numeric(12,2) not null check (valor > 0),
  metodo      text not null default 'Efectivo'
              check (metodo in ('Nequi','Efectivo','Transferencia','Daviplata','Tarjeta')),
  paciente_id uuid references pacientes(id),   -- opcional: si el comprador es paciente
  nota        text,
  creado_en   timestamptz not null default now()
);

ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_autenticados ON ventas;
CREATE POLICY app_autenticados ON ventas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 8. Ventas de juguetes cognitivos ----------
CREATE TABLE IF NOT EXISTS ventas (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default current_date,
  producto       text not null,
  valor          numeric(12,2) not null check (valor > 0),
  metodo         text not null default 'Efectivo'
                 check (metodo in ('Nequi','Efectivo','Transferencia','Daviplata','Tarjeta')),
  paciente_id    uuid references pacientes(id),   -- opcional: si el comprador es paciente
  cliente_nombre text,                             -- o un nombre libre si no lo es
  nota           text,
  creado_en      timestamptz not null default now()
);

ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_autenticados ON ventas;
CREATE POLICY app_autenticados ON ventas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
