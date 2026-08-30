# API-RESILIENCE — reintentos y circuit breakers

```typescript
import { withRetry, isRetryableError, CircuitBreaker } from "@johpaz/hive-sdk/resilience";
```

## Reintentos

```typescript
const res = await withRetry(
  () => llamarAlProveedor(),
  { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
  (err) => isRetryableError(err),
);
```

`isRetryableError` distingue lo que mejora reintentando —429, 5xx, timeouts,
cortes de red— de lo que no. **Un 400 no mejora reintentando**: el cuerpo está
mal y volver a mandarlo igual sólo gasta una llamada. Lo mismo con 401 y 403.

El backoff es exponencial con jitter, y respeta el `Retry-After` cuando el
proveedor lo manda: si te dicen cuánto esperar, discutirlo es contraproducente.

`computeRetryDelay(intento, policy)` calcula la espera si necesitas programarla
por tu cuenta.

## Circuit breakers

```typescript
const breaker = new CircuitBreaker("proveedor-x", { failureThreshold: 5, resetTimeoutMs: 30000 });
const r = await breaker.execute(() => llamar());
```

Cuando un servicio ya viene fallando, seguir intentando le agrega carga y te
gasta el presupuesto de reintentos. El breaker corta: tras N fallos se abre y
rechaza sin llamar, hasta que pasa el tiempo de reposo y deja pasar una de
prueba.

`CircuitBreakerOpenError` lleva `retryAfterMs`, que es lo que necesita quien
quiera decirle al usuario cuándo volver a intentar.

`circuitBreakerRegistry` mantiene uno por nombre, para no crear un breaker nuevo
en cada llamada y perder el estado que le da sentido.

*Documentación Hive SDK — ver `version` en package.json*
