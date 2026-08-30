# Cron — tareas programadas

Jobs recurrentes y de una sola vez, persistidos en HiveDB, que se ejecutan a
través del pipeline de agentes.

**Sin dependencias.** El motor de cron es propio (`scheduler/cron/`) y usa sólo
`setTimeout` e `Intl` del runtime de Bun. Hasta 0.2.0 era `croner`.

```typescript
import { CronScheduler, Cron, parseCronExpression } from "@johpaz/hive-sdk/scheduler";
```

## Por qué un motor propio y no `Bun.cron()`

Bun 1.4 trae `Bun.cron()` nativo y la pregunta se repite, así que acá está la
respuesta medida contra el runtime instalado (1.4.0). `Bun.cron` **no alcanza**
para lo que este scheduler ya expone y persiste en `CronJobDoc`:

| Lo que hace falta | `Bun.cron` 1.4.0 |
|---|---|
| 6 campos (con segundos) | Falla: *"seconds are not supported"* |
| Fecha ISO como patrón — así se agendan los `one_shot` | La rechaza: espera 5 campos |
| Zona horaria | `parse()` ignora `{ timezone }`: no cambia el resultado ni da error |
| `nextRun()` — de ahí sale `next_run_at` | El handle es `{ cron, ref, stop, unref }` |
| `pause()` / `resume()` | No existen |
| `protect`, `maxRuns`, `interval`, `startAt`/`stopAt`, `domAndDow` | Sin equivalente |
| Tipos | No está en `@types/bun` (1.3.13) |

Sin fecha ISO no hay jobs de una sola vez, y sin zona horaria "todos los días a
las 9" significa las 9 UTC para todo el mundo. Por eso el motor es propio: la
meta era **cero dependencias**, no *usar `Bun.cron` a cualquier precio*.

Vale la pena volver a mirarlo cuando `Bun.cron` tenga zona horaria y next-run.

---

## Crear un job

```typescript
const scheduler = new CronScheduler(async (job) => {
  // Acá corre lo tuyo. Devolver { success } decide si cuenta como corrida o error.
  return { success: true, response: "listo" };
});

await scheduler.boot();   // carga los jobs activos de la BD y detecta los perdidos

const { id, nextRun } = await scheduler.create({
  name: "Reporte diario",
  task: "Generá el reporte de ventas de ayer",
  task_type: "recurring",
  cron_expression: "0 9 * * 1-5",
  timezone: "America/Bogota",
});
```

Para una sola vez, `task_type: "one_shot"` con `fire_at` en ISO 8601. Debe estar
en el futuro; si no, `create` lo rechaza.

## Expresiones

5 campos, o 6 poniendo los segundos adelante:

```
┌───────── segundos (0-59)  ← opcional
│ ┌─────── minuto (0-59)
│ │ ┌───── hora (0-23)
│ │ │ ┌─── día del mes (1-31)
│ │ │ │ ┌─ mes (1-12 o JAN-DEC)
│ │ │ │ │ ┌ día de semana (0-7 o SUN-SAT, 0 y 7 = domingo)
* * * * * *
```

Acepta `*`, `?` (igual que `*`), listas `1,15`, rangos `1-5`, pasos `*/2`,
`1-9/3` y `5/15`, nombres de mes y de día, y rangos que dan la vuelta (`22-2` en
horas = 22, 23, 0, 1, 2).

| Expresión | Significado |
|---|---|
| `0 9 * * *` | Todos los días a las 9:00 |
| `0 7 * * 1-5` | Lunes a viernes a las 7:00 |
| `0 */2 * * *` | Cada 2 horas |
| `0 0 1 * *` | El 1 de cada mes |
| `*/30 * * * * *` | Cada 30 segundos |

Un error de sintaxis dice **qué campo** falló, porque ese mensaje termina en la
respuesta de `cron.create` y lo lee quien se equivocó al escribirla:

```
campo horas: 25 fuera de rango 0-23 (en "0 25 * * *")
```

## Opciones del job

| Campo | Qué hace |
|---|---|
| `timezone` | Zona IANA en la que se lee la expresión. Obligatoria en la práctica |
| `protect` | No arranca una corrida si la anterior sigue en curso |
| `max_runs` | Deja de correr después de N corridas |
| `interval_sec` | Piso de segundos entre arranques, además de la expresión |
| `start_at` / `stop_at` | Ventana: no corre antes / después de esas fechas |
| `dom_and_dow` | Exige día del mes **y** de semana, en vez de cualquiera de los dos |
| `misfire_policy` | Qué hacer con lo que se perdió mientras el proceso estaba caído |

### `dom_and_dow`

El cron clásico usa **O** cuando los dos campos de día están restringidos:
`0 9 15 * 1` es "los 15 **o** los lunes". Con `dom_and_dow: true` pasa a ser
"los 15 **que sean** lunes". No es un detalle: la diferencia entre las dos
lecturas es de ~4 corridas por mes a 1 cada varios meses.

### `misfire_policy`

Si el proceso estuvo caído cuando tocaba correr, al arrancar `boot()` lo detecta:

- `skip` (por defecto) — se anota y se sigue con la próxima.
- `fire_once` — se corre una vez ahora, si el atraso entra en `misfire_grace_min`.

Un `one_shot` que se perdió y no se pone al día pasa a `failed`: su `fire_at` ya
pasó y no puede volver a ocurrir, así que dejarlo activo sería un job zombi.

## Zona horaria y horario de verano

La expresión se lee contra **el reloj de pared de la zona del job**, no contra
UTC ni contra la zona del servidor. "Todos los días a las 9" en Bogotá son las
14:00Z, y en Madrid cambia dos veces al año.

Los dos casos raros están resueltos, y no de forma arbitraria:

- **La hora que no existe.** Cuando el reloj se adelanta, salta de 01:59 a
  03:00: un job de las 2:30 no tiene cuándo correr ese día. **Se saltea ese día**
  en vez de correr a una hora inventada.
- **La hora que ocurre dos veces.** Cuando el reloj se atrasa, las 2:30 pasan
  dos veces. **Corre en la primera**, una sola vez.

## Usar el motor suelto

Sirve sin montar un scheduler — por ejemplo para que una UI muestre las próximas
corridas mientras la persona escribe la expresión:

```typescript
import { Cron, isValidCronExpression, parseCronExpression } from "@johpaz/hive-sdk/scheduler";

isValidCronExpression("0 9 * * *");   // true

const c = new Cron("0 9 * * 1-5", { timezone: "America/Bogota" });
c.nextRun();       // Date de la próxima corrida
c.nextRuns(5);     // las próximas cinco

// Con función, se agenda de verdad
const job = new Cron("*/30 * * * * *", { protect: true }, async () => {
  await hacerAlgo();
});
job.pause(); job.resume(); job.trigger(); job.stop();
```

`new Cron(expr)` **sin función no agenda nada**: es la forma de validar una
expresión sin dejar un timer suelto.

## Contadores y auto-pausa

Cada corrida deja una fila en `taskRuns` y actualiza `run_count` / `error_count`
del job. A los **5 errores seguidos** el job se auto-pausa: un job roto no debe
reintentar para siempre.

Los incrementos se calculan dentro del reintento por conflicto de versión, no
antes. Con dos corridas solapadas —normal en un job que tarda más que su
intervalo y no declara `protect`— calcularlos afuera hace que una escritura se
pierda, y entonces el umbral de auto-pausa no se alcanza nunca.

## Limpieza

`runCleanup()` corre sola como job interno: borra corridas de más de 30 días,
cancela los `one_shot` completados hace más de 7, deja como mucho las últimas
1000 corridas por job, y expira los artefactos vencidos.

## API

**`CronScheduler`** — `boot` · `create` · `update` · `delete` · `pause` ·
`resume` · `trigger` · `activate` · `deactivate` · `getStatus` · `getTask` ·
`listTasks` · `getHistory` · `runCleanup` · `shutdown`

**Motor** — `Cron` · `parseCronExpression` · `isValidCronExpression` ·
`nextOccurrence` · `toWallClock` · `toInstant` · `assertTimeZone`

Para el CRUD desde una UI, sin manejar el scheduler a mano, ver
[API-SERVICES.md](./API-SERVICES.md) (`createCronJob`, `listCronJobs`, …).

*Documentación Hive SDK — ver `version` en package.json*
