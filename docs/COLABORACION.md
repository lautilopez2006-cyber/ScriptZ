# Colaboración en tiempo real

## Cómo funciona
- Una persona ejecuta el servidor incluido. Es un solo archivo de Node.js 18+, sin dependencias.
- Desde ScriptZ, el dueño comparte el guion y recibe tres invitaciones:
  - **Editor:** puede escribir.
  - **Lector (en la app):** ve los cambios en vivo, sin editar.
  - **Enlace de lectura:** una página web que cualquiera abre en el navegador.
- Cada persona ve los cursores de las demás.
- Si se corta la conexión podés seguir escribiendo: los cambios se fusionan al reconectar.

## En la misma red (oficina, casa)
```bash
node server/collab-server.mjs
```
En Windows: `INICIAR_SERVIDOR_COLABORACION.bat`. En ScriptZ usá `ws://IP-DE-ESA-COMPUTADORA:4735`.

## Por Internet
- Publicá el servidor en cualquier VPS o servicio que ejecute Node, detrás de HTTPS.
- Usá `--cert` y `--key`, o un proxy como Caddy o Nginx.
- Conectate con `wss://tu-dominio`.

```bash
node server/collab-server.mjs --port 4735 --host 0.0.0.0 --data /var/lib/scriptz
```

## Seguridad
- Cada sala tiene tokens aleatorios y distintos para dueño, editor y lector.
- El servidor guarda las salas en la carpeta `--data` y no envía nada a terceros.
- Las invitaciones dan acceso al guion: compartilas solo con tu equipo.

## Conflictos
- ScriptZ usa transformación operacional (el mismo principio que Google Docs).
- Si dos personas escriben a la vez en el mismo párrafo, se conservan los dos textos.
- Si una borra un párrafo mientras otra agrega uno al lado, el orden queda igual en todas las pantallas.
- Cada cambio se verifica con una huella del documento. Si alguna vez no coincide, el cliente se resincroniza solo.
